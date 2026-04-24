---
name: graphic-mastery
description: |
  Create production-grade graphics, animations, and data visualizations instantly.
  
  **Triggers**: "create a graphic", "build an animation", "make a visualization", "animate this", "design a chart", "generative art", "interactive visualization", "morphing shapes", "canvas animation", "data viz", "SVG animation", "interactive graph", "animated transition", "particle effect", "flow field", or any request for visual content, motion design, or interactive data display.
  
  Supports Canvas, SVG, WebGL, and DOM animations. Outputs are always self-contained HTML files with embedded CSS, JavaScript, and data — zero dependencies on external files or build steps. Handles data visualization (morphing charts, scatter plots, maps), UI animations (smooth transitions, interactive effects), and generative art (procedural visuals, particles, flow fields). Uses D3.js, Flubber, Three.js, p5.js, Recharts, and other visualization libraries.
  
  When the user asks for graphics, animations, or interactive visuals — no matter how they phrase it — invoke this skill immediately.

compatibility: |
  Works in any modern browser (Chrome, Firefox, Safari, Edge)
  No build step, no compilation, no external files
  Libraries are fetched from CDN (D3, Flubber, Three.js, p5.js, Recharts, Canvas utilities)

---

## How This Skill Works

When you ask for a graphic, animation, or visualization, I'll:

1. **Understand your request** — What are you visualizing? What's the interaction model? What's the data or algorithm?
2. **Choose the rendering approach** — Canvas (for performance/particles), SVG (for shapes/morphing), WebGL (for 3D), or DOM (for UI)
3. **Generate a self-contained HTML file** — All code, styles, and data baked in. Copy-paste ready. Open in a browser and it works.
4. **Deliver it to you** — You'll get a `.html` file you can open, share, or embed anywhere.

---

## What I Can Build

### Data Visualization
- **Shape morphing**: Charts that smoothly transition between forms (bar → pie → scatter, etc.)
- **Scrollytelling**: Scroll-triggered animations with synchronized graphics
- **Interactive graphs**: Charts you can hover, click, or drag to explore
- **Maps & geo-spatial**: TopoJSON data rendered and animated
- **Custom charts**: Any shape or layout using D3 scales, layouts, and projections

### UI Animations
- **Micro-interactions**: Buttons, loading states, transitions with personality
- **Page transitions**: Smooth fades, slides, morphs as content changes
- **Animated data updates**: Live charts that redraw when data changes
- **Interactive dashboards**: Real-time updates with animated state changes

### Generative & Creative Art
- **Procedural visuals**: Noise, gradients, fractals, cellular automata
- **Particle systems**: Flowing particles, physics-based motion
- **Flow fields**: Agents following vector fields
- **Animated backgrounds**: Looping generative art
- **Interactive art**: Click/hover-responsive visuals

---

## Key Patterns I Use

### Path Morphing (Flubber + D3)
For smooth shape transitions, I use the same technique your scrollytelling engine uses:
- Generate paths in a **consistent coordinate space** (no transform tricks that break interpolation)
- Use **Flubber** for smooth morphing between arbitrary shapes
- Apply **D3 transitions** with `attrTween()` for control
- Bake arc centers into path coordinates (not transform attributes) so morphing stays smooth

### Canvas for Performance
- Direct drawing for particles, flow fields, procedural art
- Requestanimationframe for 60fps animations
- Efficient pixel manipulation (no DOM overhead)
- WebGL for 3D or massive geometry

### Self-Contained Delivery
Every HTML file includes:
- Inline `<style>` (all CSS)
- Inline `<script>` (all JavaScript)
- Data embedded in the JS (arrays, objects, or inline JSON)
- CDN links for libraries (D3, Flubber, Three.js, p5.js, Recharts)
- No external file dependencies — works offline (except initial library fetch)

---

## How to Ask

Be specific about what you want:

**Good requests:**
- "Animate a morphing bar chart that transitions to a scatter plot when scrolled"
- "Create a generative art piece with particles flowing through a noise field"
- "Build an interactive dashboard that updates when I click on regions"
- "Make a smooth transition between a map and a treemap visualization"
- "Design a loading animation with pulsing geometric shapes"

**Vague requests (I'll ask clarifying questions):**
- "Make something cool with my data" — What story? What format?
- "Animated chart" — Which chart type? What data? What interaction?
- "Interactive visualization" — What interaction? What's being visualized?

Provide:
- **The data** (CSV, JSON, array of objects, or a sample)
- **The interaction** (hover, click, scroll, drag, or none)
- **The style** (playful, professional, minimal, colorful, dark)
- **Any constraints** (specific colors, dimensions, performance needs)

---

## Examples of What I'll Build

### 1. Shape-Morphing Chart
```
User: "Create a chart that morphs from bars to a donut as you scroll down"
Output: HTML file with sticky graphic + scroll-triggered transitions
Uses: SVG + Flubber + D3 + IntersectionObserver
```

### 2. Particle Flow Field
```
User: "Generate a procedural art piece with particles flowing through perlin noise"
Output: HTML file with canvas animation, play/pause controls
Uses: Canvas + Simplex/Perlin noise + requestAnimationFrame
```

### 3. Interactive Data Dashboard
```
User: "Make a dashboard where I can filter regions and see updated charts"
Output: HTML file with clickable filters, animated chart updates
Uses: Recharts + D3 + event listeners
```

### 4. Loading Animation
```
User: "Design a smooth, satisfying loading spinner"
Output: HTML file with looping SVG or Canvas animation
Uses: SVG transforms + CSS animations or Canvas + requestAnimationFrame
```

---

## Technical Approach

### Coordinate Systems
Following your scrollytelling model, I ensure all shapes live in **the same coordinate space**:
- No `transform: translate()` on paths (breaks morphing)
- All geometry baked into path coordinates
- Margins applied to the parent `<g>` or Canvas context, not individual shapes

### Transitions
- **SVG**: D3 transitions with flubber interpolators for smooth morphing
- **Canvas**: requestAnimationFrame loops with easing functions
- **Duration**: Typically 600–1000ms for smooth, noticeable motion
- **Easing**: Cubic easing by default (can customize per request)

### Performance
- **SVG**: Fine for <100 paths. Beyond that, consider Canvas.
- **Canvas**: Fast for particles, procedural art, and high-element count (1000+).
- **Three.js**: For 3D or WebGL-accelerated rendering.
- **Lazy loading**: Only fetch libraries your visualization needs (D3 but not Three.js, etc.)

### Data Handling
- Inline small datasets (<100KB)
- Fetch from URL if user provides endpoint
- Generate procedurally for art/generative work
- Support CSV, JSON, or array-of-objects formats

---

## What Happens Next

1. You ask for a graphic/animation
2. I clarify any ambiguities (data, interaction, style)
3. I build the HTML file
4. You get a `.html` file ready to open and use
5. Want tweaks? Tell me what to change, I'll update it

---

## Limitations & Trade-offs

- **No server required** — All rendering happens client-side (good for distribution, but heavy files may be large)
- **File size** — Inline libraries can make files 100KB–500KB (still small, fast to load)
- **Browser compatibility** — Modern browsers only (Chrome, Firefox, Safari, Edge)
- **Real-time data** — Not built-in (but you can add a fetch loop to poll an API)
- **Responsiveness** — I'll design for common viewport sizes; tell me if you need mobile-specific layouts

---

## Questions?

If something is unclear in my output, or you want me to adjust styling, interaction, performance, or visuals — just say so and I'll refine it.

The goal: **You ask, I deliver a working graphic you can use immediately.**
