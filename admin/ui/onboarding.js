// admin/ui/onboarding.js
// Dependency-free welcome modal + guided tour for first-time users.
// Exposed as window.Onboarding; triggered from app.js loadPages() on first login.
(function () {
  'use strict';

  const STEPS = [
    { sel: '#page-title-wrap',    text: "This is a demo page we made for you. Click the title to rename it, use ▾ to switch pages — it's yours to experiment with." },
    { sel: '#btn-new-page',       text: "Create your own page here. Just type a title; the URL is generated for you." },
    { sel: '#btn-preview',        text: "Preview shows your page live in a new tab before you publish." },
    { sel: '#btn-publish',        text: "Publish pushes your page to its public URL so anyone can read it." },
  ];

  function el(tag, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function showWelcome() {
    const back = el('div', 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:4000;display:flex;align-items:center;justify-content:center;');
    const card = el('div', 'background:#fff;border-radius:16px;max-width:440px;width:90%;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:inherit;');
    card.appendChild(el('div', 'font:600 20px/1.2 inherit;color:#1a1a2e;margin-bottom:10px;', 'Welcome to Scrolli Labs 👋'));
    card.appendChild(el('p', 'color:#57606a;font-size:14px;line-height:1.6;margin:0 0 20px;',
      "Build scrollytelling stories that come alive as readers scroll. We've created a demo page so you can see how it works — take a quick tour and you'll be publishing in minutes."));
    const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
    const skip = el('button', 'padding:9px 16px;border-radius:8px;border:1px solid #e1e4e8;background:#fff;cursor:pointer;font:inherit;font-size:13px;', 'Skip');
    const go = el('button', 'padding:9px 18px;border-radius:8px;border:none;background:#1a1a2e;color:#fff;cursor:pointer;font:inherit;font-size:13px;font-weight:600;', 'Take the tour');
    row.appendChild(skip); row.appendChild(go); card.appendChild(row); back.appendChild(card);
    document.body.appendChild(back);
    const close = () => back.remove();
    skip.addEventListener('click', close);
    go.addEventListener('click', () => { close(); startTour(); });
  }

  function startTour() {
    const steps = STEPS.filter(s => document.querySelector(s.sel));
    if (!steps.length) return;
    let i = 0;
    const back = el('div', 'position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:4000;');
    const tip = el('div', 'position:fixed;z-index:4001;background:#fff;border-radius:12px;max-width:300px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:inherit;');
    document.body.appendChild(back); document.body.appendChild(tip);
    const cleanup = () => { back.remove(); tip.remove(); document.querySelectorAll('.onboarding-hl').forEach(n => n.classList.remove('onboarding-hl')); };

    function render() {
      document.querySelectorAll('.onboarding-hl').forEach(n => n.classList.remove('onboarding-hl'));
      const step = steps[i];
      const anchor = document.querySelector(step.sel);
      if (!anchor) { next(); return; }
      anchor.classList.add('onboarding-hl');
      anchor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = anchor.getBoundingClientRect();
      tip.innerHTML = '';
      tip.appendChild(el('p', 'margin:0 0 14px;font-size:13.5px;line-height:1.55;color:#1a1a2e;', step.text));
      const row = el('div', 'display:flex;justify-content:space-between;align-items:center;');
      row.appendChild(el('span', 'font-size:12px;color:#8a94a6;', `${i + 1} / ${steps.length}`));
      const btns = el('div', 'display:flex;gap:6px;');
      const skip = el('button', 'padding:6px 12px;border-radius:7px;border:1px solid #e1e4e8;background:#fff;cursor:pointer;font:inherit;font-size:12px;', 'Skip');
      const nextBtn = el('button', 'padding:6px 14px;border-radius:7px;border:none;background:#1a1a2e;color:#fff;cursor:pointer;font:inherit;font-size:12px;font-weight:600;', i === steps.length - 1 ? 'Done' : 'Next');
      skip.addEventListener('click', cleanup);
      nextBtn.addEventListener('click', next);
      btns.appendChild(skip); btns.appendChild(nextBtn); row.appendChild(btns); tip.appendChild(row);
      // Position below the anchor, clamped to viewport.
      const top = Math.min(r.bottom + 10, window.innerHeight - tip.offsetHeight - 12);
      const left = Math.max(12, Math.min(r.left, window.innerWidth - tip.offsetWidth - 12));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    }
    function next() { i++; if (i >= steps.length) { cleanup(); return; } render(); }
    render();
  }

  window.Onboarding = {
    maybeRun() { showWelcome(); },
    startTour,
  };
})();
