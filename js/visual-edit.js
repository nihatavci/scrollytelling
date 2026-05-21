/* visual-edit.js — injected into preview iframe in visual-edit mode */
(function () {
  'use strict';

  const EDITABLE_MAP = {
    // Hero
    '.cin-brand':                               { field: 'brand',        type: 'text' },
    '.cin-main-title':                          { field: 'titleHtml',    type: 'html' },
    '.cin-sub-title':                           { field: 'subtitle',     type: 'text' },
    // Editorial
    '.editorial .kicker':                       { field: 'content', type: 'text', indexed: true, subfield: 'text' },
    '.editorial h2':                            { field: 'content', type: 'text', indexed: true, subfield: 'text' },
    '.editorial .lead':                         { field: 'content', type: 'text', indexed: true, subfield: 'text' },
    '.editorial p:not(.lead):not([style])':     { field: 'content', type: 'html', indexed: true, subfield: 'html' },
    '.pullquote':                               { field: 'content', type: 'text', indexed: true, subfield: 'text' },
    // FullBleed
    '.fullbleed-title':                         { field: 'title',     type: 'html' },
    '.fullbleed-sub':                           { field: 'subtitle',  type: 'text' },
    '.fullbleed-body':                          { field: 'body',      type: 'html' },
    'img.fullbleed-media':                      { field: 'mediaSrc',  type: 'image' },
    // FullscreenImage
    '.fsimg-kicker':                            { field: 'kicker',    type: 'text' },
    '.fsimg-title':                             { field: 'title',     type: 'html' },
    '.fsimg-subtitle':                          { field: 'subtitle',  type: 'text' },
    '.fsimg-body':                              { field: 'body',      type: 'html' },
    '.fsimg-image':                             { field: 'imageSrc',  type: 'image' },
    '.fsimg-caption':                           { field: 'caption',   type: 'text' },
    '.fsimg-credit':                            { field: 'credit',    type: 'text' },
    // Quote
    '.quote-body':                              { field: 'text',         type: 'html' },
    '.quote-attr':                              { field: 'attribution',  type: 'text' },
    '.quote-role':                              { field: 'role',         type: 'text' },
    '.quote-portrait':                          { field: 'portraitSrc',  type: 'image' },
    // Aside
    '.aside-title':                             { field: 'title',  type: 'text' },
    '.aside-body':                              { field: 'body',   type: 'html' },
    // Outro
    '.outro h2':                                { field: 'h2',         type: 'text' },
    '.outro p:not(.final-line):not(.source-block)': { field: 'paragraphs', type: 'text', indexed: true },
    '.outro .final-line':                       { field: 'finalLine',  type: 'text' },
    // ChapterDivider
    '.chapter-number':                          { field: 'number',    type: 'text' },
    '.chapter-title':                           { field: 'title',     type: 'text' },
    '.chapter-sub':                             { field: 'subtitle',  type: 'text' },
    // Scrolly
    '.sc .step-heading':                        { field: 'steps', type: 'text', indexed: true, subfield: 'heading' },
    '.sc .step-body':                           { field: 'steps', type: 'html', indexed: true, subfield: 'body' },
    // DataScrolly
    '.ds-chart-title':                          { field: 'title',    type: 'text' },
    '.ds-chart-sub':                            { field: 'subtitle', type: 'text' },
    '.ds-step-body':                            { field: 'steps', type: 'html', indexed: true, subfield: 'body' },
    // Map2D
    '.map2d-graphic-title':                     { field: 'title',    type: 'text' },
    '.map2d-graphic-sub':                       { field: 'subtitle', type: 'text' },
    '.map2d-step-heading':                      { field: 'steps', type: 'text', indexed: true, subfield: 'heading' },
    '.map2d-step-body':                         { field: 'steps', type: 'html', indexed: true, subfield: 'body' },
    // AudioPlayer
    '.audioplayer-title':                       { field: 'title',        type: 'text' },
    '.audioplayer-subtitle':                    { field: 'subtitle',     type: 'text' },
    '.audioplayer-desc':                        { field: 'description',  type: 'text' },
    '.audioplayer-cover':                       { field: 'coverSrc',     type: 'image' },
    '.audioplayer-caption':                     { field: 'caption',      type: 'text' },
    '.audioplayer-credit':                      { field: 'credit',       type: 'text' },
    // StatRow
    '.statrow-block > h3':                      { field: 'title', type: 'text' },
    '.statrow-cell .v':                         { field: 'stats', type: 'text', indexed: true, subfield: 'value' },
    '.statrow-cell .l':                         { field: 'stats', type: 'text', indexed: true, subfield: 'label' },
    // Timeline
    '.timeline-block > h3':                     { field: 'title', type: 'text' },
    '.timeline-when':                           { field: 'events', type: 'text', indexed: true, subfield: 'when' },
    '.timeline-title':                          { field: 'events', type: 'text', indexed: true, subfield: 'title' },
    '.timeline-body':                           { field: 'events', type: 'html', indexed: true, subfield: 'body' },
    // VideoEmbed
    '.video-caption':                           { field: 'caption',  type: 'text' },
    '.video-credit':                            { field: 'credit',   type: 'text' },
    '.video-iframe':                            { field: 'url',      type: 'url', urlLabel: 'Video URL (YouTube/Vimeo)' },
    '.video-placeholder':                       { field: 'url',      type: 'url', urlLabel: 'Video URL (YouTube/Vimeo)' },
    // EmbedBlock
    '.embed-cap':                               { field: 'caption',  type: 'text' },
    '.embed-container iframe':                  { field: 'url',      type: 'url', urlLabel: 'Embed URL' },
    // ImageCompare
    '.imgcompare-before':                       { field: 'beforeSrc',   type: 'image' },
    '.imgcompare-after':                        { field: 'afterSrc',    type: 'image' },
    '.imgcompare .label-before':                { field: 'beforeLabel', type: 'text' },
    '.imgcompare .label-after':                 { field: 'afterLabel',  type: 'text' },
    '.imgcompare-cap':                          { field: 'caption',     type: 'text' },
    '.imgcompare-credit':                       { field: 'credit',      type: 'text' },
    // ImageHotspot
    '.imghotspot-wrap > img':                   { field: 'src',      type: 'image' },
    '.imghotspot-cap':                          { field: 'caption',  type: 'text' },
    '.imghotspot-credit':                       { field: 'credit',   type: 'text' },
    '.imghotspot-tooltip-title':                { field: 'hotspots', type: 'text', indexed: true, subfield: 'title' },
    '.imghotspot-tooltip-body':                 { field: 'hotspots', type: 'html', indexed: true, subfield: 'body' },
    // AccordionBlock
    '.accordion-block > h3':                    { field: 'title', type: 'text' },
    '.accordion-trigger':                       { field: 'items', type: 'text', indexed: true, subfield: 'heading' },
    '.accordion-panel-inner':                   { field: 'items', type: 'html', indexed: true, subfield: 'body' },
    // ImageGrid
    '.ig-title':                                { field: 'title',   type: 'text' },
    '.ig-caption':                              { field: 'caption', type: 'text' },
    '.ig-credit':                               { field: 'credit',  type: 'text' },
    '.ig-cell img':                             { field: 'images',  type: 'image', indexed: true, subfield: 'src' },
    '.ig-cell-cap':                             { field: 'images',  type: 'text',  indexed: true, subfield: 'caption' },
    '.ig-cell-credit':                          { field: 'images',  type: 'text',  indexed: true, subfield: 'credit' },
    // VizPanel
    '.viz-title':                               { field: 'initialTitle', type: 'text' },
    '.viz-sub':                                 { field: 'initialSub',   type: 'text' },
    // Images
    '.editorial figure img':                    { field: 'content', type: 'image', indexed: true, subfield: 'src' },
    '.scrolly__img':                            { field: 'steps',   type: 'image', indexed: true, subfield: 'imageSrc' },
  };

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    [data-ve] {
      outline: 2px solid transparent;
      outline-offset: 2px;
      transition: outline-color .15s;
      cursor: text;
      min-height: 1em;
    }
    [data-ve]:hover {
      outline-color: #6366f1;
    }
    [data-ve]:focus {
      outline-color: #6366f1;
      outline-width: 2px;
      background: rgba(99,102,241,.04);
      border-radius: 2px;
    }
    [data-ve-img] {
      outline: 2px solid transparent;
      outline-offset: 2px;
      transition: outline-color .15s;
      cursor: pointer;
    }
    [data-ve-img]:hover {
      outline-color: #6366f1;
    }
    [data-ve-url] {
      outline: 2px solid transparent;
      outline-offset: 2px;
      transition: outline-color .15s;
      cursor: pointer;
    }
    [data-ve-url]:hover {
      outline-color: #f59e0b;
    }
    .ve-img-overlay, .ve-url-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,.7);
      color: #fff;
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 6px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 99;
      opacity: 0;
      transition: opacity .2s;
    }
    .ve-img-overlay.visible, .ve-url-overlay.visible { opacity: 1; }
    .ve-url-overlay { background: rgba(180, 100, 0, .8); }
    #ve-badge {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: #6366f1;
      color: #fff;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      padding: 6px 12px;
      border-radius: 100px;
      z-index: 99999;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(99,102,241,.4);
    }
  `;
  // ── Force pointer-events on in edit mode (override mobile CSS that disables them) ──
  // CRITICAL: scrolly images are stacked (position:absolute inset:0) — only the
  // active (visible) one should receive clicks, otherwise the LAST image in DOM
  // always captures the click regardless of which step the user is viewing.
  style.textContent += `
    .scrolly__steps, .ds-steps, .map2d-steps { pointer-events: auto !important; }
    .step, .sc, .ds-step, .ds-step-card, .map2d-step, .map2d-step-card { pointer-events: auto !important; }
    .scrolly__img { pointer-events: none !important; }
    .scrolly__img.active { pointer-events: auto !important; }
  `;
  document.head.appendChild(style);

  // ── Badge ───────────────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.id = 've-badge';
  badge.textContent = 'Visual edit mode';
  document.body.appendChild(badge);

  console.log('[VE] visual-edit.js loaded');

  // ── Helper: get block id from ancestor ──────────────────────────────────────
  function getBlockId(el) {
    const block = el.closest('[data-block-id]');
    return block ? block.getAttribute('data-block-id') : null;
  }

  // ── Helper: get step/item index for indexed fields ──────────────────────────
  // Prefers explicit data-*-idx on a parent (Scrolly, DataScrolly, Map2D) so
  // the index is always correct even when some steps lack the editable element.
  // Falls back to sibling counting for flat arrays (StatRow, Timeline, etc.).
  function getSiblingIndex(el, selector, blockEl) {
    var stepParent = el.closest('[data-step-idx], [data-ds-idx], [data-map-idx]');
    if (stepParent) {
      var idx = stepParent.dataset.stepIdx ?? stepParent.dataset.dsIdx ?? stepParent.dataset.mapIdx;
      if (idx != null) return parseInt(idx, 10);
    }
    var siblings = Array.from(blockEl.querySelectorAll(selector));
    return siblings.indexOf(el);
  }

  // ── Walk blocks and bind editables ─────────────────────────────────────────
  function bindEditables() {
    const blockEls = document.querySelectorAll('[data-block-id]');
    console.log('[VE] bindEditables: found', blockEls.length, 'blocks');

    var totalBound = 0;
    blockEls.forEach(function (blockEl) {
      const blockId = blockEl.getAttribute('data-block-id');

      Object.keys(EDITABLE_MAP).forEach(function (selector) {
        const spec = EDITABLE_MAP[selector];
        const matches = blockEl.querySelectorAll(selector);

        matches.forEach(function (el) {
          if (spec.type === 'text' || spec.type === 'html') {
            if (el.getAttribute('data-ve')) return; // already bound
            totalBound++;
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('data-ve', selector);

            el.addEventListener('blur', function () {
              const index = spec.indexed ? getSiblingIndex(el, selector, blockEl) : undefined;
              const value = spec.type === 'html' ? el.innerHTML : el.textContent;
              window.parent.postMessage({
                type: 'visual-edit',
                action: 'text-change',
                blockId: blockId,
                field: spec.field,
                subfield: spec.subfield || null,
                index: index !== undefined ? index : null,
                value: value,
                valueType: spec.type,
              }, '*');
            });

            el.addEventListener('keydown', function (e) {
              if (e.key === 'Escape') {
                e.preventDefault();
                el.blur();
              }
              // Enter blurs single-line text fields
              if (e.key === 'Enter' && spec.type === 'text') {
                e.preventDefault();
                el.blur();
              }
            });

          } else if (spec.type === 'image') {
            if (el.getAttribute('data-ve-img')) return; // already bound
            totalBound++;
            el.setAttribute('data-ve-img', selector);

            // Add hover tooltip without wrapping (wrapping breaks absolute images)
            if (!el._veOverlay) {
              var overlay = document.createElement('div');
              overlay.className = 've-img-overlay';
              overlay.textContent = 'Click to replace';
              // Attach overlay to nearest positioned ancestor
              var parent = el.parentNode;
              var pStyle = window.getComputedStyle(parent);
              if (pStyle.position === 'static') parent.style.position = 'relative';
              parent.appendChild(overlay);
              el._veOverlay = overlay;
              el.addEventListener('mouseenter', function() { overlay.classList.add('visible'); });
              el.addEventListener('mouseleave', function() { overlay.classList.remove('visible'); });
            }

            el.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              const index = spec.indexed ? getSiblingIndex(el, selector, blockEl) : undefined;
              const currentSrc = el.src || el.getAttribute('src') || el.style.backgroundImage || '';
              console.log('[VE] image-pick:', {
                blockId: blockId,
                field: spec.field,
                subfield: spec.subfield,
                index: index,
                selector: selector,
                elTag: el.tagName,
                stepIdx: el.dataset.stepIdx,
                isActive: el.classList.contains('active'),
              });
              window.parent.postMessage({
                type: 'visual-edit',
                action: 'image-pick',
                blockId: blockId,
                field: spec.field,
                subfield: spec.subfield || null,
                index: index !== undefined ? index : null,
                currentSrc: currentSrc,
              }, '*');
            });

          } else if (spec.type === 'url') {
            if (el.getAttribute('data-ve-url')) return; // already bound
            totalBound++;
            el.setAttribute('data-ve-url', selector);

            // Add hover tooltip
            if (!el._veUrlOverlay) {
              var overlay = document.createElement('div');
              overlay.className = 've-url-overlay';
              overlay.textContent = spec.urlLabel || 'Click to edit URL';
              var parent = el.parentNode;
              var pStyle = window.getComputedStyle(parent);
              if (pStyle.position === 'static') parent.style.position = 'relative';
              parent.appendChild(overlay);
              el._veUrlOverlay = overlay;
              el.addEventListener('mouseenter', function() { overlay.classList.add('visible'); });
              el.addEventListener('mouseleave', function() { overlay.classList.remove('visible'); });
            }

            el.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              // Extract current URL from src attribute or iframe src
              var currentUrl = el.getAttribute('src') || el.getAttribute('href') || '';
              var newUrl = prompt(spec.urlLabel || 'Enter URL:', currentUrl);
              if (newUrl !== null && newUrl !== currentUrl) {
                const index = spec.indexed ? getSiblingIndex(el, selector, blockEl) : undefined;
                window.parent.postMessage({
                  type: 'visual-edit',
                  action: 'text-change',
                  blockId: blockId,
                  field: spec.field,
                  subfield: spec.subfield || null,
                  index: index !== undefined ? index : null,
                  value: newUrl,
                  valueType: 'text',
                }, '*');
                // Notify parent to refresh preview (URL changes need full re-render)
                window.parent.postMessage({
                  type: 'visual-edit',
                  action: 'request-refresh',
                  blockId: blockId,
                }, '*');
              }
            });
          }
        });
      });
    });
    if (totalBound > 0) console.log('[VE] bound', totalBound, 'editable elements');
  }

  // ── Listen for messages from parent ────────────────────────────────────────
  window.addEventListener('message', function (e) {
    const msg = e.data;
    if (!msg || msg.type !== 'visual-edit-response') return;

    if (msg.action === 'image-replaced') {
      // Find the image element and update its src
      const blockEl = document.querySelector('[data-block-id="' + msg.blockId + '"]');
      if (!blockEl) return;

      console.log('[VE] image-replaced received:', {
        blockId: msg.blockId,
        field: msg.field,
        index: msg.index,
        newSrc: (msg.newSrc || '').substring(0, 80) + '…',
      });

      Object.keys(EDITABLE_MAP).forEach(function (selector) {
        const spec = EDITABLE_MAP[selector];
        if (spec.type !== 'image') return;
        if (spec.field !== msg.field) return;

        var el = null;
        if (msg.index !== null) {
          var matches = Array.from(blockEl.querySelectorAll(selector));
          console.log('[VE] image-replaced: selector=' + selector + ' matches=' + matches.length +
            ' looking for index=' + msg.index +
            ' stepIdxValues=[' + matches.map(function(m) { return m.dataset.stepIdx; }).join(',') + ']');
          // Try to find element by step index attribute on itself or parent
          el = matches.find(function(m) {
            if (m.dataset.stepIdx !== undefined) return parseInt(m.dataset.stepIdx, 10) === msg.index;
            if (m.dataset.dsIdx !== undefined) return parseInt(m.dataset.dsIdx, 10) === msg.index;
            if (m.dataset.mapIdx !== undefined) return parseInt(m.dataset.mapIdx, 10) === msg.index;
            var parent = m.closest('[data-step-idx], [data-ds-idx], [data-map-idx]');
            if (parent) {
              var pIdx = parent.dataset.stepIdx ?? parent.dataset.dsIdx ?? parent.dataset.mapIdx;
              return pIdx !== undefined && parseInt(pIdx, 10) === msg.index;
            }
            return matches.indexOf(m) === msg.index;
          }) || null;
        } else {
          el = blockEl.querySelector(selector);
        }
        if (!el) {
          console.log('[VE] image-replaced: no element found for selector=' + selector + ' index=' + msg.index);
          return;
        }

        console.log('[VE] image-replaced: updating', el.tagName, 'stepIdx=' + el.dataset.stepIdx);
        if (el.tagName === 'IMG') {
          el.src = msg.newSrc;
        } else {
          // Placeholder div — swap it for a real <img> so the image renders properly.
          // Keep all relevant classes and data attributes. MutationObserver will re-bind.
          var newImg = document.createElement('img');
          newImg.className = el.className.replace(/scrolly__img-ph/g, '').replace(/\s+/g, ' ').trim();
          newImg.src = msg.newSrc;
          newImg.alt = 'Step ' + ((parseInt(el.dataset.stepIdx || '0', 10)) + 1);
          if (el.dataset.stepIdx !== undefined) newImg.dataset.stepIdx = el.dataset.stepIdx;
          if (el.dataset.dsIdx !== undefined) newImg.dataset.dsIdx = el.dataset.dsIdx;
          if (el.dataset.mapIdx !== undefined) newImg.dataset.mapIdx = el.dataset.mapIdx;
          // Remove old overlay if present
          if (el._veOverlay && el._veOverlay.parentNode) el._veOverlay.parentNode.removeChild(el._veOverlay);
          el.replaceWith(newImg);
        }
      });
    }

    if (msg.action === 'scroll-to-block') {
      const blockEl = document.querySelector('[data-block-id="' + msg.blockId + '"]');
      if (blockEl) {
        blockEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  // ── Click anywhere in a block → tell parent to select it ──────────────────
  function bindBlockClicks() {
    document.querySelectorAll('[data-block-id]').forEach(function(blockEl) {
      if (blockEl.hasAttribute('data-ve-block-click')) return; // already bound
      blockEl.setAttribute('data-ve-block-click', '');
      blockEl.addEventListener('click', function(e) {
        // Don't fire if clicking an editable, image, or URL (those have their own handlers)
        if (e.target.closest('[data-ve]') || e.target.closest('[data-ve-img]') || e.target.closest('[data-ve-url]')) return;
        window.parent.postMessage({
          type: 'visual-edit',
          action: 'select-block',
          blockId: blockEl.dataset.blockId,
        }, '*');
      });
    });
  }

  // ── Hover zones between blocks for inline "+" add ───────────────────────────
  var _zoneUpdateInProgress = false;
  function bindInsertZones() {
    _zoneUpdateInProgress = true;
    // Remove any existing zones first
    document.querySelectorAll('.ve-insert-zone').forEach(function(z) { z.remove(); });

    var blockEls = Array.from(document.querySelectorAll('[data-block-id]'));
    if (blockEls.length < 1) return;

    for (var i = 0; i < blockEls.length; i++) {
      var afterBlock = blockEls[i];
      var afterId = afterBlock.getAttribute('data-block-id');

      var zone = document.createElement('div');
      zone.className = 've-insert-zone';
      zone.setAttribute('data-ve-insert-after', afterId);

      var plusBtn = document.createElement('button');
      plusBtn.className = 've-insert-btn';
      plusBtn.textContent = '+';
      plusBtn.setAttribute('data-ve-insert-after', afterId);
      zone.appendChild(plusBtn);

      // Insert the zone after the block element
      if (afterBlock.nextSibling) {
        afterBlock.parentNode.insertBefore(zone, afterBlock.nextSibling);
      } else {
        afterBlock.parentNode.appendChild(zone);
      }

      // Bind click on the plus button
      (function(aid) {
        plusBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({
            type: 'visual-edit',
            action: 'insert-block',
            afterBlockId: aid,
          }, '*');
        });
      })(afterId);
    }
    // Allow observer to react to real DOM changes again after this frame
    requestAnimationFrame(function() { _zoneUpdateInProgress = false; });
  }

  // Inject CSS for insert zones
  var insertStyle = document.createElement('style');
  insertStyle.textContent = [
    '.ve-insert-zone {',
    '  position: relative;',
    '  height: 0;',
    '  overflow: visible;',
    '  z-index: 100;',
    '}',
    '/* Invisible hover target extending 16px above/below the zero-height line */',
    '.ve-insert-zone::before {',
    '  content: "";',
    '  position: absolute;',
    '  left: 0;',
    '  right: 0;',
    '  top: -16px;',
    '  bottom: -16px;',
    '  cursor: pointer;',
    '  z-index: 1;',
    '}',
    '/* Visible line shown on hover */',
    '.ve-insert-zone::after {',
    '  content: "";',
    '  position: absolute;',
    '  left: 10%;',
    '  right: 10%;',
    '  top: -1px;',
    '  height: 2px;',
    '  background: transparent;',
    '  border-radius: 1px;',
    '  transition: background .2s;',
    '  z-index: 2;',
    '  pointer-events: none;',
    '}',
    '.ve-insert-zone:hover::after {',
    '  background: #6366f1;',
    '}',
    '.ve-insert-btn {',
    '  width: 28px;',
    '  height: 28px;',
    '  border-radius: 50%;',
    '  border: 2px solid #6366f1;',
    '  background: #fff;',
    '  color: #6366f1;',
    '  font-size: 18px;',
    '  font-weight: 600;',
    '  line-height: 1;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  opacity: 0;',
    '  transform: translate(-50%, -50%) scale(0.6);',
    '  transition: opacity .2s, transform .2s, background .15s, color .15s;',
    '  position: absolute;',
    '  top: 0;',
    '  left: 50%;',
    '  z-index: 3;',
    '  padding: 0;',
    '  box-shadow: 0 2px 6px rgba(99,102,241,.25);',
    '}',
    '.ve-insert-zone:hover .ve-insert-btn {',
    '  opacity: 1;',
    '  transform: translate(-50%, -50%) scale(1);',
    '}',
    '.ve-insert-btn:hover {',
    '  background: #6366f1;',
    '  color: #fff;',
    '}',
  ].join('\n');
  document.head.appendChild(insertStyle);

  // ── Initial bind + re-bind on DOM mutations (debounced) ─────────────────────
  function bindAll() { bindEditables(); bindBlockClicks(); bindInsertZones(); }

  // Initial bind — run immediately AND with retries to handle async rendering
  bindAll();
  // Retry a few times in case render() hasn't completed yet
  var retryCount = 0;
  var retryTimer = setInterval(function () {
    retryCount++;
    var blocks = document.querySelectorAll('[data-block-id]');
    var unbound = document.querySelectorAll('[data-block-id] :not([data-ve]):not([data-ve-img])');
    if (blocks.length > 0) {
      bindAll();
      console.log('[VE] retry', retryCount, '— blocks:', blocks.length);
    }
    if (retryCount >= 10) {
      clearInterval(retryTimer);
      console.log('[VE] retries done — blocks:', blocks.length);
    }
  }, 300);

  var bindPending = false;
  var observer = new MutationObserver(function () {
    if (bindPending || _zoneUpdateInProgress) return;
    bindPending = true;
    requestAnimationFrame(function () {
      bindAll();
      bindPending = false;
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
