// admin/ui/scene3d-editor.js
// Orbit editor for the Scene3D admin block.
// Defines window.initScene3DEditor(container, blockData, onChange) — called by renderField model3d case.
(function () {
'use strict';

// esm.sh rewrites the addons' internal bare `import ... from 'three'` to a real
// URL (jsDelivr does NOT — that left 'three' unresolvable and broke every loader).
const CDN = 'https://esm.sh/three@0.170.0';
let _libPromise = null;

async function loadThree() {
  if (_libPromise) return _libPromise;
  _libPromise = (async () => {
    const THREE = await import(CDN);
    const { GLTFLoader } = await import(`${CDN}/examples/jsm/loaders/GLTFLoader.js`);
    const { STLLoader } = await import(`${CDN}/examples/jsm/loaders/STLLoader.js`);
    const { OrbitControls } = await import(`${CDN}/examples/jsm/controls/OrbitControls.js`);
    const { DRACOLoader } = await import(`${CDN}/examples/jsm/loaders/DRACOLoader.js`);
    const { KTX2Loader } = await import(`${CDN}/examples/jsm/loaders/KTX2Loader.js`);
    const { MeshoptDecoder } = await import(`${CDN}/examples/jsm/libs/meshopt_decoder.module.js`);
    return { THREE, GLTFLoader, STLLoader, OrbitControls, DRACOLoader, KTX2Loader, MeshoptDecoder };
  })();
  return _libPromise;
}

function makeGltfLoader(lib, renderer) {
  const loader = new lib.GLTFLoader();
  const draco = new lib.DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(lib.MeshoptDecoder);
  try {
    const ktx2 = new lib.KTX2Loader().setTranscoderPath(`${CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  } catch (_) {}
  return loader;
}

async function initScene3DEditor(container, blockData, onChange) {
  // ── Ensure scenes array is initialised ──
  if (!Array.isArray(blockData.scenes)) blockData.scenes = [];
  while (blockData.scenes.length < 4) blockData.scenes.push(null);

  // ── Upload zone ──
  const uploadZone = document.createElement('div');
  uploadZone.className = 's3d-upload-zone';
  if (blockData.glbUrl) uploadZone.style.display = 'none';
  uploadZone.innerHTML = `
    <div class="s3d-upload-icon">📦</div>
    <div class="s3d-upload-text">Drop a <strong>GLB / GLTF / STL</strong> file here or <u style="cursor:pointer">browse</u></div>
    <div class="s3d-upload-hint">A 3D model is required · Best under 10 MB · Use Draco compression for large GLB</div>`;

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.glb,.gltf,.stl'; fileInput.style.display = 'none';
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('s3d-drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('s3d-drag-over'));
  uploadZone.addEventListener('drop', async e => {
    e.preventDefault(); uploadZone.classList.remove('s3d-drag-over');
    if (e.dataTransfer.files[0]) await handleUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });

  container.appendChild(fileInput);
  container.appendChild(uploadZone);

  // ── Viewport + strip wrapper ──
  const editorWrap = document.createElement('div');
  editorWrap.className = 's3d-editor-wrap';
  editorWrap.style.display = blockData.glbUrl ? '' : 'none';

  const viewportEl = document.createElement('div');
  viewportEl.className = 's3d-viewport';

  const canvas = document.createElement('canvas');
  canvas.className = 's3d-canvas';
  viewportEl.appendChild(canvas);

  const hintBar = document.createElement('div');
  hintBar.className = 's3d-hint-bar';
  hintBar.textContent = 'Drag · orbit   Scroll · zoom   Right-drag · pan';
  viewportEl.appendChild(hintBar);

  // Fullscreen toggle — expand the canvas to fill the screen for real editing.
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 's3d-fs-btn';
  fsBtn.title = 'Edit fullscreen';
  fsBtn.textContent = '⛶';
  let _fsPlaceholder = null;
  fsBtn.addEventListener('click', () => {
    const goingFull = !editorWrap.classList.contains('s3d-fullscreen');
    if (goingFull) {
      // Move to <body> so position:fixed is relative to the viewport, not a
      // transformed sidebar ancestor (which silently traps fixed positioning).
      _fsPlaceholder = document.createComment('s3d-fs');
      editorWrap.parentNode.insertBefore(_fsPlaceholder, editorWrap);
      document.body.appendChild(editorWrap);
      editorWrap.classList.add('s3d-fullscreen');
      document.body.style.overflow = 'hidden';
    } else {
      editorWrap.classList.remove('s3d-fullscreen');
      if (_fsPlaceholder && _fsPlaceholder.parentNode) {
        _fsPlaceholder.parentNode.insertBefore(editorWrap, _fsPlaceholder);
        _fsPlaceholder.remove();
      }
      _fsPlaceholder = null;
      document.body.style.overflow = '';
    }
    fsBtn.textContent = goingFull ? '✕' : '⛶';
    fsBtn.title = goingFull ? 'Exit fullscreen' : 'Edit fullscreen';
    // force resize so the model fills the new canvas size
    requestAnimationFrame(() => { resize(); renderFrame(); });
    setTimeout(() => { resize(); renderFrame(); }, 60);
  });
  viewportEl.appendChild(fsBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 's3d-save-btn small';
  viewportEl.appendChild(saveBtn);

  const strip = document.createElement('div');
  strip.className = 's3d-strip';

  editorWrap.appendChild(viewportEl);
  editorWrap.appendChild(strip);
  container.appendChild(editorWrap);

  // ── State ──
  let THREE_LIB, renderer, threeScene, camera, controls;
  let activeSlot = 0;

  function nextEmptySlot() { return blockData.scenes.findIndex(s => !s); }

  function updateSaveBtn() {
    const ne = nextEmptySlot();
    const n = ne === -1 ? activeSlot + 1 : ne + 1;
    saveBtn.textContent = `📷 Save as Scene ${n}`;
  }
  updateSaveBtn();

  function renderStrip() {
    strip.innerHTML = '';
    blockData.scenes.forEach((sc, i) => {
      const slot = document.createElement('div');
      slot.className = 's3d-slot' + (sc ? ' s3d-slot--filled' : '') + (i === activeSlot ? ' s3d-slot--active' : '');

      if (sc) {
        if (sc.thumb) {
          const img = document.createElement('img');
          img.src = sc.thumb; img.className = 's3d-thumb-img';
          slot.appendChild(img);
        }
        const num = document.createElement('span');
        num.className = 's3d-slot-num'; num.textContent = i + 1;
        slot.appendChild(num);

        // Delete button — two-click confirm
        const del = document.createElement('button');
        del.type = 'button'; del.className = 's3d-slot-del'; del.textContent = '✕';
        del.addEventListener('click', e => {
          e.stopPropagation();
          if (del.dataset.confirming) {
            clearTimeout(del._t); delete del.dataset.confirming;
            blockData.scenes[i] = null;
            onChange(); renderStrip(); updateSaveBtn();
          } else {
            del.dataset.confirming = '1';
            del.textContent = '?';
            del.style.cssText = 'background:#fa3d1d;color:#fff;border-color:#fa3d1d;';
            del._t = setTimeout(() => {
              delete del.dataset.confirming;
              del.textContent = '✕'; del.style.cssText = '';
            }, 3000);
          }
        });
        slot.appendChild(del);

        slot.addEventListener('click', () => {
          activeSlot = i; renderStrip(); updateSaveBtn();
          if (controls) tweenEditorCamera(sc, 400);
        });
      } else {
        const plus = document.createElement('span');
        plus.className = 's3d-slot-plus'; plus.textContent = '+';
        slot.appendChild(plus);
        const num = document.createElement('span');
        num.className = 's3d-slot-num'; num.textContent = i + 1;
        slot.appendChild(num);
      }
      strip.appendChild(slot);
    });
  }
  renderStrip();

  // ── Upload handler ──
  async function handleUpload(file) {
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) { window.toast?.('File too large (max 50 MB)', 'error'); return; }
    const mb = (file.size / 1024 / 1024).toFixed(1);
    uploadZone.style.display = '';
    uploadZone.innerHTML = `
      <div class="s3d-upload-text" style="padding:4px 0 8px">Uploading ${mb} MB…</div>
      <div class="s3d-progress-track"><div class="s3d-progress-bar" style="width:0%"></div></div>
      <div class="s3d-progress-pct">0%</div>`;
    const bar = uploadZone.querySelector('.s3d-progress-bar');
    const pct = uploadZone.querySelector('.s3d-progress-pct');
    try {
      const r = await window.SB.uploadFile(file, (p) => {
        if (bar) bar.style.width = p + '%';
        if (pct) pct.textContent = p + (p >= 100 ? '% · processing…' : '%');
      });
      blockData.glbUrl = r.url; onChange();
      uploadZone.style.display = 'none';
      editorWrap.style.display = '';
      await initThree();
    } catch (err) {
      window.toast?.('Upload failed: ' + err.message, 'error');
      uploadZone.innerHTML = `<div class="s3d-upload-icon">📦</div>
        <div class="s3d-upload-text">Upload failed — <u style="cursor:pointer">try again</u></div>
        <div class="s3d-upload-hint" style="color:#fa3d1d">${err.message.replace(/</g,'&lt;')}</div>`;
    }
  }

  // ── Three.js setup ──
  async function initThree() {
    // Immediate feedback while the Three.js library + model load.
    let bootOverlay = viewportEl.querySelector('.s3d-load-overlay');
    if (!bootOverlay) {
      bootOverlay = document.createElement('div');
      bootOverlay.className = 's3d-load-overlay';
      bootOverlay.innerHTML = '<div class="s3d-load-spinner"></div><div class="s3d-load-text">Loading 3D engine…</div>';
      viewportEl.appendChild(bootOverlay);
    }
    let lib;
    try {
      lib = await loadThree();
    } catch (err) {
      console.error('[Scene3D admin] Three.js failed to load:', err);
      bootOverlay.innerHTML = `<div class="s3d-load-text" style="color:#ff9b7a;max-width:85%">3D engine failed to load.<br><span style="opacity:.8;font-size:11px">${String(err.message).replace(/</g,'&lt;').slice(0,160)}</span></div>`;
      return;
    }
    const { THREE, STLLoader, OrbitControls } = lib;
    THREE_LIB = THREE;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent → CSS gradient shows behind model
    applyViewportBg();

    threeScene = new THREE.Scene();
    threeScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7); threeScene.add(dir);

    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    camera.position.set(0, 1, 4);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.addEventListener('change', renderFrame);

    // Reuse the boot overlay for model download/parse feedback.
    const loadOverlay = bootOverlay;
    const loadText = loadOverlay.querySelector('.s3d-load-text');
    if (loadText) loadText.textContent = 'Loading model…';
    const onProg = (e) => {
      if (!loadText) return;
      if (e && e.lengthComputable && e.total) loadText.textContent = `Loading model… ${Math.round((e.loaded / e.total) * 100)}%`;
      else if (e && e.loaded) loadText.textContent = `Loading model… ${(e.loaded / 1024 / 1024).toFixed(1)} MB`;
    };

    // Load model — GLB/GLTF via GLTFLoader, STL via STLLoader (geometry → mesh)
    const isSTL = /\.stl(\?|$)/i.test(blockData.glbUrl);
    try {
      let model;
      if (isSTL) {
        const geo = await new Promise((res, rej) => new STLLoader().load(blockData.glbUrl, res, onProg, rej));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.1, roughness: 0.65 });
        model = new THREE.Mesh(geo, mat);
      } else {
        const gltf = await new Promise((res, rej) => makeGltfLoader(lib, renderer).load(blockData.glbUrl, res, onProg, rej));
        model = gltf.scene;
      }
      loadOverlay.remove();
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
      }
      threeScene.add(model);
    } catch (err) {
      console.error('[Scene3D admin] model load failed:', err);
      window.toast?.('Could not load 3D model: ' + err.message, 'error');
      loadOverlay.innerHTML = `<div class="s3d-load-text" style="color:#ff9b7a;max-width:85%;line-height:1.5">Couldn't load the model.<br><span style="opacity:.8;font-size:11px">${String(err.message).replace(/</g,'&lt;').slice(0,160)}</span><br><u style="cursor:pointer" onclick="this.closest('.s3d-upload-zone, .s3d-editor-wrap')">Re-upload a different file</u></div>`;
      return;
    }

    resize(); renderFrame();
    renderer.setAnimationLoop(() => { controls.update(); renderFrame(); });

    // If scenes already saved, recall scene 0; otherwise frame the model so it's
    // always visible regardless of its native scale/position.
    const s0 = blockData.scenes.find(Boolean);
    if (s0) {
      recallCamera(s0);
    } else {
      // model is normalised to a ~2-unit box centred at origin → frame from front
      camera.position.set(1.6, 1.2, 3.2);
      controls.target.set(0, 0, 0);
      camera.updateProjectionMatrix();
      controls.update();
      renderFrame();
    }

    updateSaveBtn();
  }

  function resize() {
    if (!renderer) return;
    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function renderFrame() {
    if (!renderer) return;
    resize(); renderer.render(threeScene, camera);
  }

  // Match the editor viewport background to the chosen public background.
  function applyViewportBg() {
    const bg = blockData.bg || 'studio';
    const grad = {
      studio: 'radial-gradient(ellipse at 50% 38%,#fafafa 0%,#e6e6ea 65%,#d3d3d9 100%)',
      dark:   'radial-gradient(ellipse at 50% 38%,#2c2c31 0%,#161618 72%,#0d0d0f 100%)',
      page:   '#f8f8f8',
    };
    viewportEl.style.background = grad[bg] || grad.studio;
  }

  function recallCamera(sc) {
    camera.position.set(sc.camera.x, sc.camera.y, sc.camera.z);
    controls.target.set(sc.target.x, sc.target.y, sc.target.z);
    camera.fov = sc.fov || 45; camera.updateProjectionMatrix();
    renderFrame();
  }

  let _editorTweenRaf = null;
  function tweenEditorCamera(sc, durationMs) {
    if (_editorTweenRaf) { cancelAnimationFrame(_editorTweenRaf); _editorTweenRaf = null; }
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    const fromFov = camera.fov;
    const toPos = new THREE_LIB.Vector3(sc.camera.x, sc.camera.y, sc.camera.z);
    const toTgt = new THREE_LIB.Vector3(sc.target.x, sc.target.y, sc.target.z);
    const toFov = sc.fov || 45;
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / durationMs, 1);
      const t = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(fromPos, toPos, t);
      controls.target.lerpVectors(fromTgt, toTgt, t);
      camera.fov = fromFov + (toFov - fromFov) * t; camera.updateProjectionMatrix();
      renderFrame();
      if (p < 1) { _editorTweenRaf = requestAnimationFrame(step); } else { _editorTweenRaf = null; }
    }
    _editorTweenRaf = requestAnimationFrame(step);
  }

  // ── Save view button ──
  saveBtn.addEventListener('click', () => {
    if (!renderer || !camera) return;
    const pos = camera.position, tgt = controls.target;

    // Render thumbnail to offscreen 128×96 canvas
    const tc = document.createElement('canvas'); tc.width = 128; tc.height = 96;
    const tr = new THREE_LIB.WebGLRenderer({ canvas: tc, antialias: false });
    tr.setPixelRatio(1); tr.setClearColor(0x1a1a1a, 1); tr.setSize(128, 96, false);
    const tc2 = camera.clone(); tc2.aspect = 128 / 96; tc2.updateProjectionMatrix();
    tr.render(threeScene, tc2); tr.dispose();
    const thumb = tc.toDataURL('image/jpeg', 0.8);

    const ne = nextEmptySlot();
    const slot = ne === -1 ? activeSlot : ne;
    blockData.scenes[slot] = {
      caption: blockData.scenes[slot]?.caption || '',
      camera: { x: pos.x, y: pos.y, z: pos.z },
      target: { x: tgt.x, y: tgt.y, z: tgt.z },
      fov: Math.round(camera.fov),
      thumb,
    };
    activeSlot = slot;
    onChange(); renderStrip(); updateSaveBtn();
  });

  // Init immediately if editing an existing block with a GLB
  if (blockData.glbUrl) initThree();
}

window.initScene3DEditor = initScene3DEditor;
})();
