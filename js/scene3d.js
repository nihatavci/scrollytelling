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

// Reproduce the CSS backdrop gradient as a scene background texture. Needed when
// post-processing is on: the composer passes don't preserve canvas alpha, so the
// CSS gradient behind the (transparent) canvas would turn black.
function _gradientBgTexture(THREE, kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  // Matches .scene3d--bg-* radial-gradient(ellipse at 50% 38%, ...) in render.js CSS.
  const g = ctx.createRadialGradient(256, 195, 0, 256, 195, 420);
  if (kind === 'studio') {
    g.addColorStop(0, '#fafafa'); g.addColorStop(0.65, '#e6e6ea'); g.addColorStop(1, '#d3d3d9');
  } else {
    g.addColorStop(0, '#2c2c31'); g.addColorStop(0.72, '#161618'); g.addColorStop(1, '#0d0d0f');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic tone mapping + sRGB output — the difference between washed-out and rich, like Sketchfab.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ── Scene + lights ──
  const scene = new THREE.Scene();
  // Image-based lighting gives PBR materials realistic reflections and shading — this is what
  // makes a GLB look great instead of flat/dark. A real studio HDRI (warm, directional) reads
  // far closer to Sketchfab than the neutral procedural RoomEnvironment; fall back to it if the
  // HDRI can't load, and to lights-only if even that fails.
  // Light presets — 'studio' (default): IBL-dominant, neutral; 'sun': warm low key light
  // dominates like late-afternoon outdoor sun, env turned down, longer/darker shadow.
  const sunlight = data.light === 'sun';
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    let envTex = null;
    try {
      const { RGBELoader } = await import(`${_CDN}/examples/jsm/loaders/RGBELoader.js`);
      // Sun preset reflects a real outdoor sky (sky.hdr); studio reflects the studio HDRI.
      const hdr = await new RGBELoader().loadAsync(sunlight ? '/assets/hdri/sky.hdr' : '/assets/hdri/studio.hdr');
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      envTex = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    } catch (hdrErr) {
      const { RoomEnvironment } = await import(`${_CDN}/examples/jsm/environments/RoomEnvironment.js`);
      envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    scene.environment = envTex;
    // Sketchfab is IBL-dominant: the HDRI does ~90% of the lighting at higher intensity,
    // while analytic lights stay weak (the dir light exists mainly to cast the shadow).
    // Strong ambient/dir lights on top of an env map flatten the model.
    if ('environmentIntensity' in scene) scene.environmentIntensity = 1.3;
    pmrem.dispose();
  } catch (e) { /* environment optional — fall back to lights only */ }
  // Glow intensity (data.glowIntensity, default 1): scales the key light and opens up
  // bloom, so models without hot emissive/metallic surfaces can still visibly shine.
  const glow = Math.max(0.25, parseFloat(data.glowIntensity) || 1);
  if (sunlight && 'environmentIntensity' in scene) scene.environmentIntensity = 0.55;
  scene.add(new THREE.AmbientLight(0xffffff, sunlight ? 0.05 : 0.1));
  // Key light grows gentler than bloom (half-slope) so high glow doesn't nuke metallic models.
  const dir = new THREE.DirectionalLight(sunlight ? 0xffd9a8 : 0xffffff, (sunlight ? 3.2 : 0.8) * (0.5 + 0.5 * glow));
  dir.position.set(...(sunlight ? [6, 8, 4] : [5, 10, 7]));
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, sunlight ? 0.15 : 0.3); // soft rim from the opposite side
  dir2.position.set(-6, 4, -5);
  scene.add(dir2);

  // Atmospheric depth fog (the Spline look) — distant geometry melts into the backdrop,
  // so the floor reads as an infinite studio sweep instead of a hard-edged plane.
  // Color matches the backdrop gradient's mid tone. Skipped for bg:'page' (transparent).
  const _bgKind = data.bg || 'dark';
  if (_bgKind !== 'page') {
    scene.fog = new THREE.Fog(new THREE.Color(_bgKind === 'studio' ? 0xe2e2e7 : 0x141416), 6, 16);
  }

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
      if (composer) composer.setSize(w, h);
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
  // Pivot group — drag-to-rotate spins this, never the camera, so the scroll-driven
  // camera tweens and user rotation can't fight each other.
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);
  // Soft contact shadow + grounding (matches the admin editor; the depth Sketchfab has).
  // Also tune every material for richer reflections + crisper textures (asset-agnostic):
  //  · envMapIntensity scales how much the HDRI reflects off the surface — pop without
  //    altering the artist's authored metalness/roughness (so nothing looks "wrong").
  //  · max anisotropy keeps textures sharp at grazing angles.
  const _maxAniso = renderer.capabilities.getMaxAnisotropy();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if ('envMapIntensity' in m) m.envMapIntensity = 1.25;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach((k) => {
        if (m[k]) { m[k].anisotropy = _maxAniso; m[k].needsUpdate = true; }
      });
    });
  });
  const _gb = new THREE.Box3().setFromObject(model);
  const _ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: sunlight ? 0.45 : 0.32 }));
  _ground.rotation.x = -Math.PI / 2;
  _ground.position.y = _gb.min.y - 0.002;
  _ground.receiveShadow = true;
  scene.add(_ground);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.bias = -0.0004;
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 60;
  dir.shadow.camera.left = -3; dir.shadow.camera.right = 3;
  dir.shadow.camera.top = 3; dir.shadow.camera.bottom = -3;
  dir.shadow.camera.updateProjectionMatrix();

  // ── Post-processing: GTAO (crevice ambient occlusion) + bloom (emissive glow) ──
  // The last mile to a Sketchfab-grade image. Needs an opaque backdrop (passes drop
  // canvas alpha), so the CSS gradient is reproduced in-scene. Skipped on weak/mobile
  // devices and for bg:'page', which requires real canvas transparency.
  let composer = null;
  const _weakDevice = isMobile
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4)
    || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
  if (!_weakDevice && _bgKind !== 'page') {
    try {
      const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import(`${_CDN}/examples/jsm/postprocessing/EffectComposer.js`),
        import(`${_CDN}/examples/jsm/postprocessing/RenderPass.js`),
        import(`${_CDN}/examples/jsm/postprocessing/GTAOPass.js`),
        import(`${_CDN}/examples/jsm/postprocessing/UnrealBloomPass.js`),
        import(`${_CDN}/examples/jsm/postprocessing/OutputPass.js`),
      ]);
      scene.background = _gradientBgTexture(THREE, _bgKind);
      const pr = Math.min(window.devicePixelRatio, 1.5); // post at DPR>1.5 costs ~2x for invisible gain
      renderer.setPixelRatio(pr);
      const w = canvas.clientWidth || 1, h = Math.max(canvas.clientHeight, 1);
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, camera));
      const mb = new THREE.Box3().setFromObject(model);
      const diag = mb.getSize(new THREE.Vector3()).length();
      const gtao = new GTAOPass(scene, camera, w, h);
      gtao.updateGtaoMaterial({
        radius: Math.max(diag * 0.03, 0.01), distanceExponent: 1, thickness: 1,
        scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false,
      });
      gtao.blendIntensity = 0.8;
      // Texture backgrounds render via an internal PlaneGeometry(2,2) mesh, which the
      // GTAO override pass rasterizes as real 2x2 world geometry at the origin — a phantom
      // depth quad that darkens the backdrop. Hide the background (and the invisible
      // shadow floor) from the AO G-buffer; they carry no AO information anyway.
      const _gtaoRender = gtao.render.bind(gtao);
      gtao.render = function (...args) {
        const bg = scene.background;
        scene.background = null;
        _ground.visible = false;
        try { _gtaoRender(...args); } finally { scene.background = bg; _ground.visible = true; }
      };
      composer.addPass(gtao);
      // Studio: threshold >1 so only emissive pixels bloom. Sun: lower threshold +
      // more strength so sunlit highlights visibly glow — the "shining" look.
      // glowIntensity scales strength and lowers the threshold so more surfaces bloom.
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        (sunlight ? 0.5 : 0.22) * glow,
        sunlight ? 0.55 : 0.4,
        Math.max(0.45, (sunlight ? 0.78 : 1.1) - (glow - 1) * 0.18),
      );
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      if (window.__SCENE3D_DEBUG_ENABLE) window.__SCENE3D_DEBUG = { scene, composer, gtao, bloom, renderer, camera, model };
    } catch (e) { composer = null; /* post optional — direct render still looks good */ }
  }
  function drawFrame() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  // ── Drag-to-rotate — spin the model pivot with the pointer ──
  // Opt-in per block (data.draggable). Off by default: on the published page and
  // the editor preview the model only moves with scroll, so a drag scrolls the page.
  // touch-action: pan-y keeps vertical swipes scrolling on touch; horizontal drags
  // rotate. Light inertia so a flick keeps spinning briefly.
  let _dragId = null, _lastX = 0, _lastY = 0, _velY = 0, _spinRaf = 0;
  const _dragEnabled = data.draggable === true || data.draggable === 'true';
  if (_dragEnabled) {
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    _dragId = e.pointerId; _lastX = e.clientX; _lastY = e.clientY; _velY = 0;
    if (_spinRaf) { cancelAnimationFrame(_spinRaf); _spinRaf = 0; }
    canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== _dragId) return;
    const dx = e.clientX - _lastX, dy = e.clientY - _lastY;
    _lastX = e.clientX; _lastY = e.clientY;
    pivot.rotation.y += dx * 0.005;
    pivot.rotation.x = Math.max(-0.5, Math.min(0.5, pivot.rotation.x + dy * 0.003));
    _velY = dx * 0.005;
    drawFrame();
  });
  function _endDrag(e) {
    if (e.pointerId !== _dragId) return;
    _dragId = null;
    canvas.style.cursor = 'grab';
    // Inertia: decay the yaw velocity over a few frames.
    const spin = () => {
      _velY *= 0.92;
      if (Math.abs(_velY) < 0.0004) { _spinRaf = 0; return; }
      pivot.rotation.y += _velY;
      drawFrame();
      _spinRaf = requestAnimationFrame(spin);
    };
    if (Math.abs(_velY) > 0.002) _spinRaf = requestAnimationFrame(spin);
  }
  canvas.addEventListener('pointerup', _endDrag);
  canvas.addEventListener('pointercancel', _endDrag);
  } // end if (_dragEnabled)

  // Show canvas, hide loader. Paint twice across frames so the first frame
  // always lands on the transparent canvas regardless of layout timing.
  resize();
  drawFrame();
  requestAnimationFrame(() => { resize(); drawFrame(); });
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
      drawFrame();
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
    resize(); drawFrame(); updateAnnotations();
    if (flow) { const tc = sec.querySelector('.scene3d-text-canvas'); if (tc) flow.resize(tc.clientWidth, tc.clientHeight, Math.min(window.devicePixelRatio||1,2)); flow.relayout(); }
  });
  ro.observe(canvas);

  // NOTE: no scroll-based auto-dispose. A previous version disposed the renderer
  // when the block left the viewport, which froze the model on scroll-up and
  // black-screened it on re-entry. disposeAll() is still exposed for explicit
  // teardown (e.g. when the admin soft-refresh re-renders the block).
  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    if (_spinRaf) cancelAnimationFrame(_spinRaf);
    if (flow) flow.dispose();
    window.removeEventListener('scroll', onScroll);
    ro.disconnect();
    scene.traverse(obj => {
      obj.geometry?.dispose();
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    if (composer) { try { composer.dispose(); } catch (_) {} }
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
