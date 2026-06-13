# Product

## Register

product

## Users
Content creators and editors building scrollytelling stories in ScrollyCMS — a visual, block-based CMS. They are non-engineers working in the admin editor: uploading media, arranging blocks, and tuning rich interactive blocks (3D models, WebGL, scrolly sequences). On any given screen they are *in a task* (composing or adjusting a block), not browsing.

## Product Purpose
ScrollyCMS lets non-technical authors produce magazine-grade interactive stories — including drag-to-rotate 3D models with cinematic lighting — and publish them to the web. Success is an author getting a professional-looking result without touching code, and trusting the tool the way they'd trust Figma or Linear.

## Brand Personality
Confident, quiet, precise. The tool disappears into the task; craft shows through restraint, not decoration. Voice is plain and direct (button labels say what they do). Moments of polish (a crisp focus ring, a smooth state change) over pages of flourish.

## Anti-references
- **Generic Bootstrap/SaaS**: default-looking buttons, flat gray pills, the "AI made this" look.
- **Heavy glassmorphism**: blur/translucency as decoration. Used only where it earns contrast over live 3D, never as a default surface.
- **Game-engine HUD**: busy Unity/Unreal-style overlays, gizmo clutter, many floating widgets.

## Design Principles
1. **The model is the hero.** Viewport chrome recedes until needed; controls never compete with the 3D content.
2. **One control vocabulary.** Every viewport button shares the same shape, surface, and state behavior. If two buttons look different, one is wrong.
3. **Earned familiarity.** Standard affordances for standard actions — a dropdown looks like a dropdown, a primary action looks primary. No invented widgets.
4. **Show state, not decoration.** Motion and color convey hover/focus/active/selected/loading — nothing else.

## Accessibility & Inclusion
WCAG AA: body/control text ≥4.5:1 against its backdrop (including over live 3D), visible keyboard focus on every control, `prefers-reduced-motion` fallbacks, and real labels/titles on icon-only buttons.
