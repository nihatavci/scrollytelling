// admin/ui/motion.js — Animation utilities using motion.dev standalone API
// Loaded after the motion CDN script (window.Motion available)
(function () {
  'use strict';

  const { animate, spring, stagger } = window.Motion;

  // ── Spring configs (app-like feel) ─────────────────────────────
  const SPRING_SNAPPY  = { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 };
  const SPRING_BOUNCY  = { type: 'spring', stiffness: 400, damping: 22, mass: 1 };
  const SPRING_GENTLE  = { type: 'spring', stiffness: 300, damping: 28, mass: 1.2 };
  const EASE_OUT_EXPO  = [0.16, 1, 0.3, 1];

  // ── Modal: open with scale+fade, close with scale+fade ─────────
  function animateModalIn(backdrop, modal) {
    if (!backdrop || !modal) return;
    animate(backdrop, { opacity: [0, 1] }, { duration: 0.2, easing: 'ease-out' });
    animate(modal,
      { opacity: [0, 1], transform: ['scale(0.95) translateY(12px)', 'scale(1) translateY(0)'] },
      { duration: 0.3, easing: EASE_OUT_EXPO }
    );
  }

  function animateModalOut(backdrop, modal) {
    if (!backdrop || !modal) return Promise.resolve();
    animate(modal,
      { opacity: [1, 0], transform: ['scale(1) translateY(0)', 'scale(0.97) translateY(8px)'] },
      { duration: 0.15, easing: [0.4, 0, 1, 1] }
    );
    return animate(backdrop, { opacity: [1, 0] }, { duration: 0.2 }).finished;
  }

  // ── Toast: slide up from bottom + fade ─────────────────────────
  function animateToastIn(el) {
    if (!el) return;
    animate(el,
      { opacity: [0, 1], transform: ['translateY(16px) scale(0.96)', 'translateY(0) scale(1)'] },
      { duration: 0.35, easing: EASE_OUT_EXPO }
    );
  }

  function animateToastOut(el) {
    if (!el) return Promise.resolve();
    return animate(el,
      { opacity: [1, 0], transform: ['translateY(0) scale(1)', 'translateY(-8px) scale(0.96)'] },
      { duration: 0.2, easing: [0.4, 0, 1, 1] }
    ).finished;
  }

  // ── Accordion: smooth height + fade content ────────────────────
  function animateAccordionOpen(bodyEl) {
    if (!bodyEl) return;
    bodyEl.style.display = 'block';
    bodyEl.style.overflow = 'hidden';
    const h = bodyEl.scrollHeight;
    animate(bodyEl,
      { height: ['0px', h + 'px'], opacity: [0, 1] },
      { duration: 0.3, easing: EASE_OUT_EXPO }
    ).finished.then(() => {
      bodyEl.style.height = 'auto';
      bodyEl.style.overflow = '';
    });
  }

  function animateAccordionClose(bodyEl) {
    if (!bodyEl) return Promise.resolve();
    const h = bodyEl.scrollHeight;
    bodyEl.style.height = h + 'px';
    bodyEl.style.overflow = 'hidden';
    return animate(bodyEl,
      { height: [h + 'px', '0px'], opacity: [1, 0] },
      { duration: 0.2, easing: [0.4, 0, 1, 1] }
    ).finished.then(() => {
      bodyEl.style.display = 'none';
      bodyEl.style.height = '';
      bodyEl.style.overflow = '';
    });
  }

  // ── Block list items: staggered fade-in ────────────────────────
  function animateBlockListIn(items) {
    if (!items || !items.length) return;
    animate(items,
      { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] },
      { duration: 0.3, delay: stagger(0.04), easing: EASE_OUT_EXPO }
    );
  }

  // ── Bottom sheet: slide up with spring ─────────────────────────
  function animateSheetOpen(menu, backdrop) {
    if (backdrop) animate(backdrop, { opacity: [0, 1] }, { duration: 0.25 });
    if (menu) animate(menu, { transform: ['translateY(100%)', 'translateY(0)'] }, SPRING_BOUNCY);
  }

  function animateSheetClose(menu, backdrop) {
    if (!menu) return Promise.resolve();
    if (backdrop) animate(backdrop, { opacity: [1, 0] }, { duration: 0.2 });
    return animate(menu,
      { transform: ['translateY(0)', 'translateY(100%)'] },
      { duration: 0.25, easing: [0.4, 0, 1, 1] }
    ).finished;
  }

  // ── Page transition: content swap fade ─────────────────────────
  function animatePageSwap(container) {
    if (!container) return;
    animate(container,
      { opacity: [0.4, 1], transform: ['translateY(6px)', 'translateY(0)'] },
      { duration: 0.3, easing: EASE_OUT_EXPO }
    );
  }

  // ── Chevron rotate (accordion arrow) ──────────────────────────
  function animateChevron(el, open) {
    if (!el) return;
    animate(el, { transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }, { duration: 0.25, easing: EASE_OUT_EXPO });
  }

  // ── Published banner: slide up ────────────────────────────────
  function animateBannerIn(el) {
    if (!el) return;
    animate(el,
      { transform: ['translateY(100%)', 'translateY(0)'] },
      { duration: 0.4, easing: EASE_OUT_EXPO }
    );
  }

  // ── Palette cards: staggered entrance ─────────────────────────
  function animatePaletteIn(cards) {
    if (!cards || !cards.length) return;
    animate(cards,
      { opacity: [0, 1], transform: ['translateY(12px) scale(0.97)', 'translateY(0) scale(1)'] },
      { duration: 0.35, delay: stagger(0.03, { from: 'first' }), easing: EASE_OUT_EXPO }
    );
  }

  // ── Drag reorder: lifted card spring ──────────────────────────
  function animateDragLift(el) {
    if (!el) return;
    animate(el,
      { transform: 'scale(1.03)', boxShadow: '0 8px 32px rgba(0,0,0,.15)' },
      SPRING_SNAPPY
    );
  }

  function animateDragDrop(el) {
    if (!el) return;
    animate(el,
      { transform: 'scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
      SPRING_SNAPPY
    );
  }

  // ── Expose all utilities ──────────────────────────────────────
  window.MX = {
    animateModalIn,
    animateModalOut,
    animateToastIn,
    animateToastOut,
    animateAccordionOpen,
    animateAccordionClose,
    animateBlockListIn,
    animateSheetOpen,
    animateSheetClose,
    animatePageSwap,
    animateChevron,
    animateBannerIn,
    animatePaletteIn,
    animateDragLift,
    animateDragDrop,
    // Raw access for custom one-offs
    animate,
    spring,
    stagger,
    SPRING_SNAPPY,
    SPRING_BOUNCY,
    SPRING_GENTLE,
    EASE_OUT_EXPO,
  };
})();
