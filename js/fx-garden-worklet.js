// js/fx-garden-worklet.js — CSS Paint worklet for the generative backdrop (.fx-genbg).
// Registered via CSS.paintWorklet.addModule() in render.js when supported.
// Draws soft overlapping spectrum-tinted blobs — a calm, premium texture.
registerPaint('fxGarden', class {
  paint(ctx, size) {
    const { width: w, height: h } = size;
    const colors = ['rgba(198,121,196,0.20)', 'rgba(250,61,29,0.16)', 'rgba(255,176,5,0.16)', 'rgba(3,88,247,0.18)'];
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, w, h);
    // Deterministic pseudo-random blobs (no Math.random — stable per size)
    const seeded = (n) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 5; i++) {
      const cx = seeded(i + 1) * w;
      const cy = seeded(i + 7) * h;
      const r = (0.25 + seeded(i + 13) * 0.35) * Math.max(w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, colors[i % colors.length]);
      g.addColorStop(1, 'rgba(248,248,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
});
