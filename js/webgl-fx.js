// js/webgl-fx.js — WebGL showpiece effects framework + effect factories.
// Lazy-loaded by render.js only when a WebGL block exists on the page.
// Public: initWebGLFx(blockId, kind, data), disposeWebGLFx(blockId)
// kinds: 'gradient' | 'flowmap' | 'particles'

const _CDN = 'https://esm.sh/three@0.170.0';
let _threePromise = null;
function loadThree() {
  if (!_threePromise) _threePromise = import(_CDN);
  return _threePromise;
}

const _active = new Map(); // blockId → { dispose }

export async function initWebGLFx(blockId, kind, data) {
  const sec = document.getElementById('webglfx-' + blockId);
  if (!sec) return;
  const canvas = sec.querySelector('.webgl-fx-canvas');
  if (!canvas) return;

  // Re-init guard (admin soft-refresh) — tear down the old instance first.
  if (_active.has(blockId)) { try { _active.get(blockId).dispose(); } catch (_) {} }

  // Guards → static CSS fallback shows.
  if (typeof window.WebGLRenderingContext === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let THREE;
  try { THREE = await loadThree(); } catch (_) { return; }

  const isMobile = window.innerWidth < 768;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile });
  } catch (_) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

  let effect = null;
  try {
    if (kind === 'gradient') effect = createGradient(THREE, renderer, data);
    // flowmap / particles added in later phases
  } catch (e) { console.error('[webgl-fx] effect build failed:', e); renderer.dispose(); return; }
  if (!effect) { renderer.dispose(); return; }

  function fit() {
    const w = Math.max(canvas.clientWidth, 1), h = Math.max(canvas.clientHeight, 1);
    renderer.setSize(w, h, false);
    if (effect.resize) effect.resize(w, h);
  }
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);

  let raf = null, running = false;
  const t0 = performance.now();
  function loop(now) {
    if (!running) return;
    effect.render((now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  // Run only while in/near the viewport.
  const io = new IntersectionObserver((es) => { es[0].isIntersecting ? start() : stop(); }, { rootMargin: '200px' });
  io.observe(sec);

  function dispose() {
    stop();
    ro.disconnect();
    io.disconnect();
    if (effect.dispose) effect.dispose();
    renderer.dispose();
    _active.delete(blockId);
  }
  _active.set(blockId, { dispose });
}

export function disposeWebGLFx(blockId) {
  _active.get(blockId)?.dispose();
}

// ───────────────────────── Effect: Shader Gradient ─────────────────────────
// Domain-warped value-noise blend of up to 4 brand colors on a full-screen quad.

const GRAD_VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

const GRAD_FRAG = `
precision highp float;
uniform float u_time;
uniform vec2  u_res;
uniform vec3  u_c0, u_c1, u_c2, u_c3;

// Hash + value noise + fbm (compact, dependency-free)
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for(int i=0;i<5;i++){ v += amp*noise(p); p *= 2.0; amp *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float asp = u_res.x / max(u_res.y, 1.0);
  vec2 p = uv; p.x *= asp;
  // Domain warp for an organic flow
  float t = u_time;
  vec2 q = vec2(fbm(p + vec2(0.0, t*0.15)), fbm(p + vec2(5.2, t*0.12)));
  vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2) + t*0.1), fbm(p + 4.0*q + vec2(8.3, 2.8) - t*0.1));
  float n = fbm(p + 3.0*r);
  // Blend 4 colors across the noise field
  vec3 col = mix(u_c0, u_c1, smoothstep(0.0, 0.4, n));
  col = mix(col, u_c2, smoothstep(0.35, 0.7, n));
  col = mix(col, u_c3, smoothstep(0.65, 1.0, n));
  // gentle vignette
  float vig = smoothstep(1.25, 0.2, length(uv - 0.5));
  col *= 0.85 + 0.15 * vig;
  gl_FragColor = vec4(col, 1.0);
}`;

function createGradient(THREE, renderer, data) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const stops = (Array.isArray(data.colors) && data.colors.length ? data.colors : ['#c679c4', '#fa3d1d', '#ffb005', '#0358f7']).slice(0, 4);
  while (stops.length < 4) stops.push(stops[stops.length - 1]);
  const speed = data.speed != null ? parseFloat(data.speed) : 0.3;
  const uniforms = {
    u_time: { value: 0 },
    u_res: { value: new THREE.Vector2(1, 1) },
    u_c0: { value: new THREE.Color(stops[0]) },
    u_c1: { value: new THREE.Color(stops[1]) },
    u_c2: { value: new THREE.Color(stops[2]) },
    u_c3: { value: new THREE.Color(stops[3]) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: GRAD_VERT, fragmentShader: GRAD_FRAG });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);
  return {
    render(t) { uniforms.u_time.value = t * speed; renderer.render(scene, cam); },
    resize(w, h) { uniforms.u_res.value.set(w, h); },
    dispose() { quad.geometry.dispose(); mat.dispose(); },
  };
}
