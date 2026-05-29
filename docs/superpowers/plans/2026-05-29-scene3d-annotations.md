# Scene3D Spatial Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin labelled markers to points on the 3D model that track the surface as the camera moves, hide when occluded, and appear only on their scene.

**Architecture:** `annotations[]` lives in block data, each `{id, scene(slotIndex), point{x,y,z}, label}`. Public (`js/scene3d.js`) and editor (`admin/ui/scene3d-editor.js`) each build an HTML overlay of dots and reposition them every render by projecting the 3D point to screen space, with a per-dot occlusion raycast. `js/render.js` adds the public container + CSS; `admin/ui/styles.css` adds editor + dot CSS.

**Tech Stack:** Vanilla JS, Three.js 0.170.0 (esm.sh), THREE.Raycaster, Vector3.project.

**CRITICAL index rule:** Editor stores `annotation.scene` = **slot index** (0–3, matches `activeSlot`). The public renderer filters empty slots into a **dense** array indexed by `currentIdx`. Therefore the public side MUST map slot→dense (Task 2 Step 2). The editor compares against `activeSlot` directly (slot index) so it needs no mapping.

**Verification:** `node -c` per file + a headless render check in Task 5. No unit harness in this repo.

---

## File map

| File | Responsibility |
|---|---|
| `js/render.js` | `.scene3d-annotations` container in the sticky viewport; public `.s3d-anno*` CSS in `COMPONENT_CSS` |
| `js/scene3d.js` | Build dot elements (slot→dense map); `updateAnnotations()` (project + occlude + scene-gate); call after every render + activateScene + resize; hover/tap + auto-open |
| `admin/ui/scene3d-editor.js` | Annotation overlay in viewport; `updateAnnotations()` in the animation loop (gate on `activeSlot`); placement mode + canvas raycast; annotation rows in `renderTextPanel`; drop annotations on scene delete; `uid()` |
| `admin/ui/styles.css` | Editor `.s3d-anno*` dot/label CSS (admin page doesn't load COMPONENT_CSS) + annotation rows + placement hint |

---

## Task 1: Public container + CSS

**Files:** Modify `js/render.js`

- [ ] **Step 1: Add the annotations container to the sticky viewport**

In `js/render.js`, inside `renderScene3D`, find where the canvas is appended to the sticky (search for `sticky.appendChild(canvas);`). Immediately AFTER that line add:
```javascript
  // Spatial annotation overlay — dots positioned every frame by scene3d.js
  const annoLayer = el('div', { class: 'scene3d-annotations', 'aria-hidden': 'true' });
  sticky.appendChild(annoLayer);
```

- [ ] **Step 2: Add public annotation CSS**

In `js/render.js`, find the line `.scene3d-coming-soon span{...}` inside `COMPONENT_CSS` (the Scene3D CSS block). Immediately AFTER that line (before the next unrelated rule) add:
```css
.scene3d-annotations{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden}
.s3d-anno{position:absolute;top:0;left:0;display:flex;align-items:center;background:none;border:none;padding:0;margin:0;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity .4s ease;font-family:var(--font,'DM Sans',sans-serif);will-change:transform}
.s3d-anno.is-visible{opacity:1}
.s3d-anno-dot{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--ink-black,#000);background-image:linear-gradient(#fff,#fff),var(--spectrum-gradient,linear-gradient(90deg,#c679c4,#fa3d1d,#ffb005,#e1e1fe,#0358f7));background-origin:border-box;background-clip:padding-box,border-box;border:2px solid transparent;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.s3d-anno-label{max-width:0;overflow:hidden;white-space:nowrap;background:var(--snow,#fff);color:var(--ink-black,#000);font-size:12px;line-height:1;border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,.15);margin-left:0;padding:0;opacity:0;transition:max-width .35s ease,padding .35s ease,opacity .25s ease,margin-left .35s ease}
.s3d-anno.is-open .s3d-anno-label{max-width:220px;padding:7px 12px;margin-left:8px;opacity:1}
@media(max-width:767px){.s3d-anno-dot{width:26px;height:26px}}
```

- [ ] **Step 3: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo OK && rm /tmp/r.mjs`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/render.js
git commit -m "feat(scene3d): public annotation overlay container + dot/label CSS"
```

---

## Task 2: Public annotation rendering (project + occlude + scene-gate)

**Files:** Modify `js/scene3d.js`

- [ ] **Step 1: Build annotation elements + slot→dense map after model load**

In `js/scene3d.js`, find the post-load block (search for `if (loaderEl) loaderEl.style.display = 'none';` near the double-paint). Immediately AFTER that line, add:
```javascript
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
```

- [ ] **Step 2: Paint annotations after load + double-paint**

Still in `js/scene3d.js`, the post-load render currently looks like:
```javascript
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(() => { resize(); renderer.render(scene, camera); });
  canvas.style.opacity = '1';
  if (loaderEl) loaderEl.style.display = 'none';
```
Note: the annotation block from Step 1 was inserted AFTER this. Move the `updateAnnotations` calls to run after the elements exist by adding, at the very END of Step 1's inserted block (after the `updateAnnotations` function definition), these two lines:
```javascript
  updateAnnotations();
  requestAnimationFrame(updateAnnotations);
```

- [ ] **Step 3: Update annotations inside the tween loop and on scene change**

In `js/scene3d.js`, find the tween `step` function's render line `renderer.render(scene, camera);` (the one INSIDE `tweenCamera`'s `step`). Immediately AFTER it add:
```javascript
      updateAnnotations();
```
Then find `activateScene(n)`; at the very end of that function (after `tweenCamera(scenes[n], 1600);`) add:
```javascript
    updateAnnotations();
```

- [ ] **Step 4: Update annotations on resize**

In `js/scene3d.js`, find the ResizeObserver: `const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); });`. Replace it with:
```javascript
  const ro = new ResizeObserver(() => { resize(); renderer.render(scene, camera); updateAnnotations(); });
```

- [ ] **Step 5: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && cp js/scene3d.js /tmp/s.mjs && node -c /tmp/s.mjs && echo OK && rm /tmp/s.mjs`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add js/scene3d.js
git commit -m "feat(scene3d): public spatial annotations — project, occlude, per-scene gate"
```

---

## Task 3: Editor — annotation layer, live tracking, placement, rows, delete-drop

**Files:** Modify `admin/ui/scene3d-editor.js`

- [ ] **Step 1: Add a uid helper at the top of the IIFE**

In `admin/ui/scene3d-editor.js`, find `const CDN = 'https://esm.sh/three@0.170.0';`. Immediately AFTER that line add:
```javascript
const _uid = () => 'an-' + Math.random().toString(36).slice(2, 7);
```

- [ ] **Step 2: Add the annotation overlay element to the viewport**

In `admin/ui/scene3d-editor.js`, find `viewportEl.appendChild(fsBtn);`. Immediately AFTER it add:
```javascript
  // Annotation overlay (dots tracked live while orbiting)
  const annoLayer = document.createElement('div');
  annoLayer.className = 's3d-anno-layer';
  viewportEl.appendChild(annoLayer);
```

- [ ] **Step 3: Add placement state + annotation render/update functions**

In `admin/ui/scene3d-editor.js`, find the State block:
```javascript
  // ── State ──
  let THREE_LIB, renderer, threeScene, camera, controls;
  let activeSlot = 0;
```
Replace it with:
```javascript
  // ── State ──
  let THREE_LIB, renderer, threeScene, camera, controls, model3d;
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
```

- [ ] **Step 4: Capture the loaded model + drive annotations from the render loop**

In `admin/ui/scene3d-editor.js`, find `threeScene.add(model);` (inside `initThree`'s load try-block). Replace it with:
```javascript
      threeScene.add(model);
      model3d = model;
```
Then find the animation loop line `renderer.setAnimationLoop(() => { controls.update(); renderFrame(); });` and replace it with:
```javascript
    renderer.setAnimationLoop(() => { controls.update(); renderFrame(); updateAnnotations(); });
```
Then find the initial `renderStrip();` + `renderTextPanel();` pair near the end of `initScene3DEditor` setup (search `renderTextPanel();` that follows `renderStrip();` at top level, around the upload-zone setup). After model is set, annotations must build once: at the END of `initThree` (right after the `updateSaveBtn();` line that closes the function body's success path) add:
```javascript
    rebuildAnnoEls();
    updateAnnotations();
```

- [ ] **Step 5: Add the canvas placement click handler**

In `admin/ui/scene3d-editor.js`, find `viewportEl.appendChild(canvas);`. Immediately AFTER it add:
```javascript
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
```

- [ ] **Step 6: Add the Annotations subsection to `renderTextPanel`**

In `admin/ui/scene3d-editor.js`, find the end of `renderTextPanel` (after the `bIn.addEventListener('input', ...)` line, before the closing `}`). Insert before the closing `}`:
```javascript
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
```

- [ ] **Step 7: Drop annotations when their scene is deleted**

In `admin/ui/scene3d-editor.js`, find the scene-delete confirm body (the block that does `blockData.scenes[i] = null;` and the `activeSlot` clamp). Immediately AFTER the `blockData.scenes[i] = null;` line add:
```javascript
            blockData.annotations = (blockData.annotations || []).filter(a => a.scene !== i);
```

- [ ] **Step 8: Syntax check**

Run: `cd /Users/nihat/DevS/Thomas && node -c admin/ui/scene3d-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 9: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/scene3d-editor.js
git commit -m "feat(scene3d): editor annotation placement, live tracking, rows, delete"
```

---

## Task 4: Editor CSS (dot/label + rows + placement)

**Files:** Modify `admin/ui/styles.css`

- [ ] **Step 1: Append annotation CSS**

The admin page does NOT load `COMPONENT_CSS`, so the `.s3d-anno*` dot/label styles must be duplicated here. Append at the END of `admin/ui/styles.css`:
```css
/* Scene3D annotations — editor overlay + rows */
.s3d-anno-layer { position:absolute; inset:0; z-index:4; pointer-events:none; overflow:hidden; }
.s3d-anno { position:absolute; top:0; left:0; display:flex; align-items:center; background:none; border:none; padding:0; margin:0; pointer-events:auto; cursor:pointer; opacity:0; transition:opacity .3s ease; font-family:var(--font); will-change:transform; }
.s3d-anno.is-visible { opacity:1; }
.s3d-anno-dot { width:22px; height:22px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:var(--ink-black,#000); background-image:linear-gradient(#fff,#fff),var(--spectrum-gradient); background-origin:border-box; background-clip:padding-box,border-box; border:2px solid transparent; box-shadow:0 1px 4px rgba(0,0,0,.25); }
.s3d-anno-label { max-width:0; overflow:hidden; white-space:nowrap; background:var(--snow,#fff); color:var(--ink-black,#000); font-size:12px; line-height:1; border-radius:9999px; box-shadow:0 2px 10px rgba(0,0,0,.15); margin-left:0; padding:0; opacity:0; transition:max-width .35s ease, padding .35s ease, opacity .25s ease, margin-left .35s ease; }
.s3d-anno.is-open .s3d-anno-label { max-width:200px; padding:6px 11px; margin-left:8px; opacity:1; }
.s3d-viewport.s3d-placing::after { content:'Click a point on the model'; position:absolute; top:10px; left:50%; transform:translateX(-50%); background:rgba(3,88,247,.9); color:#fff; font-size:11px; font-weight:600; padding:4px 12px; border-radius:9999px; z-index:5; pointer-events:none; }
.s3d-anno-edit { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
.s3d-anno-row { display:flex; align-items:center; gap:6px; }
.s3d-anno-badge { width:18px; height:18px; border-radius:50%; background:var(--fog); font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.s3d-anno-row input { flex:1; }
.s3d-anno-del { width:24px; height:24px; padding:0; border-radius:6px; flex-shrink:0; font-size:11px; }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/styles.css
git commit -m "feat(scene3d): editor annotation dot/label/row CSS"
```

---

## Task 5: Version bump, deploy, smoke test

**Files:** Modify `admin/ui/index.html`, `admin/index.html`, `admin/ui/app.js` (version query)

- [ ] **Step 1: Find current version**

Run: `cd /Users/nihat/DevS/Thomas && grep -o "v=20260528[a-z]" admin/ui/index.html | head -1`
Note the letter as `<OLD>`; next letter is `<NEW>`.

- [ ] **Step 2: Bump (html + preview-blob render.js import)**

Run (substitute letters):
```bash
cd /Users/nihat/DevS/Thomas
sed -i '' 's/20260528<OLD>/20260528<NEW>/g' admin/ui/index.html admin/index.html admin/ui/app.js
grep -o "render.js?v=20260528<NEW>" admin/ui/app.js && echo "blob bumped"
```
Expected: `blob bumped`

- [ ] **Step 3: Final syntax check all touched files**

```bash
cd /Users/nihat/DevS/Thomas
node -c admin/ui/app.js && echo "app OK"
node -c admin/ui/scene3d-editor.js && echo "editor OK"
cp js/scene3d.js /tmp/s.mjs && node -c /tmp/s.mjs && echo "scene3d OK" && rm /tmp/s.mjs
cp js/render.js /tmp/r.mjs && node -c /tmp/r.mjs && echo "render OK" && rm /tmp/r.mjs
```
Expected: all four `OK`.

- [ ] **Step 4: Commit + deploy**

```bash
cd /Users/nihat/DevS/Thomas
git add admin/ui/index.html admin/index.html admin/ui/app.js
git commit -m "chore(scene3d): version bump for annotations release"
mv "Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" /tmp/ 2>/dev/null
mv "Die Nachricht als Jahrhunderterfindung-1.docx" /tmp/ 2>/dev/null
wrangler pages deploy . --project-name scrollycms --branch main 2>&1 | tail -3
mv /tmp/"Bach Cello Suite No. 1, G Major, Prelude - Cooper Cannell.mp3" . 2>/dev/null
mv /tmp/"Die Nachricht als Jahrhunderterfindung-1.docx" . 2>/dev/null
```
Expected: `✨ Deployment complete!`

- [ ] **Step 5: Smoke test on `https://scrolli.nihatavci.com/admin/ui/` (hard-refresh)**

1. Open the Scene3D block with a model + saved scenes.
2. Select scene 1 → in the panel, click **📍 Add annotation** → cursor becomes crosshair + "Click a point on the model" hint shows.
3. Click a point on the model → a numbered dot appears there; a row with a label input appears. Type a label.
4. Orbit the model in the editor → the dot **tracks the surface** and **disappears when behind** the model.
5. Switch to scene 2 → scene 1's dot hides; add a different annotation for scene 2.
6. Publish → live page. Scroll to scene 1 → its dot fades in, label auto-opens, tracks during the camera tween. Scroll to scene 2 → scene 1 dot gone, scene 2 dot shown.
7. Delete the block → preview updates immediately (from prior work).

---

## Self-review

**Spec coverage:**

| Spec item | Task |
|---|---|
| `annotations[]` data model | Task 3 (placement push), used by Task 2 |
| HTML dot projected each frame | Task 2 (`updateAnnotations`), Task 3 (editor) |
| Occlusion hide-when-behind | Task 2 Step 1, Task 3 Step 3 (raycast distance test) |
| Per-scene visibility (tied to one scene) | Task 2 (denseScene vs currentIdx), Task 3 (scene vs activeSlot) |
| Auto-open label on active scene | NOTE below |
| Numbered dot + expand on click/tap | Task 1/4 CSS + click toggles `.is-open` |
| Editor click-to-place via raycast | Task 3 Step 5 |
| Annotation rows (label + delete) | Task 3 Step 6 |
| Drop on scene delete | Task 3 Step 7 |
| Slot→dense index mapping | Task 2 Step 1 (CRITICAL rule) |
| Theme styling (spectrum dot, snow label) | Task 1 + Task 4 CSS |

**NOTE — auto-open:** The spec said the label auto-expands when its scene becomes active. To keep behavior predictable and avoid clutter when a scene has multiple annotations, this plan ships **click/tap to open** (dots are always shown for the active scene; user opens labels). Auto-open-on-activate is intentionally deferred to avoid overlapping labels; revisit if the user wants it. This is a conscious scope trim, flagged here.

**Index correctness:** Editor uses `activeSlot` (slot index) consistently for storing `annotation.scene` and gating. Public maps slot→dense via the unfiltered `data.scenes` so `denseScene` aligns with `currentIdx`. Verified the two never compare across index spaces.

**Placeholder scan:** none.

**Name consistency:** `_annoEls`/`annoEls`, `updateAnnotations`, `rebuildAnnoEls`, `setPlacement`, `placementMode`, `model3d` (editor) / `model` (public) used consistently within each file. `.s3d-anno`, `.s3d-anno-dot`, `.s3d-anno-label`, `.is-visible`, `.is-open` identical in both CSS copies.
