/**
 * CON-P1-24 — versioned exhaustive mapping: backend settlement_status → UI bucket.
 * Exact enum match only (never substring). Unknown statuses never upgrade to settled/success.
 */

/** Bump when adding/removing mapped backend enums or changing bucket semantics. */
export const SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION = 1 as const

/** UI financial buckets for a single observation status. */
export type SettlementObservationUiBucket = 'settled' | 'failed' | 'pending' | 'unknown'

export type SettlementObservationStatusMapping = {
  /** Normalized backend enum (UPPER_SNAKE). Empty when input blank. */
  enum: string
  bucket: SettlementObservationUiBucket
  /** Customer-facing label. Unknown → Needs mapping. */
  label: string
  /** True when enum is in the versioned map. */
  known: boolean
  mapVersion: typeof SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION
}

/**
 * Known backend settlement_status values → UI bucket.
 * Keep exhaustive for statuses the console has contracted; add new enums here deliberately.
 */
export const SETTLEMENT_OBSERVATION_STATUS_MAP_V1 = {
  SETTLED: 'settled',
  FULLY_SETTLED: 'settled',
  SUCCESS: 'settled',
  SUCCESSFUL: 'settled',
  CONFIRMED: 'settled',
  COMPLETED: 'settled',

  FAILED: 'failed',
  FAILURE: 'failed',
  REJECTED: 'failed',
  REJECT: 'failed',
  DECLINED: 'failed',
  ERROR: 'failed',

  PENDING: 'pending',
  PROCESSING: 'pending',
  IN_PROGRESS: 'pending',
  PARTIALLY_SETTLED: 'pending',
  AWAITING: 'pending',
  OPEN: 'pending',
  RECEIVED: 'pending',
} as const satisfies Record<string, SettlementObservationUiBucket>

export type KnownSettlementObservationStatus = keyof typeof SETTLEMENT_OBSERVATION_STATUS_MAP_V1

const LABEL_BY_BUCKET: Record<SettlementObservationUiBucket, string> = {
  settled: 'Settled',
  failed: 'Failed',
  pending: 'Pending',
  unknown: 'Needs mapping',
}

/** Normalize raw API status to UPPER_SNAKE for exact map lookup. */
export function normalizeSettlementObservationStatus(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function mapSettlementObservationStatus(
  statusRaw: string | null | undefined,
): SettlementObservationStatusMapping {
  const enumKey = normalizeSettlementObservationStatus(statusRaw)
  if (!enumKey) {
    return {
      enum: '',
      bucket: 'unknown',
      label: LABEL_BY_BUCKET.unknown,
      known: false,
      mapVersion: SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION,
    }
  }

  const bucket = (SETTLEMENT_OBSERVATION_STATUS_MAP_V1 as Record<string, SettlementObservationUiBucket>)[
    enumKey
  ]
  if (bucket) {
    return {
      enum: enumKey,
      bucket,
      label: LABEL_BY_BUCKET[bucket],
      known: true,
      mapVersion: SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION,
    }
  }

  return {
    enum: enumKey,
    bucket: 'unknown',
    label: LABEL_BY_BUCKET.unknown,
    known: false,
    mapVersion: SETTLEMENT_OBSERVATION_STATUS_MAP_VERSION,
  }
}

export function isSettledObservationStatus(statusRaw: string | null | undefined): boolean {
  return mapSettlementObservationStatus(statusRaw).bucket === 'settled'
}

export function isFailedObservationStatus(statusRaw: string | null | undefined): boolean {
  return mapSettlementObservationStatus(statusRaw).bucket === 'failed'
}

export function isPendingObservationStatus(statusRaw: string | null | undefined): boolean {
  return mapSettlementObservationStatus(statusRaw).bucket === 'pending'
}

export function isUnknownObservationStatus(statusRaw: string | null | undefined): boolean {
  return mapSettlementObservationStatus(statusRaw).bucket === 'unknown'
}

/** Display label for a raw settlement_status (unknown → Needs mapping). */
export function settlementStatusDisplayLabel(statusRaw: string | null | undefined): string {
  const mapped = mapSettlementObservationStatus(statusRaw)
  if (!mapped.enum) return '—'
  if (!mapped.known) return mapped.label
  return mapped.enum.replace(/_/g, ' ')
}
