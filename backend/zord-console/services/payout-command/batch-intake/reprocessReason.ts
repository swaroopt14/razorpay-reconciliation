export const REPROCESS_REASONS = [
  'CLIENT_CORRECTED_FILE',
  'PARSER_FIX',
  'BACKFILL',
  'MANUAL',
] as const

export type ReprocessReason = (typeof REPROCESS_REASONS)[number]

export function isReprocessReason(value: string | null | undefined): value is ReprocessReason {
  return REPROCESS_REASONS.includes(value as ReprocessReason)
}
