import {
  PAYOUT_BATCH_COMMAND_CENTER_LIVE_PATH,
  PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH,
} from './batchCommandCenterHref'

export type GlyphName =
  | 'home'
  | 'document'
  | 'menu-dots'
  | 'search'
  | 'users'
  | 'bank'
  | 'folder'
  | 'shield'
  | 'grid'
  | 'eye'
  | 'eye-off'
  | 'zap'
  | 'refresh'
  | 'arrow-up-right'
  | 'chart'
  | 'bell'
  | 'terminal'
  | 'key'
  | 'copy'
  | 'check'
  | 'lock'
  | 'settlement'
  | 'billing'
  | 'support'

export type DockId =
  | 'home'
  | 'workspace'
  | 'leakage'
  | 'ambiguity'
  | 'verification'
  | 'monitoring'
  | 'grid'
  | 'settlement'
  | 'connectors'
  | 'proof'
  | 'sandbox'
  | 'billing'
  | 'support'

/** Dock IDs in sandbox top nav: Today → Intent → Settlement → Billing. */
export const SANDBOX_DOCK_IDS: DockId[] = ['home', 'grid', 'settlement', 'billing']

/** Temporarily hide Connectors from nav and routing; connector code remains in the repo. */
export const CONNECTORS_DOCK_TEMPORARILY_HIDDEN = true

/** Short labels for sandbox dock pills only (page titles stay full names). */
export const SANDBOX_DOCK_DISPLAY_LABELS: Partial<Record<DockId, string>> = {
  grid: 'Intent',
  settlement: 'Settlement',
}
export type WorkspaceTab =
  | 'Today'
  | 'Value at Risk'
  | 'Proof'
  | 'Sources'
  | 'Actions'
  | 'Routing'
/** Command center time window. 'Quarter' is set by the `onQuarterChange` handler
 * in PayoutCommandViewClient when the user picks a specific quarter. */
export type HomeTimeframe = 'Today' | 'Week' | 'Month' | 'Year' | 'Custom' | 'Quarter'

export type HomeSourceFilter = 'All' | 'Loan System' | 'Payment Partner'
export type HomeMethodFilter = 'All' | 'NACH' | 'LSM' | 'Bank Transfer'
export type HomeStatusFilter = 'All' | 'Confirmed' | 'Pending' | 'Review'

export type HomeCommandFilters = {
  source: HomeSourceFilter
  method: HomeMethodFilter
  status: HomeStatusFilter
  batchQuery: string
}

export const defaultHomeCommandFilters: HomeCommandFilters = {
  source: 'All',
  method: 'All',
  status: 'All',
  batchQuery: '',
}

export function homeCommandFilterMultiplier(filters: HomeCommandFilters): number {
  let m = 1
  if (filters.source === 'Loan System') m *= 0.96
  if (filters.source === 'Payment Partner') m *= 0.93
  if (filters.method === 'NACH') m *= 0.88
  if (filters.method === 'LSM') m *= 0.95
  if (filters.method === 'Bank Transfer') m *= 1.02
  if (filters.status === 'Confirmed') m *= 0.9
  if (filters.status === 'Pending') m *= 0.97
  if (filters.status === 'Review') m *= 0.84
  const q = filters.batchQuery.trim().toLowerCase()
  if (q.length > 0) {
    const narrow = 0.45 + Math.min(q.length, 12) * 0.038
    m *= clamp(narrow, 0.45, 0.9)
  }
  return clamp(m, 0.32, 1.12)
}

export type HomeSimulation = {
  prompt: string
  keywords: readonly string[]
  title: string
  summary: string
  tooltipNote: string
  metricBase: number
  tooltipValueBase: number
  tooltipDeltaBase: number
  range: readonly [number, number]
  salesBase: number
  expensesBase: number
  budgetBase: number
  insightText: string
  insightValueBase: number
}

export type WorkspaceSimulation = {
  prompt: string
  keywords: readonly string[]
  question: string
  supporting: string
  assistant: string
  heroLabel: string
  heroValue: string
  heroBars: readonly number[]
  listTitle: string
  listRows: readonly [string, string][]
  listFooter: string
  listAction: string
  statTitle: string
  statValue: string
  statNote: string
  compareLabels: readonly [string, string]
  bottomTitle: string
  bottomValue: string
  bottomMeta: string
  moduleBodies: readonly string[]
}

export type HomeOverviewSnapshot = {
  metricValue: string
  title: string
  summary: string
  tooltipValue: string
  tooltipDelta: string
  tooltipNote: string
  range: readonly [number, number]
  chartData: Array<{
    point: number
    barValue: number
    lineValue: number
    lowerLineValue: number
    selected: boolean
    isHoliday: boolean
  }>
  salesValue: string
  expensesValue: string
  budgetValue: string
  insightText: string
  insightValue: string
  insightGaugeProgress: number
  forecastBars: number[]
  budgetBars: number[]
  axisLabels: readonly string[]
  quarterName: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  quarterMonths: readonly string[]
  selectedYear: 2026 | 2027 | 2028
  holidayLabels: readonly string[]
  salesBaseValue: number
  expensesBaseValue: number
  budgetBaseValue: number
  insightBaseValue: number
  timeframeLabel: string
}

export type HomeCommandResponse = {
  title: string
  body: string
}

export type HomeCommandStatus = 'idle' | 'loading' | 'typing' | 'complete'

/** Inter-first stack — matches `globals.css` body; clean fintech / Ledger-style rhythm */
export const DASHBOARD_FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export const dockItems = [
  {
    id: 'sandbox',
    label: 'Sandbox',
    /** Short name in the top nav for customers (icon + label). */
    navLabel: 'Sandbox',
    title: 'Sandbox',
    breadcrumbLabel: 'Sandbox',
    summary: 'Test the full Intent Journal flow without touching real funds. Uses the same APIs as live with your sandbox workspace.',
    icon: 'terminal',
  },
  {
    id: 'home',
    label: 'Today',
    navLabel: 'Today',
    title: 'Payment Command Center',
    breadcrumbLabel: 'Payment Command Center',
    summary:
      'Track payment instructions, bank confirmations, settlement gaps, and proof readiness in one place.',
    icon: 'home',
  },
  {
    id: 'workspace',
    label: 'Ask',
    navLabel: 'Ask Zord',
    title: 'Payment Operations View',
    breadcrumbLabel: 'Payment Operations',
    summary:
      'Track payment instructions, bank confirmations, settlement gaps, proof readiness, and review actions in one place.',
    icon: 'folder',
  },
  {
    id: 'leakage',
    label: 'Payment Gaps',
    navLabel: 'Payment Gaps',
    title: 'Payment Gaps & Value at Risk',
    breadcrumbLabel: 'Payment Gaps',
    summary:
      'Compare intended payments with bank or settlement outcomes. Identify unmatched, short-settled, reversed, or unlinked value that needs review.',
    icon: 'zap',
  },
  {
    id: 'ambiguity',
    label: 'Match Review',
    navLabel: 'Match Review',
    title: 'Match Review',
    breadcrumbLabel: 'Match Review',
    summary:
      'See where Zord cannot confidently connect payment instructions to bank, PSP, or settlement outcomes.',
    icon: 'chart',
  },
  {
    id: 'verification',
    label: 'Verification',
    navLabel: 'Verification',
    title: 'Borrower Verification',
    breadcrumbLabel: 'Borrower Verification',
    summary:
      'Track borrower KYC, bank checks, fraud risk, and proof readiness before disbursal.',
    icon: 'users',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    navLabel: 'Monitoring',
    title: 'Post-Disbursal Monitoring',
    breadcrumbLabel: 'Post-Disbursal Monitoring',
    summary:
      'Monitor confirmation, repayment health, suspicious behavior, and evidence readiness after disbursal.',
    icon: 'chart',
  },
  {
    id: 'grid',
    label: 'Intent Journal',
    navLabel: 'Intent Journal',
    title: 'Intent Journal',
    breadcrumbLabel: 'Intent Journal',
    summary:
      'Payment instructions your business submitted — track readiness, review items, and bank confirmation status per batch.',
    icon: 'grid',
  },
  {
    id: 'settlement',
    label: 'Settlement Journal',
    navLabel: 'Settlement',
    title: 'Settlement Journal',
    breadcrumbLabel: 'Settlement Journal',
    summary:
      'What banks and payment partners reported — settlement records, match status, and observed amounts per batch.',
    icon: 'bank',
  },
  {
    id: 'connectors',
    label: 'Connectors',
    navLabel: 'Connectors',
    title: 'Connector Performance & Leakage',
    breadcrumbLabel: 'Connectors',
    summary:
      'Performance, leakage exposure, and recommended actions across your connected PSPs, banks, and rails.',
    icon: 'shield',
  },
  {
    id: 'proof',
    label: 'Evidence',
    navLabel: 'Evidence',
    title: 'Evidence & Dispute Resolution',
    breadcrumbLabel: 'Evidence',
    summary:
      'Build, verify, and export proof for payments, settlements, disputes, and audit review — one structured Evidence Pack instead of screenshots and PSP log chases.',
    icon: 'document',
  },
  {
    id: 'billing',
    label: 'Billing',
    navLabel: 'Billing',
    title: 'Billing',
    breadcrumbLabel: 'Billing',
    summary: 'Plan, payment method, and invoice history. Sandbox uses test billing — no real charges.',
    icon: 'billing',
  },
  {
    id: 'support',
    label: 'Support',
    navLabel: 'Support',
    title: 'Support requests',
    breadcrumbLabel: 'Support',
    summary:
      'Raise and track production support tickets with Zord. Attach batch context from Intent or Settlement Journal when reporting issues.',
    icon: 'support',
  },
] as const

/** Base URLs for payout console + settings (use for links and docs). */
export const PAYOUT_VIEW_URLS = {
  sandboxConsole: '/sandbox',
  liveConsole: '/payout-command-view/today',
  /** Live-only shell; use `sandboxBatchCommandCenter` when `mode === 'sandbox'`. */
  batchCommandCenter: PAYOUT_BATCH_COMMAND_CENTER_LIVE_PATH,
  /** Same Batch Command Center UI under `/sandbox` so links from sandbox never jump to live. */
  sandboxBatchCommandCenter: PAYOUT_BATCH_COMMAND_CENTER_SANDBOX_PATH,
  settingsAccount: '/payout-command-view/settings/account',
  settingsApiKeys: '/payout-command-view/settings/api-keys',
  connectorIntelligence: '/payout-command-view/connector-intelligence',
  support: '/payout-command-view/today?dock=support',
} as const

/** One row per dock icon: tooltip label + full page name (matches `dockItems`). */
export type PayoutConsoleDockPage = {
  dockId: DockId
  /** Icon tooltip in the dock */
  dockLabel: string
  /** Full surface / page name */
  pageName: string
}

function dockPageRow(id: DockId): PayoutConsoleDockPage {
  const d = dockItems.find((x) => x.id === id)!
  return { dockId: id, dockLabel: d.navLabel, pageName: d.title }
}

/** Sandbox mode — dock order matches `SANDBOX_DOCK_IDS`. */
export const SANDBOX_CONSOLE_DOCK_PAGES: readonly PayoutConsoleDockPage[] = SANDBOX_DOCK_IDS.map(dockPageRow)

/**
 * Live (active) account — dock shows every surface except Sandbox and Billing.
 * Order follows `dockItems`.
 */
export const LIVE_CONSOLE_DOCK_PAGES: readonly PayoutConsoleDockPage[] = dockItems
  .filter(
    (d) =>
      d.id !== 'sandbox' &&
      d.id !== 'billing' &&
      !(CONNECTORS_DOCK_TEMPORARILY_HIDDEN && d.id === 'connectors'),
  )
  .map((d) => ({ dockId: d.id, dockLabel: d.navLabel, pageName: d.title }))

/** Routes outside the main console shell (header links, deep links). */
export const PAYOUT_STANDALONE_PAGE_NAMES = [
  { path: PAYOUT_VIEW_URLS.batchCommandCenter, name: 'Batch Command Center' },
  { path: PAYOUT_VIEW_URLS.sandboxBatchCommandCenter, name: 'Sandbox · Batch Command Center' },
  { path: PAYOUT_VIEW_URLS.settingsAccount, name: 'Settings — Account' },
  { path: PAYOUT_VIEW_URLS.settingsApiKeys, name: 'Settings — API keys' },
  // { path: PAYOUT_VIEW_URLS.connectorIntelligence, name: 'Connector Intelligence' },
] as const

/** Selectable workspace context tabs (Routing is shown disabled separately). */
export const workspaceTabs: WorkspaceTab[] = ['Today', 'Value at Risk', 'Proof', 'Sources', 'Actions']

export const workspaceRoutingTab: WorkspaceTab = 'Routing'

/** @deprecated Import from paymentOperationsCopy — kept for backward-compatible imports. */
export const workspacePromptCopy = {
  Today: {
    question: 'What should Zord check in this payment data?',
    supporting:
      'Grounded on payment instructions, settlement outcomes, match confidence, and proof readiness for your signed-in workspace.',
    suggestions: [
      'Which payments need review?',
      'Why is proof incomplete for this period?',
      'Which records are missing bank references?',
      'What value is unmatched or short-settled?',
      'What should the accounts team upload next?',
    ],
  },
  'Value at Risk': {
    question: 'What payment value is unmatched, short-settled, or at risk?',
    supporting: 'Grounded on leakage KPIs: intended vs observed settlement and review exposure.',
    suggestions: [
      'What value is unmatched or short-settled?',
      'Show intended vs settled value for this period',
      'Is any settlement data missing matching intents?',
      'What should finance review first?',
    ],
  },
  Proof: {
    question: 'What evidence packs are ready for finance or audit?',
    supporting: 'Grounded on defensibility, evidence pack rate, and governance coverage.',
    suggestions: [
      'Which evidence packs can finance close now?',
      'What evidence is still missing today?',
      'What is blocking proof export?',
    ],
  },
  Sources: {
    question: 'Which data sources has Zord received for this workspace?',
    supporting: 'Grounded on ingest status for intent files, settlement files, bank statements, and evidence.',
    suggestions: [
      'What should the accounts team upload next?',
      'Which source files are missing?',
      'Is bank confirmation data connected?',
      'When was intent data last received?',
    ],
  },
  Actions: {
    question: 'What review actions or recommendations are open?',
    supporting: 'Grounded on recommendations KPIs and items needing operator review.',
    suggestions: [
      'Which payments need review?',
      'How many actions are still unresolved?',
      'What should ops do next?',
      'Summarize open review items',
    ],
  },
  Routing: {
    question: 'What should Zord check in this payment data?',
    supporting:
      'Zord is analyzing payment proof and settlement clarity. PSP/bank routing intelligence becomes available once bank/PSP dispatch is connected.',
    suggestions: [] as readonly string[],
  },
} as const

export const workspaceTiles = [
  {
    icon: 'chart' as GlyphName,
    title: 'Payment Review',
    body: 'Review unmatched, ambiguous, or low-confidence payments.',
  },
  {
    icon: 'grid' as GlyphName,
    title: 'Source Files',
    body: 'Check uploaded intent files, settlement files, bank statements, and processing status.',
  },
  {
    icon: 'document' as GlyphName,
    title: 'Proof Reports',
    body: 'Export evidence-ready payment reports for finance, audit, or customer review.',
  },
  {
    icon: 'zap' as GlyphName,
    title: 'Actions',
    body: 'Track recommended fixes, accepted actions, and resolved issues.',
  },
] as const

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function formatUsdWhole(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatUsdCompactK(value: number) {
  return `$${(value / 1000).toFixed(1).replace('.', ',')}k`
}

/** Compact billions / millions for command center cards. */
export function formatUsdShort(value: number) {
  const v = Math.abs(value)
  if (v >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return formatUsdWhole(value)
}

export function formatPercentBadge(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

export function resolveHomeTimeframeFromPrompt(prompt: string, currentTimeframe: HomeTimeframe) {
  const lowerPrompt = prompt.toLowerCase()
  if (lowerPrompt.includes('today') || lowerPrompt.includes('now')) return 'Today'
  if (lowerPrompt.includes('week')) return 'Week'
  if (lowerPrompt.includes('month')) return 'Month'
  if (lowerPrompt.includes('quarter') || lowerPrompt.includes('qtd') || lowerPrompt.includes('custom')) return 'Custom'
  if (lowerPrompt.includes('year') || lowerPrompt.includes('ytd')) return 'Custom'
  return currentTimeframe
}

export function resolveHomeYearFromPrompt(prompt: string, currentYear: 2026 | 2027 | 2028) {
  const matched = prompt.match(/20(26|27|28)/)
  if (!matched) return currentYear
  const parsed = Number(matched[0]) as 2026 | 2027 | 2028
  return HOME_YEAR_OPTIONS.includes(parsed) ? parsed : currentYear
}

export function resolveHomeQuarterFromPrompt(prompt: string, currentQuarterIndex: number) {
  const lowerPrompt = prompt.toLowerCase()
  if (lowerPrompt.includes('q1') || lowerPrompt.includes('first quarter')) return 0
  if (lowerPrompt.includes('q2') || lowerPrompt.includes('second quarter')) return 1
  if (lowerPrompt.includes('q3') || lowerPrompt.includes('third quarter')) return 2
  if (lowerPrompt.includes('q4') || lowerPrompt.includes('fourth quarter')) return 3
  return currentQuarterIndex
}

function buildHomeTimeframeLayout(timeframe: HomeTimeframe, quarterIndex: number, selectedYear: 2026 | 2027 | 2028) {
  if (timeframe === 'Today') {
    return {
      totalBars: 48,
      labels: ['6a', '9a', '12p', '3p', '6p', '9p', '12a', '3a'],
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Today • operating day • ${selectedYear}`,
      rangeLength: 24,
    }
  }

  if (timeframe === 'Week') {
    return {
      totalBars: 84,
      labels: [...HOME_WEEKDAY_LABELS],
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Week view • Mon-Sun • ${selectedYear}`,
      rangeLength: 42,
    }
  }

  if (timeframe === 'Custom') {
    const quarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
    return {
      totalBars: 90,
      labels: quarter.months.map((month) => month.slice(0, 3)),
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Custom range • ${quarter.name} • ${selectedYear}`,
      rangeLength: 54,
    }
  }

  return {
    totalBars: 112,
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    holidayLabels: [] as readonly string[],
    timeframeLabel: `Month view • ${selectedYear}`,
    rangeLength: 30,
  }
}

function resolveHomeRange(
  baseRange: readonly [number, number],
  tick: number,
  totalBars: number,
  targetLength: number,
) {
  const [baseStart, baseEnd] = baseRange
  const baseMidpoint = (baseStart + baseEnd) / 2
  const midpointScale = totalBars / 112
  const midpoint = Math.round(baseMidpoint * midpointScale + Math.sin(tick * 0.42) * 1.8)
  const safeLength = clamp(targetLength, 10, totalBars - 6)
  const start = clamp(Math.round(midpoint - safeLength / 2), 0, totalBars - safeLength - 1)
  return [start, start + safeLength] as const
}

export function buildSimulatedHomeOverviewSnapshot(
  scenario: HomeSimulation,
  timeframe: HomeTimeframe,
  tick: number,
  selectedYear: 2026 | 2027 | 2028,
  quarterIndex: number,
  filterMultiplier = 1,
): HomeOverviewSnapshot {
  const timeframeScale =
    timeframe === 'Today' ? 0.2 : timeframe === 'Week' ? 0.42 : timeframe === 'Month' ? 1 : 1.42
  const volatilityScale =
    timeframe === 'Today' ? 1.45 : timeframe === 'Week' ? 1.38 : timeframe === 'Month' ? 1 : 0.88
  const rangeLift =
    timeframe === 'Today' ? 0.88 : timeframe === 'Week' ? 0.92 : timeframe === 'Month' ? 1 : 1.08
  const yearScale = selectedYear === 2026 ? 1 : selectedYear === 2027 ? 1.07 : 1.14
  const timeframeConfig = buildHomeTimeframeLayout(timeframe, quarterIndex, selectedYear)
  const phase = tick * 0.26
  const range = resolveHomeRange(scenario.range, tick, timeframeConfig.totalBars, timeframeConfig.rangeLength)
  const [selectedRangeStart, selectedRangeEnd] = range

  const chartData = Array.from({ length: timeframeConfig.totalBars }, (_, index) => {
    const selected = index >= selectedRangeStart && index <= selectedRangeEnd
    const primaryPeak = Math.exp(-Math.pow(index - 34, 2) / (2 * 10.5 * 10.5)) * 34000
    const secondaryPeak = Math.exp(-Math.pow(index - 80, 2) / (2 * 7.4 * 7.4)) * 11000
    const lateLift = index > 94 ? (index - 94) * 1200 : 0
    const livePulse = Math.sin(index * 0.24 + phase) * 1600 + Math.cos(index * 0.11 - phase * 0.6) * 900
    const barBase =
      46000 +
      Math.sin(index * 0.24 - 0.2 + phase * 0.18) * 6800 * volatilityScale +
      Math.cos(index * 0.07 + 0.2 - phase * 0.12) * 4200 * volatilityScale +
      Math.sin(index * 0.57 + phase * 0.34) * 2100 * volatilityScale +
      livePulse
    const lineBase =
      47000 +
      Math.sin(index * 0.19 - 0.5 + phase * 0.12) * 2200 * volatilityScale +
      Math.cos(index * 0.44 + 0.15 - phase * 0.08) * 1500 * volatilityScale +
      Math.sin(index * 0.73 + phase * 0.17) * 780 * volatilityScale
    const lowerLineBase =
      26000 +
      Math.sin(index * 0.17 + 0.8 + phase * 0.09) * 1800 * volatilityScale +
      Math.cos(index * 0.31 - 0.4 - phase * 0.07) * 1100 * volatilityScale +
      Math.sin(index * 0.58 + phase * 0.16) * 560 * volatilityScale
    const dayIndex = timeframe === 'Week' ? Math.floor(index / 12) : timeframe === 'Today' ? Math.floor(index / 8) : -1
    const isHoliday =
      (timeframe === 'Week' && (dayIndex === 3 || dayIndex === 6)) || (timeframe === 'Today' && dayIndex === 5)

    return {
      point: index,
      barValue: Math.max(18000, Math.min(122000, barBase + primaryPeak * rangeLift + secondaryPeak * rangeLift + lateLift * rangeLift + (isHoliday ? -1800 : 0))),
      lineValue: Math.max(34000, Math.min(71000, lineBase + primaryPeak * 0.12 * rangeLift + secondaryPeak * 0.1 * rangeLift + lateLift * 0.12)),
      lowerLineValue: Math.max(12000, Math.min(46000, lowerLineBase + primaryPeak * 0.06 * rangeLift + secondaryPeak * 0.05 * rangeLift)),
      selected,
      isHoliday,
    }
  })

  const phaseLift = Math.sin(phase * 0.72) + Math.cos(phase * 0.31)
  const activeQuarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
  const metricBaseScaled = scenario.metricBase * yearScale
  const salesBaseScaled = scenario.salesBase * yearScale
  const expensesBaseScaled = scenario.expensesBase * (0.96 + (yearScale - 1) * 0.5)
  const budgetBaseScaled = scenario.budgetBase * yearScale
  const insightBaseScaled = scenario.insightValueBase * yearScale

  const scaledChartData = chartData.map((row) => ({
    ...row,
    barValue: Math.round(row.barValue * filterMultiplier),
    lineValue: Math.round(row.lineValue * filterMultiplier),
    lowerLineValue: Math.round(row.lowerLineValue * filterMultiplier),
  }))

  const forecastBars = scaledChartData.slice(selectedRangeStart, selectedRangeStart + 6).map((entry) => entry.barValue / HOME_CHART_DOMAIN_MAX)
  const budgetBars = scaledChartData.slice(selectedRangeStart + 6, selectedRangeStart + 14).map((entry) => entry.lineValue / HOME_CHART_DOMAIN_MAX)

  return {
    metricValue: formatUsdWhole((metricBaseScaled + phaseLift * 2_400_000 * timeframeScale) * filterMultiplier),
    title: scenario.title,
    summary: scenario.summary,
    tooltipValue: formatUsdCompactK(
      (scenario.tooltipValueBase * yearScale + phaseLift * 4200 * timeframeScale) * filterMultiplier,
    ),
    tooltipDelta: formatPercentBadge(scenario.tooltipDeltaBase + Math.sin(phase * 0.62) * 2.4),
    tooltipNote: scenario.tooltipNote,
    range,
    chartData: scaledChartData,
    salesValue: formatUsdCompactK((salesBaseScaled + phaseLift * 1700 * timeframeScale) * filterMultiplier),
    expensesValue: formatUsdCompactK((expensesBaseScaled + Math.cos(phase * 0.48) * 780 * timeframeScale) * filterMultiplier),
    budgetValue: formatUsdCompactK((budgetBaseScaled + Math.sin(phase * 0.4) * 1200 * timeframeScale) * filterMultiplier),
    insightText: scenario.insightText,
    insightValue: formatUsdCompactK((insightBaseScaled + Math.sin(phase * 0.58) * 1600 * timeframeScale) * filterMultiplier),
    insightGaugeProgress: clamp(0.54 + Math.sin(phase * 0.46) * 0.12 + timeframeScale * 0.03, 0.4, 0.92),
    forecastBars,
    budgetBars,
    axisLabels: timeframeConfig.labels,
    quarterName: activeQuarter.name,
    quarterMonths: activeQuarter.months,
    selectedYear,
    holidayLabels: timeframeConfig.holidayLabels,
    salesBaseValue: salesBaseScaled * filterMultiplier,
    expensesBaseValue: expensesBaseScaled * filterMultiplier,
    budgetBaseValue: budgetBaseScaled * filterMultiplier,
    insightBaseValue: insightBaseScaled * filterMultiplier,
    timeframeLabel: timeframeConfig.timeframeLabel,
  }
}

/**
 * Period chrome for Home without animated mock chart series. Hero + trend chart use API hooks (`useDisbursementTrend`, `useIntelligenceKpis`).
 */
export function buildStaticHomeOverviewSnapshot(
  scenario: HomeSimulation,
  timeframe: HomeTimeframe,
  selectedYear: 2026 | 2027 | 2028,
  quarterIndex: number,
  _filterMultiplier = 1,
): HomeOverviewSnapshot {
  const timeframeConfig = buildHomeTimeframeLayout(timeframe, quarterIndex, selectedYear)
  const activeQuarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
  const range = [0, 0] as const
  const emptyChart: HomeOverviewSnapshot['chartData'] = []

  return {
    metricValue: '—',
    title: scenario.title,
    summary: scenario.summary,
    tooltipValue: '—',
    tooltipDelta: '—',
    tooltipNote: scenario.tooltipNote,
    range,
    chartData: emptyChart,
    salesValue: '—',
    expensesValue: '—',
    budgetValue: '—',
    insightText: scenario.insightText,
    insightValue: '—',
    insightGaugeProgress: 0,
    forecastBars: [],
    budgetBars: [],
    axisLabels: timeframeConfig.labels,
    quarterName: activeQuarter.name,
    quarterMonths: activeQuarter.months,
    selectedYear,
    holidayLabels: timeframeConfig.holidayLabels,
    salesBaseValue: 0,
    expensesBaseValue: 0,
    budgetBaseValue: 0,
    insightBaseValue: 0,
    timeframeLabel: timeframeConfig.timeframeLabel,
  }
}

export const homeTimeframes: readonly HomeTimeframe[] = ['Today', 'Week', 'Month', 'Custom']
export const HOME_SIMULATION_INTERVAL_MS = 2600
export const HOME_CHART_DOMAIN_MAX = 150000
export const HOME_YEAR_OPTIONS = [2026, 2027, 2028] as const
export const HOME_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const HOME_QUARTERS = [
  { name: 'Q1' as const, months: ['January', 'February', 'March'] },
  { name: 'Q2' as const, months: ['April', 'May', 'June'] },
  { name: 'Q3' as const, months: ['July', 'August', 'September'] },
  { name: 'Q4' as const, months: ['October', 'November', 'December'] },
] as const

export const homeSimulationScenarios: readonly HomeSimulation[] = [
  {
    prompt: 'Where are delays occurring?',
    keywords: ['delay', 'delays', 'disbursement', 'confirmation', 'where', 'cycle'],
    title: 'Total Disbursement Value',
    summary: 'Across all batches and payment methods.',
    tooltipNote: 'Value of disbursements successfully completed during this period.',
    metricBase: 1651045139,
    tooltipValueBase: 115000,
    tooltipDeltaBase: 32,
    range: [20, 50],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Disbursement completion has improved with fewer delays. Next step: review one bank where confirmation delays are still higher than expected.',
    insightValueBase: 57900,
  },
  {
    prompt: 'What is the total value awaiting confirmation?',
    keywords: ['total', 'value', 'awaiting', 'confirmation', 'disbursement', 'pending'],
    title: 'Confirmed Disbursement Value',
    summary: 'Additional disbursement value confirmed after resolving pending or delayed transactions.',
    tooltipNote: 'Value of disbursements successfully completed during this period.',
    metricBase: 1598204711,
    tooltipValueBase: 92000,
    tooltipDeltaBase: 18,
    range: [24, 54],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Verification readiness improved with faster confirmation alignment. Next step: prioritize unresolved disbursements with highest value pending confirmation.',
    insightValueBase: 57900,
  },
  {
    prompt: 'Which disbursements are still pending?',
    keywords: ['which', 'disbursements', 'pending', 'status', 'bank', 'confirmation'],
    title: 'Confirmed Disbursement Value',
    summary: 'Additional disbursement value confirmed after resolving pending or delayed transactions.',
    tooltipNote: 'Value of disbursements successfully completed during this period.',
    metricBase: 1622408553,
    tooltipValueBase: 104000,
    tooltipDeltaBase: 21,
    range: [18, 46],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Bank-side lag narrowed in high-volume corridors, but one branch cluster still needs verification to maintain confirmation timelines.',
    insightValueBase: 57900,
  },
  {
    prompt: 'Which transactions need manual review?',
    keywords: ['transactions', 'manual', 'review', 'verification', 'pending', 'unresolved'],
    title: 'Disbursements Requiring Attention',
    summary: 'Breakdown of disbursements that need verification or follow-up before confirmation.',
    tooltipNote: 'Value of disbursements successfully completed during this period.',
    metricBase: 1619847420,
    tooltipValueBase: 98700,
    tooltipDeltaBase: 16,
    range: [22, 48],
    salesBase: 142900,
    expensesBase: 16400,
    budgetBase: 92500,
    insightText:
      'Disbursement completion has improved with fewer delays. Next step: review one bank where confirmation delays are still higher than expected.',
    insightValueBase: 57900,
  },
] as const

export const workspaceSimulationScenarios: Record<WorkspaceTab, readonly WorkspaceSimulation[]> = {
  Today: [
    {
      prompt: 'Show where routed value is concentrating right now',
      keywords: ['routed', 'value', 'concentrating', 'where', 'today'],
      question: 'What should the intelligence layer analyze inside the payout command view?',
      supporting: 'Grounded on routed value, callback timing, bank-side movement, and export readiness already visible in the workspace.',
      assistant: 'Recovered routed value is concentrating in the Razorpay and Stripe overflow lanes after traffic shifted away from degraded PSP routes. Bank-side delay is low there, so ops can keep the current distribution while finance uses those intents for proof-first close.',
      heroLabel: 'Command scope clean payouts',
      heroValue: '1,231',
      heroBars: [3, 3, 11, 18, 9, 6, 2, 4, 3, 3, 3],
      listTitle: 'Provider posture',
      listRows: [['Razorpay', '99.1%'], ['Cashfree', '98.4%'], ['PayU', '91.6%']],
      listFooter: '+19 more routes',
      listAction: 'View all providers',
      statTitle: 'Recovery intelligence',
      statValue: '+65.5%',
      statNote: 'Routed value recovered this cycle',
      compareLabels: ['Previous cycle', 'Current cycle'],
      bottomTitle: 'Escalations ready',
      bottomValue: '459',
      bottomMeta: 'Provider and bank-side issues packaged for operator review.',
      moduleBodies: [
        'Read routed value, live exceptions, and finance evidence from one operating surface.',
        'Clarify whether the next move belongs to ops, finance, engineering, or bank-side follow-up.',
        'Surface callback lag and bank-side drift before they begin blocking clean confirmation.',
        'Keep route posture visible while traffic shifts around degraded providers and overflow lanes.',
      ],
    },
    {
      prompt: 'Clarify which issue belongs to bank-side operations',
      keywords: ['bank-side', 'bank', 'operations', 'ownership', 'issue'],
      question: 'Which payout issues should move into bank-side operations first?',
      supporting: 'Grounded on callback lag, finality status, and bank-side drift already visible in the workspace.',
      assistant: 'Bank-side operations should take the intents still waiting on statement-side confirmation and callback recovery, especially where provider posture is already healthy. Ops can leave route configuration unchanged and move the next action to bank follow-up.',
      heroLabel: 'Bank-side ownership queue',
      heroValue: '84',
      heroBars: [2, 4, 7, 10, 12, 9, 8, 6, 5, 4, 3],
      listTitle: 'Bank clusters',
      listRows: [['ICICI', '27'], ['HDFC', '18'], ['Axis', '12']],
      listFooter: '+6 more hotspots',
      listAction: 'View bank queues',
      statTitle: 'Confirmation drift',
      statValue: '+12.4%',
      statNote: 'Bank-side review pressure',
      compareLabels: ['Callback', 'Statement'],
      bottomTitle: 'Escalations ready',
      bottomValue: '31',
      bottomMeta: 'Intents packaged for bank-side confirmation review.',
      moduleBodies: [
        'Read bank-side lag, pending callbacks, and operator notes from one ownership lane.',
        'Clarify whether the next move belongs to ops or statement-side follow-up.',
        'Surface the banks where callback lag is already slowing clean confirmation.',
        'Keep provider posture visible while bank-side work clears the remaining finality gap.',
      ],
    },
    {
      prompt: 'What is delaying proof export today?',
      keywords: ['proof', 'export', 'delaying', 'delay', 'today'],
      question: 'What is delaying proof export today?',
      supporting: 'Grounded on export queues, callback completion, and finance bundle readiness already visible in the workspace.',
      assistant: 'Proof export is still gated by missing callback attachments and late bank references on a narrow set of intents. The queue is small enough to clear today, but finance should prioritize packets where provider logs and callback proofs are already paired.',
      heroLabel: 'Evidence Packs ready',
      heroValue: '142',
      heroBars: [2, 3, 8, 13, 10, 7, 4, 6, 3, 2, 2],
      listTitle: 'Evidence sources',
      listRows: [['Statements', '41'], ['Callbacks', '62'], ['Exports', '39']],
      listFooter: '+8 pending bundles',
      listAction: 'Review proof queue',
      statTitle: 'Close confidence',
      statValue: '84.2%',
      statNote: 'Finance-ready proof confidence',
      compareLabels: ['Audit', 'Close'],
      bottomTitle: 'Export queue',
      bottomValue: '27',
      bottomMeta: 'Evidence Packs waiting on final callback or statement cues.',
      moduleBodies: [
        'Read export coverage, callback completion, and finance evidence from one proof lane.',
        'Clarify whether the next move belongs to finance, ops, or engineering trace review.',
        'Surface bank-side gaps before they begin blocking proof close.',
        'Keep provider posture visible while teams clear the delayed export queue.',
      ],
    },
  ],
  Routing: [
    {
      prompt: 'Which route should take overflow next?',
      keywords: ['route', 'overflow', 'next', 'routing'],
      question: 'Which provider lane needs the next routing decision?',
      supporting: 'Grounded on provider posture, overflow pressure, and confirmation drift already visible in the workspace.',
      assistant: 'Overflow should move into Razorpay and Stripe first because both lanes are clearing with lower callback lag than the degraded partners. Keep Cashfree live for resilience, but do not route the next burst there until confirmation volatility settles.',
      heroLabel: 'Overflow recovery lanes',
      heroValue: '62',
      heroBars: [2, 5, 9, 14, 13, 10, 8, 6, 4, 3, 2],
      listTitle: 'Route candidates',
      listRows: [['Razorpay', 'Primary'], ['Stripe', 'Overflow'], ['Cashfree', 'Fallback']],
      listFooter: '+4 more lanes',
      listAction: 'Open routing map',
      statTitle: 'Recovery rate',
      statValue: '+24.7%',
      statNote: 'Recovered after reroute',
      compareLabels: ['Primary', 'Overflow'],
      bottomTitle: 'Action queue',
      bottomValue: '18',
      bottomMeta: 'Routing decisions ready for the next operator pass.',
      moduleBodies: [
        'Read route health, overflow allocation, and fallback depth from one routing surface.',
        'Clarify whether the next move is a reroute, throttle, or bank-side watch.',
        'Surface the banks still constraining the highest-performing routes.',
        'Keep degraded providers visible while traffic shifts around overflow lanes.',
      ],
    },
  ],
  Proof: [
    {
      prompt: 'Which Evidence Pack can finance close now?',
      keywords: ['proof', 'finance', 'close', 'pack'],
      question: 'Which payout packets are closest to close-ready proof right now?',
      supporting: 'Grounded on callbacks, statement cues, export queue state, and finance readiness already visible in the workspace.',
      assistant: 'Finance can close the packets where callback proofs and statement references are already paired. The remaining risk sits in a smaller band of intents still waiting on statement-side confirmation or export assembly.',
      heroLabel: 'Evidence Packs ready',
      heroValue: '142',
      heroBars: [2, 3, 8, 13, 10, 7, 4, 6, 3, 2, 2],
      listTitle: 'Proof sources',
      listRows: [['Callbacks', '62'], ['Statements', '41'], ['Provider logs', '39']],
      listFooter: '+11 missing packets',
      listAction: 'Open proof desk',
      statTitle: 'Close confidence',
      statValue: '84.2%',
      statNote: 'Finance-ready proof confidence',
      compareLabels: ['Queued', 'Ready'],
      bottomTitle: 'Export queue',
      bottomValue: '27',
      bottomMeta: 'Packets still waiting on final assembly before close.',
      moduleBodies: [
        'Read proof coverage, source parity, and export readiness from one finance surface.',
        'Clarify whether the next move belongs to finance close or evidence assembly.',
        'Surface bank-side gaps before they begin blocking packet completion.',
        'Keep route posture visible while the export queue is being cleared.',
      ],
    },
  ],
  'Value at Risk': [
    {
      prompt: 'What value is unmatched or short-settled?',
      keywords: ['unmatched', 'short-settled', 'value', 'clarity'],
      question: 'What payment value is unmatched, short-settled, or at risk?',
      supporting: 'Grounded on leakage KPIs for this workspace period.',
      assistant:
        'Zord compared intended payment value with observed settlement. Unmatched and short-settled amounts are listed in Value at Risk; upload missing intent or bank data if totals look incomplete.',
      heroLabel: 'Value needing review',
      heroValue: '—',
      heroBars: [3, 5, 7, 9, 8, 6, 4, 3, 2, 2, 2],
      listTitle: 'Value at risk',
      listRows: [['Intended', '—'], ['Settled', '—'], ['Unmatched', '—']],
      listFooter: 'Upload missing files to refresh',
      listAction: 'View payment gaps',
      statTitle: 'Value needing review',
      statValue: '—',
      statNote: 'From leakage and ambiguity signals',
      compareLabels: ['Intended', 'Observed'],
      bottomTitle: 'Items needing review',
      bottomValue: '—',
      bottomMeta: 'Payments requiring finance/ops review.',
      moduleBodies: [
        'Review unmatched, ambiguous, or low-confidence payments.',
        'Check uploaded intent and settlement files.',
        'Export evidence-ready proof reports.',
        'Track recommended fixes and resolved issues.',
      ],
    },
  ],
  Sources: [
    {
      prompt: 'What should the accounts team upload next?',
      keywords: ['upload', 'missing', 'source', 'file'],
      question: 'Which data sources has Zord received for this workspace?',
      supporting: 'Grounded on ingest status for intent, settlement, bank statement, and evidence.',
      assistant:
        'Check Connected Sources for what Zord has received. Upload any source marked Missing before expecting full value at risk or proof readiness.',
      heroLabel: 'Connected sources',
      heroValue: '—',
      heroBars: [2, 3, 4, 5, 4, 3, 2, 2, 2, 2, 2],
      listTitle: 'Source health',
      listRows: [['Intent file', '—'], ['Settlement', '—'], ['Bank statement', '—']],
      listFooter: 'See source table for status',
      listAction: 'Open intent journal',
      statTitle: 'Proof readiness',
      statValue: '—',
      statNote: 'Depends on connected sources',
      compareLabels: ['Received', 'Missing'],
      bottomTitle: 'Missing sources',
      bottomValue: '—',
      bottomMeta: 'Sources blocking complete proof.',
      moduleBodies: [
        'Review unmatched, ambiguous, or low-confidence payments.',
        'Check uploaded intent and settlement files.',
        'Export evidence-ready proof reports.',
        'Track recommended fixes and resolved issues.',
      ],
    },
  ],
  Actions: [
    {
      prompt: 'Which payments need review?',
      keywords: ['review', 'actions', 'payments'],
      question: 'What review actions or recommendations are open?',
      supporting: 'Grounded on recommendations and ambiguity counts.',
      assistant:
        'Open items are summarized under Items Needing Review. Accept or resolve recommended actions from the payment gaps and matching surfaces.',
      heroLabel: 'Open actions',
      heroValue: '—',
      heroBars: [2, 4, 6, 8, 7, 5, 4, 3, 2, 2, 2],
      listTitle: 'Review drivers',
      listRows: [['Missing refs', '—'], ['Low confidence', '—'], ['Collisions', '—']],
      listFooter: 'See breakdown below',
      listAction: 'View actions',
      statTitle: 'Resolution rate',
      statValue: '—',
      statNote: 'Accepted vs resolved actions',
      compareLabels: ['Open', 'Resolved'],
      bottomTitle: 'Items needing review',
      bottomValue: '—',
      bottomMeta: 'Payments or records awaiting operator review.',
      moduleBodies: [
        'Review unmatched, ambiguous, or low-confidence payments.',
        'Check uploaded intent and settlement files.',
        'Export evidence-ready proof reports.',
        'Track recommended fixes and resolved issues.',
      ],
    },
  ],
}

export function resolvePromptScenario<T extends { keywords: readonly string[]; prompt: string }>(
  prompt: string,
  scenarios: readonly T[],
  fallback: T,
) {
  const lowerPrompt = prompt.toLowerCase()
  let bestMatch = fallback
  let bestScore = 0

  for (const scenario of scenarios) {
    const keywordScore = scenario.keywords.reduce((score, keyword) => score + (lowerPrompt.includes(keyword) ? 1 : 0), 0)
    const exactPromptBoost = lowerPrompt.includes(scenario.prompt.toLowerCase()) ? 2 : 0
    const score = keywordScore + exactPromptBoost
    if (score > bestScore) {
      bestMatch = scenario
      bestScore = score
    }
  }

  return bestMatch
}

export const recoveryTrendData = [
  { month: 'Jan', value: 41, baseline: 34 },
  { month: 'Feb', value: 46, baseline: 37 },
  { month: 'Mar', value: 52, baseline: 39 },
  { month: 'Apr', value: 58, baseline: 42 },
  { month: 'May', value: 63, baseline: 46 },
  { month: 'Jun', value: 72, baseline: 49 },
  { month: 'Jul', value: 69, baseline: 50 },
  { month: 'Aug', value: 76, baseline: 53 },
  { month: 'Sep', value: 81, baseline: 56 },
] as const

export const recoveryMix = [
  { name: 'Primary', value: 45 },
  { name: 'Overflow', value: 85 },
  { name: 'Fallback', value: 48 },
  { name: 'Manual', value: 22 },
] as const

export const recoveryWatchlist = [
  { name: 'Razorpay', value: '₹18.4L', delta: '-0.92%' },
  { name: 'Stripe', value: '₹11.2L', delta: '+1.87%' },
  { name: 'Cashfree', value: '₹9.8L', delta: '-0.45%' },
  { name: 'Fallbacks', value: '₹15.4L', delta: '+0.64%' },
] as const

export const intentRows = [
  { intent: 'PAYOUT_24118', owner: 'Ops', risk: 'High', proof: 'Pending', next: 'Bank follow-up' },
  { intent: 'PAYOUT_24109', owner: 'Finance', risk: 'Medium', proof: 'Ready', next: 'Close packet' },
  { intent: 'PAYOUT_24097', owner: 'Engineering', risk: 'High', proof: 'Missing', next: 'Webhook trace' },
  { intent: 'PAYOUT_24084', owner: 'Ops', risk: 'Low', proof: 'Ready', next: 'Reroute check' },
  { intent: 'PAYOUT_24071', owner: 'Bank Ops', risk: 'High', proof: 'Pending', next: 'Escalation' },
  { intent: 'PAYOUT_24063', owner: 'Finance', risk: 'Medium', proof: 'Ready', next: 'Export now' },
] as const

export type IntentJournalBatchRecord = {
  batchId: string
  type: 'Disbursement' | 'Settlement'
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  highConfidenceCount: number
  mismatchCount: number
  unresolvedCount: number
}

export type IntentJournalIntentRow = {
  batchId: string
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  status: 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
  match: 'Matched' | 'Likely Matched' | 'Awaiting' | 'Mismatch' | 'Not Found'
  lastUpdated: string
  paymentPartner: 'Razorpay' | 'Cashfree' | 'PayU'
  bank: 'HDFC Bank' | 'ICICI Bank' | 'SBI'
}

export type IntentJournalFailureRow = {
  batchId: string
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  paymentPartner: 'Razorpay' | 'Cashfree' | 'PayU'
  failureReason: string
  failureStage: 'Validation' | 'Dispatch' | 'Processing' | 'Settlement'
  lastUpdated: string
  action: 'Retry' | 'Fix Details' | 'Investigate' | 'Escalate' | 'Fix Mandate'
}

export function getIntentJournalBatches(): IntentJournalBatchRecord[] {
  const seed: IntentJournalBatchRecord[] = [
    { batchId: 'B-2026-021', type: 'Disbursement', source: 'Loan System', totalValue: 1_200_000, transactions: 1200, confirmedCount: 840, highConfidenceCount: 60, mismatchCount: 20, unresolvedCount: 20 },
    { batchId: 'ZB-2041', type: 'Disbursement', source: 'Loan System', totalValue: 2_400_000, transactions: 847, confirmedCount: 760, highConfidenceCount: 64, mismatchCount: 12, unresolvedCount: 11 },
    { batchId: 'B-2026-023', type: 'Settlement', source: 'Payment Hub', totalValue: 980_000, transactions: 870, confirmedCount: 580, highConfidenceCount: 90, mismatchCount: 110, unresolvedCount: 90 },
    { batchId: 'B-2026-024', type: 'Disbursement', source: 'Loan System', totalValue: 740_000, transactions: 640, confirmedCount: 320, highConfidenceCount: 40, mismatchCount: 120, unresolvedCount: 90 },
  ]
  const generated: IntentJournalBatchRecord[] = Array.from({ length: 22 }, (_, i) => ({
    batchId: `B-2026-${String(25 + i).padStart(3, '0')}`,
    type: i % 3 === 0 ? 'Settlement' : 'Disbursement',
    source: i % 2 === 0 ? 'Loan System' : 'Payment Hub',
    totalValue: 600_000 + ((i * 175_000) % 2_200_000),
    transactions: 500 + ((i * 241) % 5100),
    confirmedCount: 330 + ((i * 200) % 3200),
    highConfidenceCount: 45 + ((i * 31) % 300),
    mismatchCount: 40 + ((i * 19) % 240),
    unresolvedCount: 20 + ((i * 23) % 220),
  }))
  return [...seed, ...generated]
}

export function getIntentJournalIntents(): IntentJournalIntentRow[] {
  const b = 'ZB-2041'
  const b2 = 'B-2026-021'
  const rows: IntentJournalIntentRow[] = [
    { batchId: b, requestId: 'INT-1001', reference: 'salary_emp_101', amount: 1500, method: 'Bank Transfer', status: 'Confirmed', match: 'Matched', lastUpdated: '10:42 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1002', reference: 'salary_emp_102', amount: 1500, method: 'LSM', status: 'Pending', match: 'Awaiting', lastUpdated: '10:44 AM', paymentPartner: 'Razorpay', bank: 'ICICI Bank' },
    { batchId: b, requestId: 'INT-1003', reference: 'salary_emp_103', amount: 2200, method: 'Bank Transfer', status: 'Confirmed', match: 'Matched', lastUpdated: '10:45 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1004', reference: 'salary_emp_104', amount: 1800, method: 'Bank Transfer', status: 'Needs Review', match: 'Mismatch', lastUpdated: '10:47 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1005', reference: 'salary_emp_105', amount: 2000, method: 'NACH', status: 'Confirmed', match: 'Likely Matched', lastUpdated: '10:48 AM', paymentPartner: 'Razorpay', bank: 'SBI' },
    { batchId: b, requestId: 'INT-1006', reference: 'salary_emp_106', amount: 1200, method: 'LSM', status: 'Pending', match: 'Awaiting', lastUpdated: '10:49 AM', paymentPartner: 'Cashfree', bank: 'ICICI Bank' },
    { batchId: b, requestId: 'INT-1007', reference: 'salary_emp_107', amount: 2500, method: 'Bank Transfer', status: 'Confirmed', match: 'Matched', lastUpdated: '10:50 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1008', reference: 'salary_emp_108', amount: 1400, method: 'NACH', status: 'In Progress', match: 'Awaiting', lastUpdated: '10:51 AM', paymentPartner: 'PayU', bank: 'SBI' },
    { batchId: b, requestId: 'INT-1009', reference: 'salary_emp_109', amount: 1700, method: 'Bank Transfer', status: 'Pending', match: 'Awaiting', lastUpdated: '10:52 AM', paymentPartner: 'Razorpay', bank: 'ICICI Bank' },
    { batchId: b, requestId: 'INT-1010', reference: 'salary_emp_110', amount: 2300, method: 'LSM', status: 'Confirmed', match: 'Matched', lastUpdated: '10:53 AM', paymentPartner: 'Cashfree', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1011', reference: 'salary_emp_111', amount: 1600, method: 'Bank Transfer', status: 'Needs Review', match: 'Mismatch', lastUpdated: '10:54 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1012', reference: 'salary_emp_112', amount: 1900, method: 'NACH', status: 'Confirmed', match: 'Matched', lastUpdated: '10:55 AM', paymentPartner: 'PayU', bank: 'SBI' },
    { batchId: b, requestId: 'INT-1013', reference: 'salary_emp_113', amount: 2100, method: 'Bank Transfer', status: 'Pending', match: 'Awaiting', lastUpdated: '10:56 AM', paymentPartner: 'Razorpay', bank: 'ICICI Bank' },
    { batchId: b, requestId: 'INT-1014', reference: 'salary_emp_114', amount: 1300, method: 'LSM', status: 'Confirmed', match: 'Likely Matched', lastUpdated: '10:57 AM', paymentPartner: 'Cashfree', bank: 'HDFC Bank' },
    { batchId: b, requestId: 'INT-1015', reference: 'salary_emp_115', amount: 2000, method: 'Bank Transfer', status: 'Confirmed', match: 'Matched', lastUpdated: '10:58 AM', paymentPartner: 'Razorpay', bank: 'HDFC Bank' },
  ]
  return [
    ...rows,
    ...rows.map((r, i) => ({
      ...r,
      batchId: b2,
      requestId: `INT-${1023 + i}`,
      reference: `salary_emp_${201 + i}`,
    })),
  ]
}

export function getIntentJournalFailures(): IntentJournalFailureRow[] {
  const b = 'ZB-2041'
  return [
    { batchId: b, requestId: 'INT-2001', reference: 'salary_emp_201', amount: 1500, method: 'Bank Transfer', paymentPartner: 'Razorpay', failureReason: 'Invalid account details', failureStage: 'Validation', lastUpdated: '10:42 AM', action: 'Fix Details' },
    { batchId: b, requestId: 'INT-2002', reference: 'salary_emp_202', amount: 2000, method: 'LSM', paymentPartner: 'Cashfree', failureReason: 'Payment partner rejected', failureStage: 'Dispatch', lastUpdated: '10:45 AM', action: 'Retry' },
    { batchId: b, requestId: 'INT-2003', reference: 'salary_emp_203', amount: 1800, method: 'Bank Transfer', paymentPartner: 'Razorpay', failureReason: 'No confirmation found', failureStage: 'Settlement', lastUpdated: '10:47 AM', action: 'Investigate' },
    { batchId: b, requestId: 'INT-2004', reference: 'salary_emp_204', amount: 2200, method: 'NACH', paymentPartner: 'PayU', failureReason: 'Mandate not active', failureStage: 'Processing', lastUpdated: '10:49 AM', action: 'Fix Mandate' },
    { batchId: b, requestId: 'INT-2005', reference: 'salary_emp_205', amount: 1700, method: 'Bank Transfer', paymentPartner: 'Razorpay', failureReason: 'Missing IFSC', failureStage: 'Validation', lastUpdated: '10:50 AM', action: 'Fix Details' },
    { batchId: b, requestId: 'INT-2006', reference: 'salary_emp_206', amount: 2400, method: 'LSM', paymentPartner: 'Cashfree', failureReason: 'Timeout during processing', failureStage: 'Processing', lastUpdated: '10:52 AM', action: 'Retry' },
    { batchId: b, requestId: 'INT-2007', reference: 'salary_emp_207', amount: 1600, method: 'Bank Transfer', paymentPartner: 'Razorpay', failureReason: 'Duplicate transaction', failureStage: 'Dispatch', lastUpdated: '10:53 AM', action: 'Investigate' },
    { batchId: b, requestId: 'INT-2008', reference: 'salary_emp_208', amount: 1900, method: 'NACH', paymentPartner: 'PayU', failureReason: 'Mandate expired', failureStage: 'Processing', lastUpdated: '10:54 AM', action: 'Fix Mandate' },
    { batchId: b, requestId: 'INT-2009', reference: 'salary_emp_209', amount: 2100, method: 'Bank Transfer', paymentPartner: 'Razorpay', failureReason: 'No settlement record', failureStage: 'Settlement', lastUpdated: '10:55 AM', action: 'Investigate' },
    { batchId: b, requestId: 'INT-2010', reference: 'salary_emp_210', amount: 1300, method: 'LSM', paymentPartner: 'Cashfree', failureReason: 'PSP internal error', failureStage: 'Processing', lastUpdated: '10:56 AM', action: 'Retry' },
  ]
}

export const spiderData = [
  { subject: 'Routing', value: 86 },
  { subject: 'Callback', value: 72 },
  { subject: 'Proof', value: 81 },
  { subject: 'Banking', value: 68 },
  { subject: 'Recovery', value: 76 },
  { subject: 'Handoff', value: 71 },
] as const

export const gridBarData = [
  { label: 'Ops', open: 44, cleared: 29 },
  { label: 'Finance', open: 31, cleared: 26 },
  { label: 'Engineering', open: 18, cleared: 11 },
  { label: 'Bank Ops', open: 27, cleared: 16 },
] as const

export const heatMap = [
  [3, 5, 4, 2, 1, 0],
  [5, 7, 6, 4, 2, 1],
  [7, 9, 8, 5, 4, 2],
  [6, 8, 9, 7, 5, 3],
] as const

export const syncTrendData = [
  { point: '08:00', payments: 62, webhooks: 54, statements: 44 },
  { point: '10:00', payments: 75, webhooks: 61, statements: 49 },
  { point: '12:00', payments: 84, webhooks: 72, statements: 55 },
  { point: '14:00', payments: 93, webhooks: 76, statements: 63 },
  { point: '16:00', payments: 88, webhooks: 73, statements: 60 },
  { point: '18:00', payments: 95, webhooks: 82, statements: 68 },
  { point: '20:00', payments: 90, webhooks: 79, statements: 64 },
] as const

export const syncPieData = [
  { name: 'Payments', value: 46 },
  { name: 'Webhooks', value: 31 },
  { name: 'Statements', value: 23 },
] as const

export const syncBarData = [
  { name: 'Razorpay', lag: 118, retries: 12 },
  { name: 'Stripe', lag: 92, retries: 8 },
  { name: 'Cashfree', lag: 141, retries: 18 },
  { name: 'ICICI', lag: 167, retries: 22 },
] as const

export const proofRows = [
  { name: 'Export queue', value: '27', note: 'Still waiting on final assembly' },
  { name: 'Ready packets', value: '142', note: 'Finance-ready this cycle' },
  { name: 'Audit confidence', value: '84.2%', note: 'Valid evidence chain present' },
  { name: 'Missing sources', value: '11', note: 'Need callback or statement cues' },
] as const

export const proofSourceData = [
  { name: 'Callbacks', value: 41 },
  { name: 'Statements', value: 28 },
  { name: 'Provider logs', value: 19 },
  { name: 'Manual notes', value: 12 },
] as const

export const chartTooltipStyle = {
  border: '0.5px solid #E5E5E5',
  borderRadius: '8px',
  background: '#ffffff',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
}
