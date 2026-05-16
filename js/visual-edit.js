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
    // FullscreenImage
    '.fsimg-kicker':                            { field: 'kicker',    type: 'text' },
    '.fsimg-title':                             { field: 'title',     type: 'html' },
    '.fsimg-subtitle':                          { field: 'subtitle',  type: 'text' },
    '.fsimg-body':                              { field: 'body',      type: 'html' },
    '.fsimg-image':                             { field: 'imageSrc',  type: 'image' },
    // Quote
    '.quote-text':                              { field: 'text',         type: 'text' },
    '.quote-name':                              { field: 'attribution',  type: 'text' },
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
    '.sc h3':                                   { field: 'steps', type: 'html', indexed: true, subfield: 'body' },
    // Map2D
    '.map2d-step-body':                         { field: 'steps', type: 'html', indexed: true, subfield: 'body' },
    // AudioPlayer
    '.audioplayer-title':                       { field: 'title',        type: 'text' },
    '.audioplayer-subtitle':                    { field: 'subtitle',     type: 'text' },
    '.audioplayer-desc':                        { field: 'description',  type: 'text' },
    // StatRow
    '.statrow-cell .v':                         { field: 'stats', type: 'text', indexed: true, subfield: 'value' },
    '.statrow-cell .l':                         { field: 'stats', type: 'text', indexed: true, subfield: 'label' },
    // Timeline
    '.timeline-when':                           { field: 'events', type: 'text', indexed: true, subfield: 'when' },
    '.timeline-title':                          { field: 'events', type: 'text', indexed: true, subfield: 'title' },
    '.timeline-body':                           { field: 'events', type: 'html', indexed: true, subfield: 'body' },
    // Images
    '.editorial figure img':                    { field: 'content', type: 'image', indexed: true, subfield: 'src' },
    '.scrolly-step-image':                      { field: 'steps',   type: 'image', indexed: true, subfield: 'imageSrc' },
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
      position: relative;
    }
    [data-ve-img]:hover {
      outline-color: #6366f1;
    }
    [data-ve-img-wrap] {
      position: relative;
      display: inline-block;
    }
    [data-ve-img-wrap]::after {
      content: '📷 Click to replace';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,.65);
      color: #fff;
      font-size: 13px;
      padding: 6px 12px;
      border-radius: 6px;
      pointer-events: none;
      opacity: 0;
      transition: opacity .15s;
      white-space: nowrap;
    }
    [data-ve-img-wrap]:hover::after {
      opacity: 1;
    }
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
  document.head.appendChild(style);

  // ── Badge ───────────────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.id = 've-badge';
  badge.textContent = '✏️ Visual edit mode';
  document.body.appendChild(badge);

  // ── Helper: get block id from ancestor ──────────────────────────────────────
  function getBlockId(el) {
    const block = el.closest('[data-block-id]');
    return block ? block.getAttribute('data-block-id') : null;
  }

  // ── Helper: get sibling index among matching selector within block ───────────
  function getSiblingIndex(el, selector, blockEl) {
    const siblings = Array.from(blockEl.querySelectorAll(selector));
    return siblings.indexOf(el);
  }

  // ── Walk blocks and bind editables ─────────────────────────────────────────
  function bindEditables() {
    const blockEls = document.querySelectorAll('[data-block-id]');

    blockEls.forEach(function (blockEl) {
      const blockId = blockEl.getAttribute('data-block-id');

      Object.keys(EDITABLE_MAP).forEach(function (selector) {
        const spec = EDITABLE_MAP[selector];
        const matches = blockEl.querySelectorAll(selector);

        matches.forEach(function (el) {
          if (spec.type === 'text' || spec.type === 'html') {
            if (el.getAttribute('data-ve')) return; // already bound
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
            el.setAttribute('data-ve-img', selector);

            // Wrap in tooltip container (only if not already wrapped)
            if (!el.parentElement.hasAttribute('data-ve-img-wrap')) {
              const wrapper = document.createElement('span');
              wrapper.setAttribute('data-ve-img-wrap', '');
              el.parentNode.insertBefore(wrapper, el);
              wrapper.appendChild(el);
            }

            el.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              const index = spec.indexed ? getSiblingIndex(el, selector, blockEl) : undefined;
              const currentSrc = el.src || el.getAttribute('src') || el.style.backgroundImage || '';
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
          }
        });
      });
    });
  }

  // ── Listen for messages from parent ────────────────────────────────────────
  window.addEventListener('message', function (e) {
    const msg = e.data;
    if (!msg || msg.type !== 'visual-edit-response') return;

    if (msg.action === 'image-replaced') {
      // Find the image element and update its src
      const blockEl = document.querySelector('[data-block-id="' + msg.blockId + '"]');
      if (!blockEl) return;

      // Find the matching image by selector + index
      Object.keys(EDITABLE_MAP).forEach(function (selector) {
        const spec = EDITABLE_MAP[selector];
        if (spec.type !== 'image') return;
        if (spec.field !== msg.field) return;

        const matches = Array.from(blockEl.querySelectorAll(selector));
        const el = msg.index !== null ? matches[msg.index] : matches[0];
        if (!el) return;

        if (el.tagName === 'IMG') {
          el.src = msg.newSrc;
        } else {
          el.style.backgroundImage = 'url(' + msg.newSrc + ')';
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
        // Don't fire if clicking an editable or image (those have their own handlers)
        if (e.target.closest('[data-ve]') || e.target.closest('[data-ve-img]')) return;
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
    '  height: 20px;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: height .2s;',
    '  z-index: 100;',
    '}',
    '.ve-insert-zone::before {',
    '  content: "";',
    '  position: absolute;',
    '  left: 10%;',
    '  right: 10%;',
    '  top: 50%;',
    '  height: 2px;',
    '  background: transparent;',
    '  border-radius: 1px;',
    '  transition: background .2s;',
    '}',
    '.ve-insert-zone:hover {',
    '  height: 32px;',
    '}',
    '.ve-insert-zone:hover::before {',
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
    '  transform: scale(0.6);',
    '  transition: opacity .2s, transform .2s, background .15s, color .15s;',
    '  position: relative;',
    '  z-index: 2;',
    '  padding: 0;',
    '  box-shadow: 0 2px 6px rgba(99,102,241,.25);',
    '}',
    '.ve-insert-zone:hover .ve-insert-btn {',
    '  opacity: 1;',
    '  transform: scale(1);',
    '}',
    '.ve-insert-btn:hover {',
    '  background: #6366f1;',
    '  color: #fff;',
    '}',
  ].join('\n');
  document.head.appendChild(insertStyle);

  // ── Initial bind + re-bind on DOM mutations (debounced) ─────────────────────
  function bindAll() { bindEditables(); bindBlockClicks(); bindInsertZones(); }
  bindAll();

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
