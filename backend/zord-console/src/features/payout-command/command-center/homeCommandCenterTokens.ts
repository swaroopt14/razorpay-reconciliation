/**
 * Home / Today / Batch command center — Manrope scale (see `homeDashboardTypography.tsx`).
 * Titles #000000 · supporting prose imperial blue #00239C · micro labels #888888 · accent black in components.
 */
export const HOME_TITLE_BLACK = 'text-[#000000]'
export const HOME_BODY_IMPERIAL =
  'text-[15px] font-medium leading-[1.6] text-[#00239C]'
export const HOME_BODY_IMPERIAL_CENTERED =
  'mx-auto max-w-[520px] text-[15px] font-medium leading-[1.6] text-[#00239C]'
export const HOME_BODY_IMPERIAL_SM = 'text-[13px] font-medium leading-relaxed text-[#00239C]'
/** Slightly larger supporting line (e.g. stat card sublabels). */
export const HOME_BODY_IMPERIAL_MD = 'text-[14px] font-medium leading-relaxed text-[#00239C]'

export const HOME_INSIGHT_PROSE =
  'text-[13px] font-medium leading-relaxed tracking-[0] text-[#00239C]'
export const HOME_INSIGHT_PROSE_STRONG = 'font-semibold text-[#000000]'
/** Insight / editorial body: 20px with inline extrabold hits from `emphasizeInsightPercentages`. */
export const HOME_INSIGHT_EDITORIAL =
  'text-[20px] font-normal leading-[1.45] tracking-[0] text-[#00239C]'

export const PAYOUT_ACCENT_BLACK = '#000000'
export const PAYOUT_ACCENT_BLACK_RING = 'rgba(0,0,0,0.22)'
export const PAYOUT_BADGE_BLACK = 'bg-[#000000] text-white'

/** @deprecated Use PAYOUT_ACCENT_BLACK — kept for imports that reference HOME_NEON */
export const HOME_NEON = PAYOUT_ACCENT_BLACK
/** @deprecated Use PAYOUT_ACCENT_BLACK_RING */
export const HOME_NEON_RING = PAYOUT_ACCENT_BLACK_RING

/** Black micro-labels for KPI / exception categories (batch + command center). */
export const COMMAND_CENTER_LABEL_GREEN =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#000000]'
export const COMMAND_CENTER_LABEL_BLACK = COMMAND_CENTER_LABEL_GREEN

/** Canonical intelligence blue gradient (Home insights + Leakage hero). */
export const INTELLIGENCE_BLUE_GRADIENT =
  'linear-gradient(140deg,#4a6fe6 0%,#103a9e 28%,#00239c 52%,#5c7ec9 100%)'

/** White KPI card shell for journal and routing KPI sections. */
export const COMMAND_CENTER_KPI_CARD =
  'relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_10px_44px_rgba(15,23,42,0.07)] ring-1 ring-black/[0.03]'

/** Black stat tiles inside journal batch overview (Intent + Settlement). */
export const JOURNAL_KPI_STAT_CARD =
  'rounded-xl border border-white/12 bg-[#0A0A0A] px-4 py-3.5 shadow-[0_10px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10'
export const JOURNAL_KPI_STAT_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55'
export const JOURNAL_KPI_STAT_VALUE =
  'mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white'
export const JOURNAL_KPI_STAT_VALUE_MONO =
  'mt-1 break-all font-mono text-[14px] font-semibold tabular-nums tracking-tight text-white'

/** Black insight callout (white copy) — batch trend / ops hints. */
export const COMMAND_CENTER_INSIGHT_GREEN_CARD =
  'rounded-xl bg-[#000000] px-4 py-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.32)] ring-1 ring-white/25'

/** Journal hero — black account-insight style (Intent + Settlement gross value). */
export const JOURNAL_HERO_BLACK_CARD =
  'relative overflow-hidden rounded-[20px] border border-white/10 bg-[#0A0A0A] shadow-[0_16px_48px_rgba(0,0,0,0.38)] ring-1 ring-white/10'

/** Dark donut / outcome-mix card (matches account insight carousel density). */
export const JOURNAL_INSIGHT_DARK_CARD =
  'relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0B0B0F] shadow-[0_12px_40px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.06]'

export const JOURNAL_INSIGHT_DARK_LABEL = 'text-[13px] font-medium text-white/90'
export const JOURNAL_INSIGHT_DARK_MUTED = 'text-[12px] font-medium text-white/55'
export const JOURNAL_INSIGHT_DARK_LEGEND = 'text-[13px] font-medium text-white/80'

export const COMMAND_CENTER_INSIGHT_GREEN_TEXT =
  'text-[13px] font-medium leading-relaxed text-white'

/** Outer wash behind the white console card (Home + Batch + Sandbox). */
export const PAYOUT_PAGE_BG_CLASS = 'bg-[#e8eef5]'
/** Carousel / command cool blue — same token used on Leakage & Ambiguity pages. */
export const COMMAND_COOL_PAGE_BG = 'bg-[#e8eef5]'
/** Whitish minimal warm beige — Home command band + Batch body. */
export const PAYOUT_WARM_SURFACE_BG_CLASS = 'bg-[#f4f4f1]'
/** White elevated console card (nav + surfaces). */
export const PAYOUT_CONSOLE_CARD_CLASS =
  'w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]'
