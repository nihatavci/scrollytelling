// js/scene3d.js — Public Scene3D renderer.
// Lazy-loaded by render.js only when a Scene3D block exists.
// Exports: initScene3D(blockId, data), dispose(blockId)

// esm.sh resolves the addons' internal bare `import ... from 'three'`; jsDelivr does not.
const _CDN = 'https://esm.sh/three@0.170.0';
const _active = new Map(); // blockId → { dispose }

let _libPromise = null;
async function _loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(_CDN);
    const { GLTFLoader } = await import(`${_CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${_CDN}/examples/jsm/loaders/STLLoader.js`);
    const { DRACOLoader } = await import(`${_CDN}/examples/jsm/loaders/DRACOLoader.js`);
    const { KTX2Loader } = await import(`${_CDN}/examples/jsm/loaders/KTX2Loader.js`);
    const { MeshoptDecoder } = await import(`${_CDN}/examples/jsm/libs/meshopt_decoder.module.js`);
    return { THREE, GLTFLoader, STLLoader, DRACOLoader, KTX2Loader, MeshoptDecoder };
  })();
  return _libPromise;
}

// Build a GLTFLoader wired with Draco + Meshopt + KTX2 decoders.
function _makeGltfLoader(lib, renderer) {
  const loader = new lib.GLTFLoader();
  const draco = new lib.DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(lib.MeshoptDecoder);
  try {
    const ktx2 = new lib.KTX2Loader().setTranscoderPath(`${_CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  } catch (_) { /* KTX2 optional */ }
  return loader;
}

export async function initScene3D(blockId, data) {
  const sec = document.getElementById(`scene3d-${blockId}`);
  if (!sec) return;
  const canvas = sec.querySelector('.scene3d-canvas');
  const loaderEl = sec.querySelector('.scene3d-loader');
  if (!canvas) return;

  // If this block already has a live renderer (e.g. admin soft-refresh re-rendered
  // it), tear the old one down first to avoid leaking WebGL contexts.
  if (_active.has(blockId)) { try { _active.get(blockId).disposeAll(); } catch (_) {} }

  const scenes = (data.scenes || []).filter(Boolean);
  if (!data.glbUrl) return;
  // If no scenes saved yet, show the model statically with a sensible default
  // camera so it's visible in the preview before the editor saves viewpoints.
  const DEFAULT_SCENE = { camera: { x: 1.6, y: 1.2, z: 3.2 }, target: { x: 0, y: 0, z: 0 }, fov: 45 };
  const hasScenes = scenes.length > 0;

  const lib = await _loadThree();
  const { THREE, STLLoader } = lib;

  // ── Renderer ──
  const isMobile = window.innerWidth < 768;
  // alpha:true → the CSS gradient on .scene3d-sticky shows through behind the model.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  // ── Scene + lights ──
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // ── Camera ──
  const s0 = scenes[0] || DEFAULT_SCENE;
  const camera = new THREE.PerspectiveCamera(s0.fov || 45, canvas.clientWidth / (canvas.clientHeight || 1), 0.01, 1000);
  camera.position.set(s0.camera.x, s0.camera.y, s0.camera.z);
  const target = new THREE.Vector3(s0.target.x, s0.target.y, s0.target.z);
  camera.lookAt(target);

  // ── Resize helper ──
  function resize() {
    const w = canvas.clientWidth, h = Math.max(canvas.clientHeight, 1);
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // ── Load model — GLB/GLTF via GLTFLoader, STL via STLLoader (geometry → mesh) ──
  const isSTL = /\.stl(\?|$)/i.test(data.glbUrl);
  let model;
  // Flowing text controller (flow mode only). Declared early to avoid TDZ in
  // tweenCamera's step, the ResizeObserver, and disposeAll, which all reference it.
  let flow = null;
  try {
    if (isSTL) {
      const geo = await new Promise((res, rej) => new STLLoader().load(data.glbUrl, res, undefined, rej));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.1, roughness: 0.65 });
      model = new THREE.Mesh(geo, mat);
    } else {
      const gltf = await new Promise((res, rej) => _makeGltfLoader(lib, renderer).load(data.glbUrl, res, undefined, rej));
      model = gltf.scene;
    }
  } catch (err) {
    console.error('[Scene3D] model load failed:', err);
    if (loaderEl) loaderEl.style.display = 'none';
    return;
  }

  // Auto-normalise: scale model into a 2-unit bounding box, centred at origin
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scale = 2 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
  }
  scene.add(model);

  // Show canvas, hide loader. Paint twice across frames so the first frame
  // always lands on the transparent canvas regardless of layout timing.
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(() => { resize(); renderer.render(scene, camera); });
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';

  // Flowing text (pretext) — only in flow mode.
  if (data.textMode === 'flow') {
    const textCanvas = sec.querySelector('.scene3d-text-canvas');
    if (textCanvas && !(window.matchMedia && window.matchMedia('(max-width:767px),(prefers-reduced-motion: reduce)').matches)) {
      import('./scene3d-flow.js').then(async (FM) => {
        if (!FM.flowSupported()) return; // fallback CSS shows
        const MARGINS = { tight: 16, normal: 56, wide: 110 };
        const PLATES = { none: 0, subtle: 0.72, solid: 0.92 };
        const isDark = data.bg === 'dark';
        const sceneText = (i) => (scenes[i] && scenes[i].flowText) || data.flowText || '';
        flow = await FM.createFlowText({
          THREE, textCanvas,
          getCamera: () => camera, getModel: () => model,
          getColor: () => (isDark ? '#f4f4f5' : '#111'),
          text: sceneText(currentIdx), columns: data.flowColumns || 2,
          margin: MARGINS[data.flowMargin] != null ? MARGINS[data.flowMargin] : MARGINS.normal,
          plate: PLATES[data.flowPlate] != null ? PLATES[data.flowPlate] : PLATES.subtle,
          plateColor: isDark ? '#16161a' : '#f8f8f8',
        });
        if (flow) {
          const fit = () => { flow.resize(textCanvas.clientWidth, textCanvas.clientHeight, Math.min(window.devicePixelRatio||1, 2)); flow.relayout(); };
          fit();
        }
      }).catch(() => {});
    }
  }

  // currentIdx is read by updateAnnotations() below; declare before first use.
  let currentIdx = 0;

  // ── Annotations: build dots, map slot index → dense scene index ──
  const annoLayer = sec.querySelector('.scene3d-annotations');
  const _raycaster = new THREE.Raycaster();
  const _v = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const annoEls = [];
  if (annoLayer && Array.isArray(data.annotations)) {
    // slot index (as stored) → dense index (matches currentIdx)
    const slotToDense = {};
    let dense = 0;
    (data.scenes || []).forEach((s, slot) => { if (s) slotToDense[slot] = dense++; });
    data.annotations.forEach((a, i) => {
      const denseScene = slotToDense[a.scene];
      if (denseScene == null) return; // its scene slot is empty/removed
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's3d-anno';
      btn.innerHTML = `<span class="s3d-anno-dot">${i + 1}</span><span class="s3d-anno-label"></span>`;
      btn.querySelector('.s3d-anno-label').textContent = a.label || '';
      // Labels stay open while their dot is visible (auto-open per active scene).
      annoLayer.appendChild(btn);
      annoEls.push({ btn, point: new THREE.Vector3(a.point.x, a.point.y, a.point.z), denseScene });
    });
  }

  function updateAnnotations() {
    if (!annoEls.length) return;
    const rect = canvas.getBoundingClientRect();
    const camDist = camera.position;
    for (const an of annoEls) {
      if (an.denseScene !== currentIdx) { an.btn.classList.remove('is-visible', 'is-open'); continue; }
      _v.copy(an.point).project(camera);
      if (_v.z > 1) { an.btn.classList.remove('is-visible'); continue; }
      // Occlusion: is the model in front of the point along the camera ray?
      _dir.copy(an.point).sub(camDist);
      const pointDist = _dir.length();
      _raycaster.set(camDist, _dir.normalize());
      const hits = model ? _raycaster.intersectObject(model, true) : [];
      if (hits.length && hits[0].distance < pointDist - 0.02) { an.btn.classList.remove('is-visible'); continue; }
      const left = (_v.x * 0.5 + 0.5) * rect.width;
      const top = (-_v.y * 0.5 + 0.5) * rect.height;
      an.btn.style.transform = `translate(${left}px,${top}px) translate(-50%,-50%)`;
      an.btn.classList.add('is-visible', 'is-open'); // auto-open label on its active scene
    }
  }

  updateAnnotations();
  requestAnimationFrame(updateAnnotations);

  // ── Tween state ──
  let tweenRaf = null;

  function tweenCamera(toScene, durationMs) {
    if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = null; }
    const fromPos = camera.position.clone();
    const fromTgt = target.clone();
    const fromFov = camera.fov;
    const toPos = new THREE.Vector3(toScene.camera.x, toScene.camera.y, toScene.camera.z);
    const toTgt = new THREE.Vector3(toScene.target.x, toScene.target.y, toScene.target.z);
    const toFov = toScene.fov || 45;
    const t0 = performance.now();

    function step(now) {
      const p = Math.min((now - t0) / durationMs, 1);
      // cubic ease-in-out — gentle accel/decel for a slow, cinematic move
      const t = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      camera.position.lerpVectors(fromPos, toPos, t);
      target.lerpVectors(fromTgt, toTgt, t);
      camera.lookAt(target);
      camera.fov = fromFov + (toFov - fromFov) * t;
      camera.updateProjectionMatrix();
      resize();
      renderer.render(scene, camera);
      updateAnnotations();
      if (flow) flow.relayout();
      if (p < 1) { tweenRaf = requestAnimationFrame(step); }
      else { tweenRaf = null; }
    }
    tweenRaf = requestAnimationFrame(step);
  }

  // ── Scroll snap via IntersectionObserver ──
  const dots = [...sec.querySelectorAll('.scene3d-dot')];
  const progressFill = sec.querySelector('.scene3d-progress-fill');
  const cards = [...sec.querySelectorAll('.scene3d-card')];

  function activateScene(n) {
    if (n === currentIdx || !scenes[n]) return;
    currentIdx = n;
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    cards.forEach((c, i) => c.classList.toggle('is-active', i === n));
    if (progressFill && scenes.length > 1) {
      progressFill.style.height = ((n / (scenes.length - 1)) * 100) + '%';
    }
    tweenCamera(scenes[n], 1600);
    updateAnnotations();
    // Switch flowing text to this scene's prose (falls back to block default).
    if (flow) flow.setText((scenes[n] && scenes[n].flowText) || data.flowText || '', data.flowColumns || 2);
  }

  // Deterministic scene selection: whichever card's center is nearest the
  // viewport center wins. Robust both directions, never "sticks".
  let _scrollTick = false;
  function onScroll() {
    if (_scrollTick) return;
    _scrollTick = true;
    requestAnimationFrame(() => {
      _scrollTick = false;
      if (!cards.length) return;
      const vpCenter = window.innerHeight / 2;
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        const d = Math.abs((r.top + r.height / 2) - vpCenter);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      activateScene(best);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial scene immediately

  // ── ResizeObserver — refit canvas when container changes ──
  const ro = new ResizeObserver(() => {
    resize(); renderer.render(scene, camera); updateAnnotations();
    if (flow) { const tc = sec.querySelector('.scene3d-text-canvas'); if (tc) flow.resize(tc.clientWidth, tc.clientHeight, Math.min(window.devicePixelRatio||1,2)); flow.relayout(); }
  });
  ro.observe(canvas);

  // NOTE: no scroll-based auto-dispose. A previous version disposed the renderer
  // when the block left the viewport, which froze the model on scroll-up and
  // black-screened it on re-entry. disposeAll() is still exposed for explicit
  // teardown (e.g. when the admin soft-refresh re-renders the block).
  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    if (flow) flow.dispose();
    window.removeEventListener('scroll', onScroll);
    ro.disconnect();
    scene.traverse(obj => {
      obj.geometry?.dispose();
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
    _active.delete(blockId);
  }

  _active.set(blockId, { disposeAll });
}

export function dispose(blockId) {
  _active.get(blockId)?.disposeAll();
}

// Dispose every live Scene3D instance — called before an admin soft-refresh wipes
// the DOM, so WebGL contexts are released instead of leaking.
export function disposeAllScene3D() {
  for (const inst of [..._active.values()]) { try { inst.disposeAll(); } catch (_) {} }
  _active.clear();
}
