# Scene3D: Drag-to-Rotate + Sun Light Preset

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Two features, nothing more: (1) viewers can drag to rotate the model on the published page, (2) an outdoor "Sun" light preset selectable in the editor (warm strong key light, longer shadows), alongside the existing Studio look.

**Architecture:** Public renderer (`js/scene3d.js`) wraps the model in a pivot `Group`; pointer-drag rotates the pivot (yaw + clamped pitch) — the scroll-driven camera tweens are untouched, so the two never fight. Light preset is a `data.light` field (`'studio'` default | `'sun'`) read by both renderers; the editor gets a small viewport toolbar with Background + Light selects (bg previously had no UI either).

**Tech Stack:** three.js r170 via esm.sh (existing), vanilla JS editor.

---

### Task 1: Public renderer — sun preset + drag-to-rotate

**Files:** Modify: `js/scene3d.js`

- [ ] **Step 1: Light preset.** After env setup, branch on `data.light === 'sun'`: ambient 0.05, key dir warm `0xffd9a8` intensity 2.6 at `(6, 8, 4)`, rim 0.15, `environmentIntensity 0.55`, ground shadow opacity 0.45. Studio keeps current values (0.1 / 0.8 white / 0.3 / env 1.3 / shadow 0.32).
- [ ] **Step 2: Pivot group.** `const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot)` (replaces `scene.add(model)`). Ground stays outside pivot.
- [ ] **Step 3: Drag handlers.** pointerdown/move/up on canvas: yaw `pivot.rotation.y += dx*0.005`, pitch `pivot.rotation.x` clamped to ±0.5, `canvas.style.touchAction='pan-y'` (vertical swipe still scrolls page), cursor grab/grabbing, call `drawFrame()` on move. Inertia: simple velocity decay rAF.
- [ ] **Step 4: Syntax check.** `node --input-type=module --check < js/scene3d.js` → OK.

### Task 2: Editor — sun preset + viewport toolbar (Background, Light)

**Files:** Modify: `admin/ui/scene3d-editor.js`

- [ ] **Step 1: Keep refs** to ambient/dir/dir2/ground; extract `applyLightPreset()` applying the same numbers as Task 1; call it after lights + shadow rig creation.
- [ ] **Step 2: Toolbar.** Small pill toolbar in viewport top-left: `Background: Dark|Studio|Page` and `Light: Studio|Sun` selects bound to `blockData.bg`/`blockData.light`; on change → `onChange()`, `applyViewportBg()`, update `threeScene.background` gradient texture if composer active, `applyLightPreset()`, `renderFrame()`.
- [ ] **Step 3: Syntax check.** `node --check admin/ui/scene3d-editor.js` → OK.

### Task 3: Verify in browser harness

- [ ] **Step 1:** Re-create `_hdri_test.html` harness (inline `__PAGE_DATA__`, DamagedHelmet, `bg:'dark'`); screenshot default (studio).
- [ ] **Step 2:** Set `light:'sun'` in harness data; screenshot — expect warm key, longer/darker shadow.
- [ ] **Step 3:** Synthetic pointerdown/move/up via preview_eval; screenshot — model visibly rotated, no console errors.
- [ ] **Step 4:** Delete harness.

### Task 4: Ship

- [ ] **Step 1:** Commit both files + plan (`feat(3d): drag-to-rotate + sun light preset`).
- [ ] **Step 2:** Push to main, `npm run deploy`.
- [ ] **Step 3:** Verify prod: `curl https://scrollycms.pages.dev/js/scene3d.js | grep -c "light.*sun\|pivot"` ≥ 1; same for editor file.
