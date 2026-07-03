# Frontend Skills — Activation Guide

Skills are loaded from `.claude/skills/`. When doing any frontend/UI work, apply them in this priority order:

## Skill Priority for Frontend Tasks

1. **bencium-impact-designer** — First. Sets the creative bar: production-grade, distinctive, avoids generic AI aesthetics. Based on Anthropic's frontend skill but more opinionated.
2. **frontend-design** — Aesthetic direction: typography choices, visual hierarchy, design decisions that don't look templated.
3. **web-design-guidelines** — Compliance layer: accessibility (WCAG 2.1 AA), focus states, forms, animation, touch, dark mode, i18n.
4. **react-best-practices** — Performance layer: no waterfalls, bundle size, SSR patterns, re-render optimization.
5. **composition-patterns** — Architecture layer: compound components, state lifting, avoid prop drilling.
6. **ui-ux-pro-max** — Design system generation: use when starting a new page/section and need to pick style, palette, or typography.

## When to Apply Each Skill

| Task | Skills to apply |
|---|---|
| New page or section | ui-ux-pro-max → bencium-impact-designer → frontend-design |
| Fixing existing component | bencium-impact-designer + web-design-guidelines |
| Performance audit | react-best-practices |
| Refactoring components | composition-patterns |
| Accessibility review | web-design-guidelines |
| Visual redesign | frontend-design + bencium-impact-designer |

## Zord-Specific Design Direction
The Zord Console is a **financial ops dashboard** — think dense data, real-time status, operator-grade tooling. Not a marketing site. Design principles:
- Information density over whitespace (operators scan, not browse)
- Muted status colors — never alarm fatigue from overly bright indicators
- Subtle animations (200ms max transitions) — data changes should be noticeable, not distracting
- Dark mode is the primary surface (zord-base-main `#0B1220`)
- Customer-facing pages (`/customer/*`) get the cx-purple palette and are more approachable

## Pre-Delivery Checklist (apply to every component)
- [ ] Uses Zord design tokens, not raw hex
- [ ] `cursor-pointer` on all interactive elements
- [ ] Hover state with `transition-colors duration-150`
- [ ] `focus:ring-2 focus:ring-zord-blue-500` visible focus
- [ ] Lucide React icons only (no emoji)
- [ ] `prefers-reduced-motion` respected for Framer Motion
- [ ] Responsive at 375 / 768 / 1024 / 1440px
- [ ] Contrast ≥ 4.5:1 on primary text
