# Arealis Zord — Project Guide

## Overview
Multi-service financial-intent processing platform. The operator UI lives in `backend/zord-console` (Next.js 14, Tailwind, TypeScript). All frontend work targets that directory.

## Frontend Stack (`backend/zord-console`)
- **Framework**: Next.js 14 (App Router)
- **Styling**: TailwindCSS with custom Zord design tokens
- **Animation**: Framer Motion
- **Icons**: Lucide React (never emoji as icons)
- **Language**: TypeScript (strict)

## Zord Design Tokens (always use these — never raw hex)

### Admin/Ops UI (dark base)
| Token | Purpose |
|---|---|
| `bg-zord-base-main` (`#0B1220`) | Page background |
| `bg-zord-base-panel` (`#111827`) | Card / panel background |
| `bg-zord-base-table` (`#0F172A`) | Table row background |
| `border-zord-base-border` (`#1F2937`) | Borders and dividers |
| `text-zord-base-text-primary` (`#E5E7EB`) | Primary text |
| `text-zord-base-text-secondary` (`#9CA3AF`) | Muted / secondary text |
| `bg-zord-blue-600` (`#2563EB`) | Primary action / CTA |
| `bg-zord-blue-500` (`#3B82F6`) | Hover state |
| `bg-zord-blue-700` (`#1D4ED8`) | Pressed state |

### Customer UI (light purple/teal)
Uses `cx-purple-*`, `cx-teal-*`, `cx-energy-*` — see `tailwind.config.ts`.

### Status
`zord-status-healthy/degraded/failed/active/neutral` — always use for status badges, never custom colors.

## Frontend Design Skills — Active
Skills in `.claude/skills/` are active for all frontend tasks:

1. **frontend-design** — Anthropic's aesthetic direction, typography, bold choices
2. **bencium-impact-designer** — Production-grade components, avoids generic AI aesthetics
3. **web-design-guidelines** — 100+ accessibility/UX/performance rules
4. **react-best-practices** — Next.js/React performance (waterfalls, bundle size, SSR)
5. **composition-patterns** — Component architecture, avoid boolean prop proliferation
6. **ui-ux-pro-max** — 67 UI styles, 161 palettes, 57 font pairings, design system generator

## Frontend Conventions
- 4px border-radius everywhere (`rounded-zord` or `rounded`)
- All clickable elements: `cursor-pointer` + hover state with `transition-colors duration-150`
- Focus states must be visible (`focus:ring-2 focus:ring-zord-blue-500`)
- Motion: respect `prefers-reduced-motion` — wrap Framer Motion behind the hook
- Responsive breakpoints: 375px / 768px / 1024px / 1440px
- Contrast: 4.5:1 minimum (text on background)
- No emojis as icons — use Lucide React SVGs only

## Directory Layout
```
backend/zord-console/
  app/                 # Next.js App Router pages
    admin/             # Operator admin views
    console/           # Ops console
    customer/          # Customer-facing portal
    payout-command-view/
  components/          # Shared UI components
  services/            # API client functions
  types/               # TypeScript types
  utils/               # Shared utilities
```

## Services
| Service | Port | Purpose |
|---|---|---|
| zord-console | 3000 | Next.js UI |
| zord-edge | 8080 | Ingestion API |
| zord-intent-engine | 8081 | Intent processing |
| zord-outcome-engine | 8082 | Outcome correlation |

## Git
- Branch: `swaroop/mfa-from-main` (current active branch)
- Main branch: `main`
- Never force-push main; always PR
