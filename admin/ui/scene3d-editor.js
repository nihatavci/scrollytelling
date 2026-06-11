// admin/ui/scene3d-editor.js
// Orbit editor for the Scene3D admin block.
// Defines window.initScene3DEditor(container, blockData, onChange) — called by renderField model3d case.
(function () {
'use strict';

// esm.sh rewrites the addons' internal bare `import ... from 'three'` to a real
// URL (jsDelivr does NOT — that left 'three' unresolvable and broke every loader).
const CDN = 'https://esm.sh/three@0.170.0';
const _uid = () => 'an-' + Math.random().toString(36).slice(2, 7);
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
    <div class="s3d-upload-text">Drop a <strong>GLB / GLTF / STL</strong> file, <u style="cursor:pointer">upload</u>, or <u class="s3d-pick-existing" style="cursor:pointer">reuse an uploaded model</u></div>
    <div class="s3d-upload-hint">Required · max 50 MB · compress big models free at <a href="https://gltf.report" target="_blank" rel="noopener" style="color:var(--signal-blue,#0358f7)">gltf.report ↗</a></div>`;

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.glb,.gltf,.stl'; fileInput.style.display = 'none';
  uploadZone.addEventListener('click', (e) => {
    // "reuse an uploaded model" → asset library picker (filtered to 3D files), not the OS dialog.
    if (e.target.closest('.s3d-pick-existing')) {
      e.stopPropagation();
      if (typeof window.openFilePicker === 'function') window.openFilePicker('model', (url) => useModelUrl(url));
      else window.toast?.('File browser unavailable', 'error');
      return;
    }
    fileInput.click();
  });
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

  canvas.addEventListener('pointerdown', (e) => {
    if (!placementMode || !camera || !model3d) return;
    ensureAnnoTemps();
    const rect = canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObject(model3d, true);
    if (!hits.length) { window.toast?.('Click directly on the model', 'info'); return; }
    const p = hits[0].point;
    if (!Array.isArray(blockData.annotations)) blockData.annotations = [];
    blockData.annotations.push({ id: _uid(), scene: activeSlot, point: { x: p.x, y: p.y, z: p.z }, label: '' });
    setPlacement(false);
    rebuildAnnoEls(); updateAnnotations();
    onChange(); renderTextPanel();
  });

  function setPlacement(on) {
    placementMode = on;
    canvas.style.cursor = on ? 'crosshair' : '';
    viewportEl.classList.toggle('s3d-placing', on);
  }

  const hintBar = document.createElement('div');
  hintBar.className = 's3d-hint-bar';
  hintBar.textContent = 'Drag · orbit   ⛶ fullscreen to zoom';
  viewportEl.appendChild(hintBar);

  // Viewport toolbar — Background + Light presets (stored on the block, used by the
  // public renderer too).
  const vpBar = document.createElement('div');
  vpBar.style.cssText = 'position:absolute;top:10px;left:10px;z-index:5;display:flex;gap:6px;';
  const mkSelect = (label, options, value, onPick) => {
    const sel = document.createElement('select');
    sel.title = label;
    sel.style.cssText = 'appearance:none;-webkit-appearance:none;background:rgba(20,20,22,.72);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:99px;font:600 11px/1 var(--font,"DM Sans",sans-serif);padding:6px 12px;cursor:pointer;backdrop-filter:blur(8px);';
    options.forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = t; o.style.color = '#111';
      sel.appendChild(o);
    });
    sel.value = value;
    sel.addEventListener('change', () => onPick(sel.value));
    vpBar.appendChild(sel);
    return sel;
  };
  mkSelect('Background', [['dark', 'Dark'], ['studio', 'Light'], ['page', 'Page']], blockData.bg || 'dark', (v) => {
    blockData.bg = v; onChange();
    applyViewportBg();
    if (composer && threeScene && THREE_LIB) threeScene.background = v === 'page' ? null : gradientBgTexture(THREE_LIB, v);
    applyFog();
    renderFrame();
  });
  mkSelect('Light', [['studio', 'Studio light'], ['sun', 'Sun light']], blockData.light || 'studio', (v) => {
    blockData.light = v; onChange();
    applyLightPreset();
    renderFrame();
  });
  viewportEl.appendChild(vpBar);

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
    // Wheel-zoom only in fullscreen. Embedded in the scrollable sidebar, OrbitControls'
    // wheel handler would dolly the camera AND preventDefault the wheel, so scrolling
    // over the canvas zoomed the model instead of scrolling past the block.
    if (controls) controls.enableZoom = goingFull;
    hintBar.textContent = goingFull
      ? 'Drag · orbit   Scroll · zoom   Right-drag · pan'
      : 'Drag · orbit   ⛶ fullscreen to zoom';
    // force resize so the model fills the new canvas size
    requestAnimationFrame(() => { resize(); renderFrame(); });
    setTimeout(() => { resize(); renderFrame(); }, 60);
  });
  viewportEl.appendChild(fsBtn);

  // Annotation overlay (dots tracked live while orbiting)
  const annoLayer = document.createElement('div');
  annoLayer.className = 's3d-anno-layer';
  viewportEl.appendChild(annoLayer);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 's3d-save-btn small';
  viewportEl.appendChild(saveBtn);

  const strip = document.createElement('div');
  strip.className = 's3d-strip';

  editorWrap.appendChild(viewportEl);
  editorWrap.appendChild(strip);
  container.appendChild(editorWrap);

  // Per-scene text panel (heading + body for the active saved scene)
  const textPanel = document.createElement('div');
  textPanel.className = 's3d-text-panel';
  container.appendChild(textPanel);

  function renderTextPanel() {
    const sc = blockData.scenes[activeSlot];
    if (blockData.textMode === 'flow') {
      textPanel.style.display = '';
      const scn = blockData.scenes[activeSlot];
      if (!scn) { textPanel.innerHTML = `<div class="s3d-text-title">Flowing text mode — save a scene first, then give it its own article text.</div>`; return; }
      textPanel.innerHTML = `
        <div class="s3d-text-title">Scene ${activeSlot + 1} article text <span>— flows around the model on this scene. Empty = uses the block's default Article text.</span></div>
        <div class="field"><label class="field-label">Article text (this scene)</label><textarea class="s3d-flow-text" rows="5" placeholder="Leave empty to use the block default…"></textarea></div>`;
      const ta = textPanel.querySelector('.s3d-flow-text');
      ta.value = scn.flowText || '';
      ta.addEventListener('input', () => { scn.flowText = ta.value; onChange(); });
      return;
    }
    if (!sc) { textPanel.innerHTML = ''; textPanel.style.display = 'none'; return; }
    textPanel.style.display = '';
    textPanel.innerHTML = `
      <div class="s3d-text-title">Scene ${activeSlot + 1} text <span>— shown in a card on the right as you scroll</span></div>
      <div class="field"><label class="field-label">Heading</label><input class="s3d-text-h" type="text" placeholder="Optional heading"></div>
      <div class="field"><label class="field-label">Body</label><textarea class="s3d-text-b" rows="2" placeholder="Optional paragraph"></textarea></div>`;
    const hIn = textPanel.querySelector('.s3d-text-h');
    const bIn = textPanel.querySelector('.s3d-text-b');
    hIn.value = sc.heading || sc.caption || '';
    bIn.value = sc.body || '';
    hIn.addEventListener('input', () => { sc.heading = hIn.value; delete sc.caption; onChange(); });
    bIn.addEventListener('input', () => { sc.body = bIn.value; onChange(); });

    // ── Annotations for this scene ──
    const annoWrap = document.createElement('div');
    annoWrap.className = 's3d-anno-edit';
    const list = (blockData.annotations || []).map((a, gi) => ({ a, gi })).filter(x => x.a.scene === activeSlot);
    annoWrap.innerHTML = `<div class="s3d-text-title">Annotations <span>— pinned points on the model, shown in this scene</span></div>`;
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'small';
    addBtn.textContent = placementMode ? '✕ Cancel — click the model' : '📍 Add annotation';
    addBtn.addEventListener('click', () => { setPlacement(!placementMode); renderTextPanel(); });
    annoWrap.appendChild(addBtn);
    list.forEach(({ a, gi }, n) => {
      const row = document.createElement('div');
      row.className = 's3d-anno-row';
      const badge = document.createElement('span');
      badge.className = 's3d-anno-badge'; badge.textContent = n + 1;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'Label'; inp.value = a.label || '';
      inp.addEventListener('input', () => { a.label = inp.value; rebuildAnnoEls(); updateAnnotations(); onChange(); });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 's3d-anno-del'; del.textContent = '✕';
      del.addEventListener('click', () => {
        if (del.dataset.confirming) {
          clearTimeout(del._t); blockData.annotations.splice(gi, 1);
          rebuildAnnoEls(); updateAnnotations(); onChange(); renderTextPanel();
        } else {
          del.dataset.confirming = '1'; del.textContent = '?';
          del.style.cssText = 'background:#fa3d1d;color:#fff;border-color:#fa3d1d;';
          del._t = setTimeout(() => { delete del.dataset.confirming; del.textContent = '✕'; del.style.cssText = ''; }, 3000);
        }
      });
      row.appendChild(badge); row.appendChild(inp); row.appendChild(del);
      annoWrap.appendChild(row);
    });
    textPanel.appendChild(annoWrap);
  }

  // ── State ──
  let THREE_LIB, renderer, threeScene, camera, controls, model3d, composer = null, lightRig = null, bloomPass = null;

  // Light presets — 'studio' (default): IBL-dominant, neutral; 'sun': warm low key
  // light dominates like late-afternoon outdoor sun, env down, longer/darker shadow,
  // and bloom opens up so sunlit highlights visibly glow.
  function applyLightPreset() {
    if (!lightRig || !threeScene) return;
    const sun = blockData.light === 'sun';
    if ('environmentIntensity' in threeScene) threeScene.environmentIntensity = sun ? 0.55 : 1.3;
    lightRig.ambient.intensity = sun ? 0.05 : 0.1;
    lightRig.dir.color.set(sun ? 0xffd9a8 : 0xffffff);
    lightRig.dir.intensity = sun ? 3.2 : 0.8;
    lightRig.dir.position.set(...(sun ? [6, 8, 4] : [5, 10, 7]));
    lightRig.dir2.intensity = sun ? 0.15 : 0.3;
    if (lightRig.ground) lightRig.ground.material.opacity = sun ? 0.45 : 0.32;
    if (bloomPass) {
      bloomPass.strength = sun ? 0.5 : 0.22;
      bloomPass.radius = sun ? 0.55 : 0.4;
      bloomPass.threshold = sun ? 0.78 : 1.1;
    }
    applyFog();
  }

  // Atmospheric depth fog (the Spline look) — distant geometry melts into the backdrop;
  // the floor reads as an infinite studio sweep. Color matches the backdrop gradient.
  function applyFog() {
    if (!threeScene || !THREE_LIB) return;
    const bg = blockData.bg || 'dark';
    if (bg === 'page') { threeScene.fog = null; return; }
    threeScene.fog = new THREE_LIB.Fog(new THREE_LIB.Color(bg === 'studio' ? 0xe2e2e7 : 0x141416), 6, 16);
  }
  let activeSlot = 0;
  let placementMode = false;
  const _annoEls = [];          // [{ btn, point(Vector3), id }]
  let _ray, _ndc, _vv, _dirv;   // lazily created THREE temporaries

  function ensureAnnoTemps() {
    if (_ray || !THREE_LIB) return;
    _ray = new THREE_LIB.Raycaster();
    _ndc = new THREE_LIB.Vector2();
    _vv = new THREE_LIB.Vector3();
    _dirv = new THREE_LIB.Vector3();
  }

  function rebuildAnnoEls() {
    annoLayer.innerHTML = '';
    _annoEls.length = 0;
    (blockData.annotations || []).forEach((a, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's3d-anno';
      btn.innerHTML = `<span class="s3d-anno-dot">${i + 1}</span><span class="s3d-anno-label"></span>`;
      btn.querySelector('.s3d-anno-label').textContent = a.label || '';
      // Labels stay open while their dot is visible (auto-open per active scene).
      annoLayer.appendChild(btn);
      _annoEls.push({ btn, id: a.id, point: new THREE_LIB.Vector3(a.point.x, a.point.y, a.point.z), scene: a.scene });
    });
  }

  function updateAnnotations() {
    if (!_annoEls.length || !camera || !renderer) return;
    ensureAnnoTemps();
    const rect = canvas.getBoundingClientRect();
    for (const an of _annoEls) {
      if (an.scene !== activeSlot) { an.btn.classList.remove('is-visible', 'is-open'); continue; }
      _vv.copy(an.point).project(camera);
      if (_vv.z > 1) { an.btn.classList.remove('is-visible'); continue; }
      _dirv.copy(an.point).sub(camera.position);
      const pointDist = _dirv.length();
      _ray.set(camera.position, _dirv.normalize());
      const hits = model3d ? _ray.intersectObject(model3d, true) : [];
      if (hits.length && hits[0].distance < pointDist - 0.02) { an.btn.classList.remove('is-visible'); continue; }
      const left = (_vv.x * 0.5 + 0.5) * rect.width;
      const top = (-_vv.y * 0.5 + 0.5) * rect.height;
      an.btn.style.transform = `translate(${left}px,${top}px) translate(-50%,-50%)`;
      an.btn.classList.add('is-visible', 'is-open'); // auto-open label while visible
    }
  }

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
            blockData.annotations = (blockData.annotations || []).filter(a => a.scene !== i);
            if (activeSlot === i) { const f = blockData.scenes.findIndex(Boolean); activeSlot = f === -1 ? 0 : f; }
            onChange(); renderStrip(); updateSaveBtn(); renderTextPanel();
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
          activeSlot = i; renderStrip(); updateSaveBtn(); renderTextPanel();
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
  renderTextPanel();

  // Point the block at an already-uploaded model URL (from the asset picker) and show it —
  // no re-upload. Same end-state as a fresh upload.
  async function useModelUrl(url) {
    if (!url || url === blockData.glbUrl) return;
    blockData.glbUrl = url; onChange();
    uploadZone.style.display = 'none';
    editorWrap.style.display = '';
    await initThree();
  }

  // ── Upload handler ──
  async function handleUpload(file) {
    const MAX = 50 * 1024 * 1024;
    const mbSize = file.size / 1024 / 1024;
    if (file.size > MAX) {
      window.toast?.(`File too large (${mbSize.toFixed(0)} MB). Maximum is 50 MB — compress at gltf.report.`, 'error');
      return;
    }
    if (mbSize > 12) {
      window.toast?.(`Large model (${mbSize.toFixed(0)} MB) — every visitor downloads this. Compress at gltf.report for faster loads.`, 'info');
    }
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    applyViewportBg();

    threeScene = new THREE.Scene();
    // Studio environment (IBL) — realistic PBR reflections/shading, matching the live renderer.
    // Real studio HDRI for a Sketchfab-like look; fall back to procedural RoomEnvironment, then
    // to lights-only.
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      let envTex = null;
      try {
        const { RGBELoader } = await import(`${CDN}/examples/jsm/loaders/RGBELoader.js`);
        const hdr = await new RGBELoader().loadAsync('/assets/hdri/studio.hdr');
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        envTex = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
      } catch (hdrErr) {
        const { RoomEnvironment } = await import(`${CDN}/examples/jsm/environments/RoomEnvironment.js`);
        envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      }
      threeScene.environment = envTex;
      // Sketchfab is IBL-dominant: the HDRI does the lighting at higher intensity while
      // analytic lights stay weak (the dir light exists mainly to cast the shadow).
      if ('environmentIntensity' in threeScene) threeScene.environmentIntensity = 1.3;
      pmrem.dispose();
    } catch (e) { /* environment optional — fall back to lights only */ }
    const ambient = new THREE.AmbientLight(0xffffff, 0.1);
    threeScene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7); threeScene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-6, 4, -5); threeScene.add(dir2);
    lightRig = { ambient, dir, dir2, ground: null };
    applyLightPreset();

    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    camera.position.set(0, 1, 4);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    // Embedded in the scrollable sidebar: disable wheel-zoom so scrolling over the
    // canvas scrolls the sidebar instead of dollying the camera (model grew endlessly).
    // Fullscreen re-enables it (no scroll conflict there). Drag-to-orbit stays on.
    controls.enableZoom = editorWrap.classList.contains('s3d-fullscreen');
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
      model3d = model;
      // Soft contact shadow + grounding (the depth Sketchfab has).
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const gb = new THREE.Box3().setFromObject(model);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.32 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = gb.min.y - 0.002;
      ground.receiveShadow = true;
      threeScene.add(ground);
      if (lightRig) { lightRig.ground = ground; applyLightPreset(); }
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.bias = -0.0004;
      dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 60;
      dir.shadow.camera.left = -3; dir.shadow.camera.right = 3;
      dir.shadow.camera.top = 3; dir.shadow.camera.bottom = -3;
      dir.shadow.camera.updateProjectionMatrix();

      // ── Post-processing: GTAO (crevice AO) + bloom (emissive glow), matching public renderer ──
      const weakDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
        || (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4)
        || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
      if (!weakDevice && (blockData.bg || 'dark') !== 'page') {
        try {
          const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
            import(`${CDN}/examples/jsm/postprocessing/EffectComposer.js`),
            import(`${CDN}/examples/jsm/postprocessing/RenderPass.js`),
            import(`${CDN}/examples/jsm/postprocessing/GTAOPass.js`),
            import(`${CDN}/examples/jsm/postprocessing/UnrealBloomPass.js`),
            import(`${CDN}/examples/jsm/postprocessing/OutputPass.js`),
          ]);
          // Passes drop canvas alpha → reproduce the CSS backdrop gradient in-scene.
          threeScene.background = gradientBgTexture(THREE, blockData.bg || 'dark');
          const pr = Math.min(window.devicePixelRatio, 1.5);
          renderer.setPixelRatio(pr);
          const cw = Math.max(canvas.clientWidth, 1), ch = Math.max(canvas.clientHeight, 1);
          composer = new EffectComposer(renderer);
          composer.setPixelRatio(pr);
          composer.setSize(cw, ch);
          composer.addPass(new RenderPass(threeScene, camera));
          const mb = new THREE.Box3().setFromObject(model);
          const diag = mb.getSize(new THREE.Vector3()).length();
          const gtao = new GTAOPass(threeScene, camera, cw, ch);
          gtao.updateGtaoMaterial({
            radius: Math.max(diag * 0.03, 0.01), distanceExponent: 1, thickness: 1,
            scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false,
          });
          gtao.blendIntensity = 0.8;
          // Texture backgrounds render via an internal PlaneGeometry(2,2) mesh, which the
          // GTAO override pass rasterizes as real 2x2 world geometry — a phantom depth quad.
          // Hide background + invisible shadow floor from the AO G-buffer.
          const gtaoRender = gtao.render.bind(gtao);
          gtao.render = function (...args) {
            const bg = threeScene.background;
            threeScene.background = null;
            ground.visible = false;
            try { gtaoRender(...args); } finally { threeScene.background = bg; ground.visible = true; }
          };
          composer.addPass(gtao);
          // Bloom tuning lives in applyLightPreset (studio: emissive-only; sun: glowing highlights).
          bloomPass = new UnrealBloomPass(new THREE.Vector2(cw, ch), 0.22, 0.4, 1.1);
          composer.addPass(bloomPass);
          composer.addPass(new OutputPass());
          applyLightPreset();
        } catch (e) { composer = null; /* post optional — direct render still looks good */ }
      }
    } catch (err) {
      console.error('[Scene3D admin] model load failed:', err);
      window.toast?.('Could not load 3D model: ' + err.message, 'error');
      loadOverlay.innerHTML = `<div class="s3d-load-text" style="color:#ff9b7a;max-width:85%;line-height:1.5">Couldn't load the model.<br><span style="opacity:.8;font-size:11px">${String(err.message).replace(/</g,'&lt;').slice(0,160)}</span><br><u style="cursor:pointer" onclick="this.closest('.s3d-upload-zone, .s3d-editor-wrap')">Re-upload a different file</u></div>`;
      return;
    }

    resize(); renderFrame();
    renderer.setAnimationLoop(() => { controls.update(); renderFrame(); updateAnnotations(); });

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
    rebuildAnnoEls();
    updateAnnotations();
  }

  let _lastW = 0, _lastH = 0;
  function resize() {
    if (!renderer) return;
    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    if (w === _lastW && h === _lastH) return;  // composer.setSize reallocates targets — only on change
    _lastW = w; _lastH = h;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function renderFrame() {
    if (!renderer) return;
    resize();
    if (composer) composer.render();
    else renderer.render(threeScene, camera);
  }

  // Reproduce the CSS backdrop gradient as a scene background texture (needed when
  // post-processing is on: composer passes don't preserve canvas alpha).
  function gradientBgTexture(THREE, kind) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
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

  // Match the editor viewport background to the chosen public background.
  function applyViewportBg() {
    const bg = blockData.bg || 'dark';   // dark studio backdrop by default (Sketchfab-like)
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
    tr.toneMapping = THREE_LIB.ACESFilmicToneMapping; tr.toneMappingExposure = 1.1;
    if ('outputColorSpace' in tr) tr.outputColorSpace = THREE_LIB.SRGBColorSpace;
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
    onChange(); renderStrip(); updateSaveBtn(); renderTextPanel();
  });

  // Init immediately if editing an existing block with a GLB
  if (blockData.glbUrl) initThree();
}

window.initScene3DEditor = initScene3DEditor;
})();
