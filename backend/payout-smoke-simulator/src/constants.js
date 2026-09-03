/** Shared local-dev tenant + rolling dated batch catalogue for home trend + journals. */

export const TENANT_ID =
  process.env.SMOKE_TENANT_ID?.trim() || '00000000-0000-0000-0000-000000000001'

/**
 * Per-email tenant mapping — each login gets a unique tenant so the console BFF
 * resolves different tenant_ids and upload readiness is properly isolated.
 */
export const USER_TENANTS = {
  'blank@company.com': {
    tenant_id: '11111111-1111-1111-1111-111111111111',
    tenant_name: 'Blank Corp',
    workspace_code: 'BLANK',
  },
  'demo@test123': {
    tenant_id: '22222222-2222-2222-2222-222222222222',
    tenant_name: 'Demo Corp',
    workspace_code: 'DEMO',
  },
  'demo@company.com': {
    tenant_id: TENANT_ID,
    tenant_name: 'Zordnet Ops',
    workspace_code: 'ZORDNET',
  },
}

/** Resolve tenant info for a given email. Falls back to the global TENANT_ID. */
export function tenantForEmail(email) {
  const key = String(email || '').trim().toLowerCase()
  return USER_TENANTS[key] || { tenant_id: TENANT_ID, tenant_name: 'Zordnet Ops', workspace_code: 'ZORDNET' }
}

/** Bearer key accepted by the local payout simulator (set ZORD_*_API_KEY in zord-console). */
export const SMOKE_API_KEY = process.env.SMOKE_API_KEY?.trim() || 'zord-local-dev-api-key'

export function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Rows per batch for intents + settlement observations. */
export const SMOKE_ROWS_PER_DAY = 20

/**
 * Days available for home/leakage trend charts (default: full calendar year, like master).
 * Journal list APIs still honour SMOKE_BATCH_COUNT separately.
 */
export const SMOKE_DEMO_DAY_COUNT = parsePositiveInt(process.env.SMOKE_DEMO_DAY_COUNT, 366)

/** Varied intent vs settlement profiles — cycled for rolling windows. */
const SMOKE_DAY_PROFILES = [
  {
    labelSuffix: 'payroll',
    intentRupees: 55_000,
    settlementRupees: 44_000,
    dlqCount: 2,
    settledRows: 16,
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
    settledRows: 19,
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
    settledRows: 17,
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
    settledRows: 15,
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
    settledRows: 18,
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
    settledRows: 20,
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
    settledRows: 14,
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
    settledRows: 19,
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
    settledRows: 16,
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
    settledRows: 20,
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
  { date: '2026-06-12', labelSuffix: 'payroll', intentRupees: 55_000, settlementRupees: 44_000, dlqCount: 2, settledRows: 16, pendingRows: 3, failedRows: 1, matchConfidence: 0.72, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-13', labelSuffix: 'vendor run', intentRupees: 68_000, settlementRupees: 61_000, dlqCount: 0, settledRows: 19, pendingRows: 1, failedRows: 0, matchConfidence: 0.88, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-14', labelSuffix: 'refunds', intentRupees: 48_000, settlementRupees: 51_000, dlqCount: 1, settledRows: 17, pendingRows: 2, failedRows: 1, matchConfidence: 0.68, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-15', labelSuffix: 'contractor', intentRupees: 71_000, settlementRupees: 52_000, dlqCount: 3, settledRows: 15, pendingRows: 4, failedRows: 1, matchConfidence: 0.61, partner: 'cashfree', finality: 'OPEN' },
  { date: '2026-06-16', labelSuffix: 'incentives', intentRupees: 53_000, settlementRupees: 49_000, dlqCount: 1, settledRows: 18, pendingRows: 1, failedRows: 1, matchConfidence: 0.79, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-17', labelSuffix: 'peak run', intentRupees: 88_000, settlementRupees: 72_000, dlqCount: 0, settledRows: 20, pendingRows: 0, failedRows: 0, matchConfidence: 0.91, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-18', labelSuffix: 'micro-batch', intentRupees: 41_000, settlementRupees: 35_000, dlqCount: 2, settledRows: 14, pendingRows: 5, failedRows: 1, matchConfidence: 0.58, partner: 'razorpay', finality: 'OPEN' },
  { date: '2026-06-19', labelSuffix: 'partner payouts', intentRupees: 67_000, settlementRupees: 61_000, dlqCount: 1, settledRows: 19, pendingRows: 1, failedRows: 0, matchConfidence: 0.85, partner: 'cashfree', finality: 'FULLY_SETTLED' },
  { date: '2026-06-20', labelSuffix: 'sweep', intentRupees: 59_000, settlementRupees: 45_000, dlqCount: 2, settledRows: 16, pendingRows: 3, failedRows: 1, matchConfidence: 0.7, partner: 'razorpay', finality: 'PARTIALLY_SETTLED' },
  { date: '2026-06-21', labelSuffix: 'close-out', intentRupees: 76_000, settlementRupees: 68_000, dlqCount: 0, settledRows: 20, pendingRows: 0, failedRows: 0, matchConfidence: 0.89, partner: 'cashfree', finality: 'FULLY_SETTLED' },
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

/** Rolling last-N days ending today (not last N of the calendar year). */
export function buildSmokeDemoDays() {
  const yearDays = buildSmokeCalendarYearDays()
  const total = Math.min(SMOKE_DEMO_DAY_COUNT, yearDays.length)
  if (total >= yearDays.length) return yearDays
  const today = isoDateUtc(new Date())
  return yearDays.filter((d) => d.date <= today).slice(-total)
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
  if (cap >= merged.length) return merged

  // Cap must end at "today" so home/leakage month windows still hit demo batches.
  const today = isoDateUtc(new Date())
  const rolling = merged.filter((d) => d.date <= today).slice(-cap)
  const rollingDates = new Set(rolling.map((d) => d.date))
  for (const pinned of PINNED_DEMO_DAYS) {
    if (rollingDates.has(pinned.date)) continue
    const day = byDate.get(pinned.date)
    if (day) rolling.push(day)
  }
  return rolling.sort((a, b) => a.date.localeCompare(b.date))
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

/** Full trend catalogue (home month/quarter/year charts). */
export const ALL_BATCHES = buildSmokeBatches()
export const BATCH_COUNT = parsePositiveInt(process.env.SMOKE_BATCH_COUNT, 10)

/** Cap to recent batches while keeping pinned demo/evidence days available. */
function selectSmokeBatches(all, count) {
  if (count >= all.length) return all
  const today = isoDateUtc(new Date())
  const upToToday = all.filter((b) => b.date <= today)
  const recent = (upToToday.length > 0 ? upToToday : all).slice(-count)
  const recentIds = new Set(recent.map((b) => b.id))
  const pinnedDates = new Set(PINNED_DEMO_DAYS.map((p) => p.date))
  const pinned = all.filter((b) => pinnedDates.has(b.date) && !recentIds.has(b.id))
  return [...pinned, ...recent].sort((a, b) => a.date.localeCompare(b.date))
}

/** Stable demo batch for journal / evidence deep-links. */
export const EVIDENCE_BATCH = 'batch-2026-06-12-payroll'
/** Console Create Payout / upload unlock id (aliases evidence fixture data). */
export const UPLOAD_DEMO_BATCH_ID = 'batch-001'

function withUploadDemoBatch(batches) {
  const evidence = ALL_BATCHES.find((b) => b.id === EVIDENCE_BATCH) ?? batches[0]
  if (!evidence || batches.some((b) => b.id === UPLOAD_DEMO_BATCH_ID)) return batches
  return [{ ...evidence, id: UPLOAD_DEMO_BATCH_ID, label: 'Batch 001', intentCount: 100, intentTotalRupees: 1237786756 }, ...batches]
}

/**
 * Journal / evidence list catalogue — capped for fast sidebar loads.
 * Trend KPIs use ALL_BATCHES so Month/Year charts still match master.
 * `batch-001` is always first so console upload → journal unlock works.
 */
export const BATCHES = withUploadDemoBatch(selectSmokeBatches(ALL_BATCHES, BATCH_COUNT))

export const PRIMARY_BATCH =
  BATCHES.find((b) => b.id === UPLOAD_DEMO_BATCH_ID)?.id ??
  BATCHES[BATCHES.length - 1]?.id ??
  `batch-${isoDateUtc(new Date())}-run`
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
