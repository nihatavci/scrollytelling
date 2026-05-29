// js/motion-fx.js — Scroll-triggered animations for the public content renderer
// Loaded after motion CDN. Provides reveal-on-scroll, counter-up, parallax, stagger.
(function () {
  'use strict';

  // Guard: skip if motion not loaded
  if (!window.Motion) { console.warn('[motion-fx] Motion not loaded'); return; }
  const { animate, stagger, inView, scroll } = window.Motion;

  const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

  // ── Scroll-triggered reveal ───────────────────────────────────
  // Elements with [data-reveal] fade+slide in when they enter the viewport.
  // Options: data-reveal="up" (default), "left", "right", "scale", "fade"
  function bindReveals() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    els.forEach(el => {
      const dir = el.getAttribute('data-reveal') || 'up';
      // Set initial hidden state
      el.style.opacity = '0';
      if (dir === 'up')    el.style.transform = 'translateY(40px)';
      if (dir === 'left')  el.style.transform = 'translateX(-40px)';
      if (dir === 'right') el.style.transform = 'translateX(40px)';
      if (dir === 'scale') el.style.transform = 'scale(0.92)';
    });

    inView('[data-reveal]', (info) => {
      const el = info.target;
      const delay = parseFloat(el.getAttribute('data-reveal-delay') || '0');
      animate(el,
        { opacity: 1, transform: 'translateY(0) translateX(0) scale(1)' },
        { duration: 0.7, easing: EASE_OUT_EXPO, delay }
      );
    }, { amount: 0.15 });
  }

  // ── Stagger children ──────────────────────────────────────────
  // Parent with [data-stagger] animates its children sequentially.
  function bindStagger() {
    const parents = document.querySelectorAll('[data-stagger]');
    parents.forEach(parent => {
      const children = Array.from(parent.children);
      children.forEach(ch => { ch.style.opacity = '0'; ch.style.transform = 'translateY(20px)'; });

      inView(parent, () => {
        const delay = parseFloat(parent.getAttribute('data-stagger') || '0.08');
        animate(children,
          { opacity: 1, transform: 'translateY(0)' },
          { duration: 0.5, delay: stagger(delay), easing: EASE_OUT_EXPO }
        );
      }, { amount: 0.1 });
    });
  }

  // ── Counter up (for statrow values) ───────────────────────────
  // Elements with class .statrow-cell .v count up from 0 to their text content.
  function bindCounters() {
    const els = document.querySelectorAll('.statrow-cell .v');
    if (!els.length) return;

    els.forEach(el => {
      el._counterTarget = el.textContent.trim();
      el._counted = false;
    });

    inView('.statrow-cell .v', (info) => {
      const el = info.target;
      if (el._counted) return;
      el._counted = true;
      const raw = el._counterTarget || el.textContent.trim();

      // Parse: extract number, prefix, suffix (e.g. "2.4M" -> prefix="", num=2.4, suffix="M")
      const match = raw.match(/^([^0-9]*?)([\d,.]+)(.*)$/);
      if (!match) return; // not a number, skip

      const prefix = match[1];
      const numStr = match[2].replace(/,/g, '');
      const suffix = match[3];
      const target = parseFloat(numStr);
      if (isNaN(target)) return;

      const hasDecimal = numStr.includes('.');
      const decimalPlaces = hasDecimal ? (numStr.split('.')[1] || '').length : 0;

      el.textContent = prefix + '0' + suffix;

      // Use motion's animate on a proxy object
      const proxy = { v: 0 };
      animate(proxy, { v: target }, {
        duration: 1.2,
        easing: EASE_OUT_EXPO,
        onUpdate: () => {
          const formatted = hasDecimal ? proxy.v.toFixed(decimalPlaces) : Math.round(proxy.v).toLocaleString('de-DE');
          el.textContent = prefix + formatted + suffix;
        },
      });
    }, { amount: 0.3 });
  }

  // ── Parallax (subtle shift on scroll) ─────────────────────────
  function bindParallax() {
    const els = document.querySelectorAll('[data-parallax]');
    els.forEach(el => {
      const speed = parseFloat(el.getAttribute('data-parallax') || '0.15');
      scroll(
        animate(el, { transform: [`translateY(${speed * -60}px)`, `translateY(${speed * 60}px)`] }),
        { target: el, offset: ['start end', 'end start'] }
      );
    });
  }

  // ── Auto-reveal: add data-reveal to common scrollytelling elements ─
  function autoTag() {
    // Editorial sections
    document.querySelectorAll('.editorial').forEach(sec => {
      sec.querySelectorAll('h2, .lead, .kicker').forEach(el => {
        if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'up');
      });
    });
    // Figures
    document.querySelectorAll('figure, .ig-cell').forEach(el => {
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'up');
    });
    // Quote blocks
    document.querySelectorAll('.quote-block').forEach(el => {
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'up');
    });
    // Timeline events
    document.querySelectorAll('.timeline-list').forEach(el => {
      if (!el.hasAttribute('data-stagger')) el.setAttribute('data-stagger', '0.1');
    });
    // Stat rows
    document.querySelectorAll('.statrow-grid').forEach(el => {
      if (!el.hasAttribute('data-stagger')) el.setAttribute('data-stagger', '0.12');
    });
    // Chapter dividers
    document.querySelectorAll('.chapter-divider, .chapter-hero').forEach(el => {
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'scale');
    });
    // Fullscreen image overlays
    document.querySelectorAll('.fsimg-overlay').forEach(el => {
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'up');
    });
    // Aside / context blocks
    document.querySelectorAll('.aside-block').forEach(el => {
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'left');
    });
  }

  // ── 3D tilt toward pointer (.fx-tilt) ──
  function bindTilt() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.fx-tilt').forEach(el => {
      if (el._fxTiltBound) return;
      el._fxTiltBound = true;
      const MAX = 8; // degrees
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(800px) rotateY(${px * MAX}deg) rotateX(${-py * MAX}deg)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // ── Init: called after content:ready ──────────────────────────
  function init() {
    // autoTag() removed — auto-reveal animations on text/figures were
    // unwanted (user reported content "zooming in" on scroll).
    // bindReveals and bindStagger still work for manually placed data-reveal attrs.
    bindReveals();
    bindStagger();
    bindCounters();
    bindParallax();
    bindTilt();
  }

  // Wait for render.js to fire content:ready, or run now if already rendered
  if (document.querySelector('#page-root')?.children.length) {
    requestAnimationFrame(init);
  } else {
    document.addEventListener('content:ready', () => requestAnimationFrame(init), { once: true });
  }

  // Expose for manual use
  window.MFX = { init, bindReveals, bindStagger, bindCounters, bindParallax, bindTilt, autoTag };
})();
