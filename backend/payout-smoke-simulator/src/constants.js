/** Shared local-dev tenant + rolling dated batch catalogue for home trend + journals. */

export const TENANT_ID =
  process.env.SMOKE_TENANT_ID?.trim() || '00000000-0000-0000-0000-000000000001'

/** Bearer key accepted by the local payout simulator (set ZORD_*_API_KEY in zord-console). */
export const SMOKE_API_KEY = process.env.SMOKE_API_KEY?.trim() || 'zord-local-dev-api-key'

export function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Rows per batch for intents + settlement observations. */
export const SMOKE_ROWS_PER_DAY = 15

/** How many demo batches to expose (default: full calendar year). */
export const SMOKE_DEMO_DAY_COUNT = parsePositiveInt(process.env.SMOKE_DEMO_DAY_COUNT, 366)

/** Varied intent vs settlement profiles — cycled for rolling windows. */
const SMOKE_DAY_PROFILES = [
  {
    labelSuffix: 'payroll',
    intentRupees: 55_000,
    settlementRupees: 44_000,
    dlqCount: 2,
    settledRows: 11,
    pendingRows: 3,
    failedRows: 1,
    matchConfidence: 0.72,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'vendor run',
    intentRupees: 68_000,
    settlementRupees: 61_000,
    dlqCount: 0,
    settledRows: 14,
    pendingRows: 1,
    failedRows: 0,
    matchConfidence: 0.88,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'refunds',
    intentRupees: 48_000,
    settlementRupees: 51_000,
    dlqCount: 1,
    settledRows: 12,
    pendingRows: 2,
    failedRows: 1,
    matchConfidence: 0.68,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'contractor',
    intentRupees: 71_000,
    settlementRupees: 52_000,
    dlqCount: 3,
    settledRows: 10,
    pendingRows: 4,
    failedRows: 1,
    matchConfidence: 0.61,
    partner: 'cashfree',
    finality: 'OPEN',
  },
  {
    labelSuffix: 'incentives',
    intentRupees: 53_000,
    settlementRupees: 49_000,
    dlqCount: 1,
    settledRows: 13,
    pendingRows: 1,
    failedRows: 1,
    matchConfidence: 0.79,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'peak run',
    intentRupees: 88_000,
    settlementRupees: 72_000,
    dlqCount: 0,
    settledRows: 15,
    pendingRows: 0,
    failedRows: 0,
    matchConfidence: 0.91,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'micro-batch',
    intentRupees: 41_000,
    settlementRupees: 35_000,
    dlqCount: 2,
    settledRows: 9,
    pendingRows: 5,
    failedRows: 1,
    matchConfidence: 0.58,
    partner: 'razorpay',
    finality: 'OPEN',
  },
  {
    labelSuffix: 'partner payouts',
    intentRupees: 67_000,
    settlementRupees: 61_000,
    dlqCount: 1,
    settledRows: 14,
    pendingRows: 1,
    failedRows: 0,
    matchConfidence: 0.85,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
  {
    labelSuffix: 'sweep',
    intentRupees: 59_000,
    settlementRupees: 45_000,
    dlqCount: 2,
    settledRows: 11,
    pendingRows: 3,
    failedRows: 1,
    matchConfidence: 0.7,
    partner: 'razorpay',
    finality: 'PARTIALLY_SETTLED',
  },
  {
    labelSuffix: 'close-out',
    intentRupees: 76_000,
    settlementRupees: 68_000,
    dlqCount: 0,
    settledRows: 15,
    pendingRows: 0,
    failedRows: 0,
    matchConfidence: 0.89,
    partner: 'cashfree',
    finality: 'FULLY_SETTLED',
  },
]

function isoDateUtc(d) {
  return d.toISOString().slice(0, 10)
}

/** Pin fixed Jun 12–21 demo batches so journal/evidence URLs stay stable in smoke. */
const PINNED_DEMO_DAYS = [
  { date: '2026-06-12', labelSuffix: 'payroll', intentRupees: 55_000, settlementRupees: 44_000, dlqCount: 2, settledRows: 11, pendingRows: 3, failedRows: 1, matchConfidence: 0.72, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-13', labelSuffix: 'vendor run', intentRupees: 68_000, settlementRupees: 61_000, dlqCount: 0, settledRows: 14, pendingRows: 1, failedRows: 0, matchConfidence: 0.88, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-14', labelSuffix: 'refunds', intentRupees: 48_000, settlementRupees: 51_000, dlqCount: 1, settledRows: 12, pendingRows: 2, failedRows: 1, matchConfidence: 0.68, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-15', labelSuffix: 'contractor', intentRupees: 71_000, settlementRupees: 52_000, dlqCount: 3, settledRows: 10, pendingRows: 4, failedRows: 1, matchConfidence: 0.61, partner: 'cashfree', finality: 'OPEN' },
  { date: '2026-06-16', labelSuffix: 'incentives', intentRupees: 53_000, settlementRupees: 49_000, dlqCount: 1, settledRows: 13, pendingRows: 1, failedRows: 1, matchConfidence: 0.79, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-17', labelSuffix: 'peak run', intentRupees: 88_000, settlementRupees: 72_000, dlqCount: 0, settledRows: 15, pendingRows: 0, failedRows: 0, matchConfidence: 0.91, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-18', labelSuffix: 'micro-batch', intentRupees: 41_000, settlementRupees: 35_000, dlqCount: 2, settledRows: 9, pendingRows: 5, failedRows: 1, matchConfidence: 0.58, partner: 'razorpay', finality: 'OPEN' },
  { date: '2026-06-19', labelSuffix: 'partner payouts', intentRupees: 67_000, settlementRupees: 61_000, dlqCount: 1, settledRows: 14, pendingRows: 1, failedRows: 0, matchConfidence: 0.85, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-20', labelSuffix: 'sweep', intentRupees: 59_000, settlementRupees: 45_000, dlqCount: 2, settledRows: 11, pendingRows: 3, failedRows: 1, matchConfidence: 0.7, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-21', labelSuffix: 'close-out', intentRupees: 76_000, settlementRupees: 68_000, dlqCount: 0, settledRows: 15, pendingRows: 0, failedRows: 0, matchConfidence: 0.89, partner: 'cashfree', finality: 'FULLY_SETTLED' },
]

function dayChartLabelFromIso(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

function smokeDayFromProfile(date, index) {
  const profile = SMOKE_DAY_PROFILES[index % SMOKE_DAY_PROFILES.length]
  const cycle = Math.floor(index / SMOKE_DAY_PROFILES.length)
  const swing = cycle * 4_500 + (index % 3) * 1_200
  return {
    date,
    label: dayChartLabelFromIso(date),
    intentRupees: profile.intentRupees + swing,
    settlementRupees: Math.max(28_000, profile.settlementRupees + Math.round(swing * 0.78)),
    dlqCount: profile.dlqCount,
    settledRows: profile.settledRows,
    pendingRows: profile.pendingRows,
    failedRows: profile.failedRows,
    matchConfidence: profile.matchConfidence,
    partner: profile.partner,
    finality: profile.finality,
    labelSuffix: profile.labelSuffix,
  }
}

/** Every UTC day in the current calendar year — aligns with home chart month/quarter/year tabs. */
export function buildSmokeCalendarYearDays() {
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)
  const year = today.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const end = Date.UTC(year, 11, 31)
  const days = []
  let index = 0
  for (let t = start; t <= end; t += 86_400_000) {
    const date = isoDateUtc(new Date(t))
    days.push(smokeDayFromProfile(date, index))
    index += 1
  }
  return days
}

/** Rolling last-N days ending today — kept for env override when SMOKE_DEMO_DAY_COUNT < year length. */
export function buildSmokeDemoDays() {
  const total = Math.min(SMOKE_DEMO_DAY_COUNT, buildSmokeCalendarYearDays().length)
  const yearDays = buildSmokeCalendarYearDays()
  if (total >= yearDays.length) return yearDays
  return yearDays.slice(-total)
}

export function buildSmokeDemoDaysMerged() {
  const byDate = new Map(buildSmokeCalendarYearDays().map((d) => [d.date, d]))
  for (const pinned of PINNED_DEMO_DAYS) {
    byDate.set(pinned.date, {
      date: pinned.date,
      label: dayChartLabelFromIso(pinned.date),
      intentRupees: pinned.intentRupees,
      settlementRupees: pinned.settlementRupees,
      dlqCount: pinned.dlqCount,
      settledRows: pinned.settledRows,
      pendingRows: pinned.pendingRows,
      failedRows: pinned.failedRows,
      matchConfidence: pinned.matchConfidence,
      partner: pinned.partner,
      finality: pinned.finality,
      labelSuffix: pinned.labelSuffix,
    })
  }
  const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  const cap = parsePositiveInt(process.env.SMOKE_DEMO_DAY_COUNT, merged.length)
  return cap >= merged.length ? merged : merged.slice(-cap)
}

export const SMOKE_DEMO_DAYS = buildSmokeDemoDaysMerged()

function toBatchSlug(labelSuffix) {
  return String(labelSuffix ?? 'run').trim().toLowerCase().replace(/\s+/g, '-')
}

/** Client batch id shape used in production uploads: batch-YYYY-MM-DD-<run-label>. */
export function batchIdForDay(day) {
  return `batch-${day.date}-${toBatchSlug(day.labelSuffix)}`
}

export function buildSmokeBatches() {
  return SMOKE_DEMO_DAYS.map((d) => ({
    id: batchIdForDay(d),
    label: `${d.label} ${d.labelSuffix ?? ''}`.trim(),
    date: d.date,
    intentCount: SMOKE_ROWS_PER_DAY,
    observationCount: SMOKE_ROWS_PER_DAY,
    intentTotalRupees: d.intentRupees,
    settlementTotalRupees: d.settlementRupees,
    dlqCount: d.dlqCount,
    settledRows: d.settledRows,
    pendingRows: d.pendingRows,
    failedRows: d.failedRows,
    matchConfidence: d.matchConfidence,
    partner: d.partner,
    finality: d.finality,
    totalIntendedMinor: d.intentRupees,
  }))
}

const ALL_BATCHES = buildSmokeBatches()
export const BATCH_COUNT = parsePositiveInt(process.env.SMOKE_BATCH_COUNT, ALL_BATCHES.length)
export const BATCHES = ALL_BATCHES

export const PRIMARY_BATCH =
  BATCHES[BATCHES.length - 1]?.id ?? `batch-${isoDateUtc(new Date())}-run`

/** Stable demo batch for journal / evidence deep-links. */
export const EVIDENCE_BATCH = 'batch-2026-06-12-payroll'
export function batchPackId(batchId) {
  return `pack-${batchId}`
}

/** @deprecated Legacy alias — prefer batchPackId(batchId). */
export const PACK_BATCH = batchPackId(EVIDENCE_BATCH)

export function intentId(batchId, index) {
  return `${batchId}-pi-${String(index + 1).padStart(3, '0')}`
}

export const PACK_INTENT_A = batchPackId(intentId(EVIDENCE_BATCH, 0))
export const PACK_INTENT_B = batchPackId(intentId(EVIDENCE_BATCH, 1))
