# Zord Admin Console - Blue-First Visual Aesthetic

## Design Philosophy

**"Zord uses blue to guide attention, not to decorate."**

This design system creates an AWS-level serious admin console with Zord's own blue-first visual identity, avoiding "pretty SaaS dashboard" territory.

## Core Design Principle

- **Blue** = action & focus
- **Gray** = data & truth  
- **Red** = danger only
- **Green** = confirmation, not celebration

**No gradients. No neon. No playful motion.**

## Color System

### Zord Blue - Primary Color System

- **Blue-600 (#2563EB)**: Primary blue (Zord Blue)
  - Primary buttons
  - Active navigation item
  - Focus ring
  - Primary links
  - Selected table rows

- **Blue-700 (#1D4ED8)**: Pressed state
- **Blue-500 (#3B82F6)**: Hover state, links
- **Blue-50 (#EFF6FF)**: Selection background (lightest allowed)
- **Blue-800 (#1E3A8A)**: Selected table rows (subtle)

### Neutral Base (90% of admin UI)

- **Main Background**: `#0B1220` (zord-base-main)
- **Panel Background**: `#111827` (zord-base-panel)
- **Table Rows**: `#0F172A` (zord-base-table)
- **Borders/Dividers**: `#1F2937` (zord-base-border)
- **Primary Text**: `#E5E7EB` (zord-text-primary)
- **Secondary Text**: `#9CA3AF` (zord-text-secondary)

### Status Colors (Muted, Not Loud)

| Status | Color | Hex |
|--------|-------|-----|
| Healthy | Muted green | #16A34A |
| Degraded | Amber | #CA8A04 |
| Failed | Red | #DC2626 |
| Active | Blue | #2563EB |
| Neutral | Gray | #9CA3AF |

**Never mix blue with green meaning.**

## Component Guidelines

### Buttons

**Primary Button (Zord Action)**
- Background: `#2563EB` (zord-blue-600)
- Text: `#FFFFFF`
- Border: none
- Radius: 4px
- Hover: `#1D4ED8` (zord-blue-700)

**Secondary Button**
- Background: transparent
- Border: 1px solid `#1F2937` (zord-base-border)
- Text: `#E5E7EB` (zord-text-primary)
- Hover: Background `#111827` (zord-base-panel)

**Destructive (Rare)**
- Background: `#7F1D1D`
- Text: `#FECACA`
- Only for: Kill switches, emergency disable

### Tables

- Header background: `#111827` (zord-base-panel)
- Row background: `#0F172A` (zord-base-table)
- Row hover: `#111827` (zord-base-panel)
- Selected row: `#1E3A8A` (zord-blue-800, subtle)
- Links inside tables: `#3B82F6` (zord-blue-500), hover: underline only
- No pill badges inside tables — use text + icons

### Navigation (Sidebar)

**Active Item**
- Left border: 3px solid `#2563EB` (zord-blue-600)
- Text: `#E5E7EB` (zord-text-primary)
- Background: `#0F172A` (zord-base-table)

**Inactive**
- Text: `#9CA3AF` (zord-text-secondary)

**No icons with colors. Icons are monochrome.**

### Focus & Accessibility

Focus ring:
- `outline: 2px solid #2563EB`
- `outline-offset: 2px`

This is WCAG compliant and keyboard friendly.

### Charts (Rare, Blue-Tinted)

If charts exist (Stream Consumers only):
- Line color: `#3B82F6` (zord-blue-500)
- Grid lines: `#1F2937` (zord-base-border)
- Axis labels: `#9CA3AF` (zord-text-secondary)
- No filled areas unless debugging

## Implementation

### Tailwind Classes

Use the custom Zord color classes:
- `bg-zord-base-main`, `bg-zord-base-panel`, `bg-zord-base-table`
- `text-zord-text-primary`, `text-zord-text-secondary`
- `border-zord-base-border`
- `bg-zord-blue-600`, `text-zord-blue-500`, etc.
- `text-zord-status-healthy`, `text-zord-status-degraded`, `text-zord-status-failed`

### Component Classes

Pre-built component classes in `globals.css`:
- `.btn-zord-primary`
- `.btn-zord-secondary`
- `.btn-zord-destructive`
- `.table-zord`
- `.badge-zord-healthy`, `.badge-zord-degraded`, etc.

## What This Achieves

With this system:
- Console feels as serious as AWS
- But visually distinct with blue identity
- Blue reinforces control, trust, engineering
- No one mistakes this for a marketing dashboard
