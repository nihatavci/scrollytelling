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
    return { THREE, GLTFLoader, STLLoader };
  })();
  return _libPromise;
}

export async function initScene3D(blockId, data) {
  const sec = document.getElementById(`scene3d-${blockId}`);
  if (!sec) return;
  const canvas = sec.querySelector('.scene3d-canvas');
  const loaderEl = sec.querySelector('.scene3d-loader');
  if (!canvas) return;

  const scenes = (data.scenes || []).filter(Boolean);
  if (!scenes.length || !data.glbUrl) return;

  const { THREE, GLTFLoader, STLLoader } = await _loadThree();

  // ── Renderer ──
  const isMobile = window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x1a1a1a, 1);
  renderer.shadowMap.enabled = false;

  // ── Scene + lights ──
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // ── Camera ──
  const s0 = scenes[0];
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
  try {
    if (isSTL) {
      const geo = await new Promise((res, rej) => new STLLoader().load(data.glbUrl, res, undefined, rej));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.1, roughness: 0.65 });
      model = new THREE.Mesh(geo, mat);
    } else {
      const gltf = await new Promise((res, rej) => new GLTFLoader().load(data.glbUrl, res, undefined, rej));
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

  // Show canvas, hide loader
  resize();
  renderer.render(scene, camera);
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';

  // ── Tween state ──
  let tweenRaf = null;
  let currentIdx = 0;

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
      const t = 1 - Math.pow(1 - p, 3); // cubic ease-out
      camera.position.lerpVectors(fromPos, toPos, t);
      target.lerpVectors(fromTgt, toTgt, t);
      camera.lookAt(target);
      camera.fov = fromFov + (toFov - fromFov) * t;
      camera.updateProjectionMatrix();
      resize();
      renderer.render(scene, camera);
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
    if (n === currentIdx) return;
    currentIdx = n;
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    if (progressFill && scenes.length > 1) {
      progressFill.style.height = ((n / (scenes.length - 1)) * 100) + '%';
    }
    tweenCamera(scenes[n], 800);
  }

  const cardObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        activateScene(Number(e.target.dataset.scene));
      }
    });
  }, { threshold: 0.5 });
  cards.forEach(c => cardObs.observe(c));

  // ── ResizeObserver — refit canvas when container changes ──
  const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); });
  ro.observe(canvas);

  // ── Dispose when block scrolls very far out of view ──
  const disposeObs = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) disposeAll();
  }, { rootMargin: '-100% 0px' });
  disposeObs.observe(sec);

  function disposeAll() {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    cardObs.disconnect();
    ro.disconnect();
    disposeObs.disconnect();
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
