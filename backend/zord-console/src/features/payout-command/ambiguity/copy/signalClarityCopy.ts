/**
 * Canonical Signal clarity band language for Match Review.
 * Payment-domain labels only — no RBI DPD / SMA / NPA jargon in the UI.
 * Keep in sync with `landingHolyGrailCopy.ts` → `signalClarity`.
 */

export type SignalClarityBandKey =
  | 'settlement'
  | 'ambiguous'
  | 'variance'
  | 'reversal'
  | 'unresolved'

export type SignalClarityBandSpec = {
  /** API band id (legacy SMA/NPA ids still accepted from API) */
  band: string
  /** Customer-facing band label */
  displayLabel: string
  /** Short helper under the band name */
  helperLabel: string
  /** Roll-rate pill label; null when not applicable */
  rollLabel: string | null
  amountField:
    | 'total_observed_settled_amount_minor'
    | 'ambiguous_amount_minor'
    | 'total_variance_minor'
    | 'reversal_exposure_minor'
    | 'unresolved_amount_minor'
    | 'total_intended_amount_minor'
  countField?: 'unresolved_count'
}

export const SIGNAL_CLARITY_BAND_ORDER: SignalClarityBandKey[] = [
  'settlement',
  'ambiguous',
  'variance',
  'reversal',
  'unresolved',
]

export const SIGNAL_CLARITY_COPY = {
  title: 'Payment Signal Clarity',
  bands: {
    settlement: {
      band: 'settlement',
      displayLabel: 'Settlement amount',
      helperLabel: 'Value confirmed in bank or settlement records',
      rollLabel: null,
      amountField: 'total_observed_settled_amount_minor',
    },
    ambiguous: {
      band: 'ambiguous',
      displayLabel: 'Ambiguous amount',
      helperLabel: 'Value with unclear match signal',
      rollLabel: 'Settlement→Ambiguous %',
      amountField: 'ambiguous_amount_minor',
    },
    variance: {
      band: 'variance',
      displayLabel: 'Variance',
      helperLabel: 'Settlement gap vs intended',
      rollLabel: 'Ambiguous→Variance %',
      amountField: 'total_variance_minor',
    },
    reversal: {
      band: 'reversal',
      displayLabel: 'Reversal',
      helperLabel: 'Reversed or clawed-back exposure',
      rollLabel: 'Variance→Reversal %',
      amountField: 'reversal_exposure_minor',
    },
    unresolved: {
      band: 'unresolved',
      displayLabel: 'Unresolved',
      helperLabel: 'Open items awaiting match review',
      rollLabel: 'Reversal→Unresolved %',
      amountField: 'unresolved_amount_minor',
      countField: 'unresolved_count',
    },
  } satisfies Record<SignalClarityBandKey, SignalClarityBandSpec>,
  /** Matches API `from_band` / `to_band` — roll % values come from API only */
  rollPills: [
    { from_band: 'Current', to_band: 'SMA-0', rollLabel: 'Settlement→Ambiguous %' },
    { from_band: 'SMA-0', to_band: 'SMA-1', rollLabel: 'Ambiguous→Variance %' },
    { from_band: 'SMA-1', to_band: 'SMA-2', rollLabel: 'Variance→Reversal %' },
    { from_band: 'SMA-2', to_band: 'NPA', rollLabel: 'Reversal→Unresolved %' },
  ],
} as const

const LEGACY_BAND_ALIASES: Record<string, SignalClarityBandKey> = {
  current: 'settlement',
  settlement: 'settlement',
  settled: 'settlement',
  intended: 'settlement',
  'sma-0': 'ambiguous',
  sma0: 'ambiguous',
  ambiguous: 'ambiguous',
  'sma-1': 'variance',
  sma1: 'variance',
  variance: 'variance',
  'sma-2': 'reversal',
  sma2: 'reversal',
  reversal: 'reversal',
  npa: 'reversal',
  'npa-2': 'unresolved',
  unresolved: 'unresolved',
}

export function normalizeSignalClarityBandKey(band: string): SignalClarityBandKey | null {
  const lower = band.trim().toLowerCase()
  if (LEGACY_BAND_ALIASES[lower]) return LEGACY_BAND_ALIASES[lower]
  if (lower.includes('settlement') || lower.includes('settled') || lower.includes('confirmed')) {
    return 'settlement'
  }
  if (lower.includes('ambiguous') || lower.includes('unclear')) return 'ambiguous'
  if (lower.includes('variance')) return 'variance'
  if (lower.includes('unresolved') || lower.includes('open')) return 'unresolved'
  if (lower.includes('reversal')) return 'reversal'
  return null
}

export function signalClarityBandSpec(band: string): SignalClarityBandSpec | null {
  const key = normalizeSignalClarityBandKey(band)
  return key ? SIGNAL_CLARITY_COPY.bands[key] : null
}

export function signalClarityRollLabel(fromBand: string, toBand: string): string {
  const pill = SIGNAL_CLARITY_COPY.rollPills.find(
    (p) =>
      normalizeSignalClarityBandKey(p.from_band) === normalizeSignalClarityBandKey(fromBand) &&
      normalizeSignalClarityBandKey(p.to_band) === normalizeSignalClarityBandKey(toBand),
  )
  if (pill) return pill.rollLabel
  const from = signalClarityBandSpec(fromBand)?.displayLabel ?? fromBand
  const to = signalClarityBandSpec(toBand)?.displayLabel ?? toBand
  return `${from}→${to} %`
}

export function signalClarityHelperLabel(band: string, apiRangeLabel?: string): string | null {
  const spec = signalClarityBandSpec(band)
  if (spec?.helperLabel) return spec.helperLabel
  const range = apiRangeLabel?.trim()
  if (!range || /dpd|sma|npa/i.test(range)) return null
  return range
}
