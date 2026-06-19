import { fetchProdJsonGetWithMeta, type ProdJsonGetResult } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'

export type SettlementObservationBatchListItem = {
  client_batch_id: string
}

export type SettlementPagination = {
  page?: number
  page_size?: number
  total?: number
}

export type SettlementObservationBatchListResponse = {
  items: SettlementObservationBatchListItem[]
  pagination?: SettlementPagination
}

/** Canonical settlement observation row (mode 2) — mirrors outcome-engine JSON. */
export type CanonicalSettlementObservation = {
  settlement_observation_id: string
  tenant_id?: string
  trace_id?: string | null
  settlement_envelope_id?: string
  ingest_run_id?: string
  settlement_batch_id?: string
  source_file_ref?: string
  source_row_ref?: string
  source_system?: string
  connector_id?: string | null
  observation_kind?: string
  source_strength_class?: string
  client_reference_candidate?: string | null
  provider_reference?: string | null
  bank_reference?: string | null
  external_reference?: string | null
  batch_reference?: string | null
  amount?: string | number
  settled_amount?: string | number | null
  fee_amount?: string | number | null
  deduction_amount?: string | number | null
  currency_code?: string
  settlement_status?: string
  provider_status_code?: string | null
  failure_reason_code?: string | null
  retry_flag?: boolean
  reversal_flag?: boolean
  return_flag?: boolean
  observation_timestamp?: string
  value_date?: string
  provider_ref_status?: string
  provider_ref_first_seen_at?: string | null
  provider_ref_last_seen_at?: string | null
  provider_ref_consistency_flag?: boolean | null
  mapping_profile_id?: string
  mapping_profile_version?: string
  client_batch_id?: string
  parse_confidence?: number
  mapping_confidence?: number | string
  carrier_richness_score?: number
  attachment_readiness_score?: number
  score_breakdown_json?: unknown
  score_reason_codes_json?: unknown
  score_version?: string
  canonical_hash?: string
  canonical_snapshot_ref?: string | null
  source_strength?: string
  source_type?: string
  source_system_id?: string
  corridor_id?: string
  beneficiary_fingerprint?: string | null
  zord_signature_carrier?: string | null
  matched_intent_id?: string | null
  warnings_json?: unknown
  created_at?: string
  updated_at?: string
}

export type SettlementObservationDetailResponse = {
  items: CanonicalSettlementObservation[]
  pagination?: SettlementPagination
}

export type SettlementObservationsForBatchResult = {
  items: CanonicalSettlementObservation[]
  total: number | null
}

export type SettlementParseErrorsResult = {
  items: SettlementParseErrorRow[]
  total: number | null
}

/** Mode-2 rows from outcome-engine (canonical columns needed by Settlement Journal). */
export type SettlementObservationBatchDetailItem = {
  settlement_observation_id?: string
  settlement_batch_id?: string
  source_row_ref?: string
  source_system?: string
  amount?: string | number
  settled_amount?: string | number | null
  fee_amount?: string | number | null
  deduction_amount?: string | number | null
  currency_code?: string
  settlement_status?: string
  client_reference_candidate?: string | null
  provider_reference?: string | null
  bank_reference?: string | null
  provider_status_code?: string | null
  failure_reason_code?: string | null
  retry_flag?: boolean
  reversal_flag?: boolean
  return_flag?: boolean
  observation_timestamp?: string
  value_date?: string | null
  source_system_id?: string
  parse_confidence?: number
  mapping_confidence?: number | string
  attachment_readiness_score?: number
  matched_intent_id?: string | null
  created_at?: string
  updated_at?: string
}

export type SettlementParseErrorRow = {
  source_row_ref?: string
  error_stage?: string
  reason_code?: string
  severity?: string
}

function isBatchIdListItem(
  item: SettlementObservationBatchListItem | CanonicalSettlementObservation | SettlementObservationBatchDetailItem,
): item is SettlementObservationBatchListItem {
  const keys = Object.keys(item as object)
  return keys.length <= 2 && 'client_batch_id' in (item as object)
}

/** Normalize list vs detail `items` from GET …/observations/batches. */
export function extractClientBatchIdsFromListResponse(
  data: SettlementObservationBatchListResponse | SettlementObservationDetailResponse | null | undefined,
): string[] {
  if (!data?.items?.length) return []
  const first = data.items[0]
  if (isBatchIdListItem(first)) {
    return (data.items as SettlementObservationBatchListItem[])
      .map((it) => String(it.client_batch_id ?? '').trim())
      .filter(Boolean)
  }
  const fromRows = (data.items as Array<{ client_batch_id?: string }>)
    .map((it) => String(it.client_batch_id ?? '').trim())
    .filter(Boolean)
  return [...new Set(fromRows)]
}

export const SETTLEMENT_OBSERVATIONS_BFF_PATH = '/api/prod/settlement/observations/batches'
export const SETTLEMENT_PARSE_ERRORS_BFF_PATH = '/api/prod/settlement/errors'

/** Outcome-engine max page size for settlement observation detail mode. */
export const SETTLEMENT_OBSERVATIONS_FETCH_PAGE_SIZE = 100

function observationsUrl(
  clientBatchId?: string,
  opts?: { page?: number; pageSize?: number },
) {
  const params = new URLSearchParams()
  if (clientBatchId?.trim()) params.set('client_batch_id', clientBatchId.trim())
  if (opts?.page != null) params.set('page', String(opts.page))
  if (opts?.pageSize != null) params.set('page_size', String(opts.pageSize))
  const qs = params.toString()
  return qs ? `${SETTLEMENT_OBSERVATIONS_BFF_PATH}?${qs}` : SETTLEMENT_OBSERVATIONS_BFF_PATH
}

function settlementParseErrorsUrl(clientBatchId?: string) {
  const params = new URLSearchParams()
  if (clientBatchId?.trim()) params.set('batch_id', clientBatchId.trim())
  const qs = params.toString()
  return qs ? `${SETTLEMENT_PARSE_ERRORS_BFF_PATH}?${qs}` : SETTLEMENT_PARSE_ERRORS_BFF_PATH
}

export async function getSettlementObservationBatchesForSession(): Promise<
  ProdJsonGetResult<SettlementObservationBatchListResponse>
> {
  return fetchProdJsonGetWithMeta<SettlementObservationBatchListResponse>(observationsUrl())
}

export async function getSettlementObservationsPageForClientBatch(
  clientBatchId: string,
  opts: { page: number; pageSize: number },
): Promise<ProdJsonGetResult<SettlementObservationsForBatchResult>> {
  const bid = clientBatchId.trim()
  if (!bid) {
    return { data: { items: [], total: null }, ok: true, status: 200, url: observationsUrl() }
  }

  const page = Math.max(1, opts.page)
  const pageSize = Math.max(1, Math.min(100, opts.pageSize))
  const url = observationsUrl(bid, { page, pageSize })
  const res = await fetchProdJsonGetWithMeta<SettlementObservationDetailResponse>(url)
  if (!res.ok || !res.data) {
    return { ...res, data: { items: [], total: null } }
  }

  const items = res.data.items ?? []
  const total = res.data.pagination?.total ?? null
  return { ...res, data: { items, total } }
}

export async function getSettlementObservationsForClientBatch(
  clientBatchId: string,
): Promise<ProdJsonGetResult<SettlementObservationsForBatchResult>> {
  const bid = clientBatchId.trim()
  if (!bid) {
    return { data: { items: [], total: null }, ok: true, status: 200, url: observationsUrl() }
  }

  const pageSize = SETTLEMENT_OBSERVATIONS_FETCH_PAGE_SIZE
  const allItems: CanonicalSettlementObservation[] = []
  let total: number | null = null
  let lastUrl = observationsUrl(bid, { page: 1, pageSize })
  let lastStatus = 200
  let ok = true

  for (let page = 1; page <= 500; page += 1) {
    lastUrl = observationsUrl(bid, { page, pageSize })
    const res = await fetchProdJsonGetWithMeta<SettlementObservationDetailResponse>(lastUrl)
    lastStatus = res.status
    if (!res.ok || !res.data) {
      ok = false
      if (page === 1) {
        return { ...res, data: { items: [], total: null } }
      }
      break
    }

    const batch = res.data.items ?? []
    if (res.data.pagination?.total != null) {
      total = res.data.pagination.total
    }
    allItems.push(...batch)

    if (batch.length === 0) break
    if (total != null && allItems.length >= total) break
    if (batch.length < pageSize) break
  }

  return {
    ok,
    status: lastStatus,
    url: lastUrl,
    data: { items: allItems, total: total ?? allItems.length },
  }
}

export async function getSettlementParseErrorsForClientBatch(
  clientBatchId: string,
): Promise<ProdJsonGetResult<SettlementParseErrorsResult>> {
  const bid = clientBatchId.trim()
  if (!bid) {
    return { data: { items: [], total: null }, ok: true, status: 200, url: settlementParseErrorsUrl() }
  }
  const res = await fetchProdJsonGetWithMeta<
    SettlementParseErrorRow[] | { items?: SettlementParseErrorRow[]; pagination?: SettlementPagination }
  >(settlementParseErrorsUrl(bid))
  if (!res.ok) return { ...res, data: { items: [], total: null } }
  const payload = res.data
  const items = Array.isArray(payload) ? payload : payload?.items ?? []
  const total = Array.isArray(payload) ? items.length : (payload?.pagination?.total ?? null)
  return { ...res, data: { items, total } }
}

export type SettlementObservationTableRow = {
  observationId: string
  settlementBatchId: string
  ingestRunId: string
  clientBatchId: string
  sourceRowRef: string
  sourceFileRef: string
  clientRef: string
  providerRef: string
  bankRef: string
  amount: number
  settledAmount: number
  feeAmount: number
  deductionAmount: number
  currency: string
  status: string
  statusRaw: string
  sourceSystem: string
  sourceSystemId: string
  sourceType: string
  sourceStrength: string
  observationKind: string
  observationTime: string
  valueDate: string
  createdAt: string
  updatedAt: string
  providerStatusCode: string
  failureReasonCode: string
  retryFlag: boolean
  reversalFlag: boolean
  returnFlag: boolean
  parseConfidence: number | null
  mappingConfidence: number | null
  carrierRichnessScore: number | null
  attachmentReadinessScore: number | null
  traceId: string
  settlementEnvelopeId: string
  connectorId: string
  externalReference: string
  batchReference: string
  sourceStrengthClass: string
  providerRefStatus: string
  providerRefFirstSeenAt: string
  providerRefLastSeenAt: string
  providerRefConsistent: string
  mappingProfileId: string
  mappingProfileVersion: string
  scoreVersion: string
  canonicalHash: string
  canonicalSnapshotRef: string
  corridorId: string
  beneficiaryFingerprint: string
  zordSignatureCarrier: string
  matchedIntentId: string
}

function parseMoney(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0
  const n = Number.parseFloat(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function formatObsTime(iso: string | undefined): string {
  const safeIso = apiTrimmedString(iso)
  if (!safeIso) return '—'
  const d = new Date(safeIso)
  if (Number.isNaN(d.getTime())) return safeIso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayOrDash(value: string | null | undefined): string {
  const v = value?.trim()
  return v ? v : '—'
}

/** Use 1-based row index only when API source_row_ref is missing or invalid. */
function resolveSourceRowRef(
  raw: string | null | undefined,
  rowIndex: number | undefined,
): string {
  const v = raw?.trim()
  if (!v) {
    return rowIndex != null ? String(rowIndex + 1) : '—'
  }
  const signed = /^-?\d+$/.test(v) ? Number.parseInt(v, 10) : Number.NaN
  if (Number.isFinite(signed)) {
    if (signed <= 0 && rowIndex != null) return String(rowIndex + 1)
    return String(signed)
  }
  return v
}

export function mapObservationToTableRow(
  obs: CanonicalSettlementObservation | SettlementObservationBatchDetailItem,
  opts?: { clientBatchId?: string; rowIndex?: number },
): SettlementObservationTableRow {
  const full = obs as CanonicalSettlementObservation
  const slim = obs as SettlementObservationBatchDetailItem
  const statusRaw = apiTrimmedString(full.settlement_status ?? slim.settlement_status)
  const settlementBatchId = displayOrDash(full.settlement_batch_id ?? slim.settlement_batch_id)
  const sourceRowRef = resolveSourceRowRef(full.source_row_ref ?? slim.source_row_ref, opts?.rowIndex)
  const createdAt = formatObsTime(full.created_at ?? slim.created_at)
  const observationId =
    full.settlement_observation_id?.trim() ||
    slim.settlement_observation_id?.trim() ||
    `${settlementBatchId}:${sourceRowRef}:${opts?.rowIndex ?? 0}:${createdAt}`

  return {
    observationId,
    settlementBatchId,
    ingestRunId: displayOrDash(full.ingest_run_id),
    clientBatchId: displayOrDash(full.client_batch_id ?? opts?.clientBatchId),
    sourceRowRef,
    sourceFileRef: displayOrDash(full.source_file_ref),
    clientRef: displayOrDash(full.client_reference_candidate ?? slim.client_reference_candidate),
    providerRef: displayOrDash(full.provider_reference ?? slim.provider_reference),
    bankRef: displayOrDash(full.bank_reference ?? slim.bank_reference),
    amount: parseMoney(full.amount ?? slim.amount),
    settledAmount: parseMoney(full.settled_amount ?? slim.settled_amount),
    feeAmount: parseMoney(full.fee_amount ?? slim.fee_amount),
    deductionAmount: parseMoney(full.deduction_amount ?? slim.deduction_amount),
    currency: apiTrimmedString(full.currency_code ?? slim.currency_code ?? 'INR') || 'INR',
    statusRaw,
    status: statusRaw ? statusRaw.replace(/_/g, ' ') : '—',
    sourceSystem: displayOrDash(full.source_system ?? slim.source_system),
    sourceSystemId: displayOrDash(full.source_system_id ?? slim.source_system_id),
    sourceType: displayOrDash(full.source_type),
    sourceStrength: displayOrDash(full.source_strength ?? full.source_strength_class),
    observationKind: displayOrDash(full.observation_kind?.replace(/_/g, ' ')),
    observationTime: formatObsTime(full.observation_timestamp ?? slim.observation_timestamp ?? full.created_at ?? slim.created_at),
    valueDate: formatObsTime(full.value_date ?? slim.value_date ?? undefined),
    createdAt,
    updatedAt: formatObsTime(full.updated_at ?? slim.updated_at),
    providerStatusCode: displayOrDash(full.provider_status_code ?? slim.provider_status_code),
    failureReasonCode: displayOrDash(full.failure_reason_code ?? slim.failure_reason_code),
    retryFlag: Boolean(full.retry_flag ?? slim.retry_flag),
    reversalFlag: Boolean(full.reversal_flag ?? slim.reversal_flag),
    returnFlag: Boolean(full.return_flag ?? slim.return_flag),
    parseConfidence:
      typeof full.parse_confidence === 'number'
        ? full.parse_confidence
        : typeof slim.parse_confidence === 'number'
          ? slim.parse_confidence
          : null,
    mappingConfidence: (() => {
      const raw = full.mapping_confidence ?? slim.mapping_confidence
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string' && raw.trim()) {
        const n = Number.parseFloat(raw)
        return Number.isFinite(n) ? n : null
      }
      return null
    })(),
    carrierRichnessScore:
      typeof full.carrier_richness_score === 'number' ? full.carrier_richness_score : null,
    attachmentReadinessScore:
      typeof full.attachment_readiness_score === 'number'
        ? full.attachment_readiness_score
        : typeof slim.attachment_readiness_score === 'number'
          ? slim.attachment_readiness_score
          : null,
    traceId: displayOrDash(full.trace_id ?? undefined),
    settlementEnvelopeId: displayOrDash(full.settlement_envelope_id),
    connectorId: displayOrDash(full.connector_id ?? undefined),
    externalReference: displayOrDash(full.external_reference),
    batchReference: displayOrDash(full.batch_reference),
    sourceStrengthClass: displayOrDash(full.source_strength_class),
    providerRefStatus: displayOrDash(full.provider_ref_status),
    providerRefFirstSeenAt: formatObsTime(full.provider_ref_first_seen_at ?? undefined),
    providerRefLastSeenAt: formatObsTime(full.provider_ref_last_seen_at ?? undefined),
    providerRefConsistent:
      full.provider_ref_consistency_flag === true
        ? 'Yes'
        : full.provider_ref_consistency_flag === false
          ? 'No'
          : '—',
    mappingProfileId: displayOrDash(full.mapping_profile_id),
    mappingProfileVersion: displayOrDash(full.mapping_profile_version),
    scoreVersion: displayOrDash(full.score_version),
    canonicalHash: displayOrDash(full.canonical_hash),
    canonicalSnapshotRef: displayOrDash(full.canonical_snapshot_ref ?? undefined),
    corridorId: displayOrDash(full.corridor_id),
    beneficiaryFingerprint: displayOrDash(full.beneficiary_fingerprint ?? undefined),
    zordSignatureCarrier: displayOrDash(full.zord_signature_carrier ?? undefined),
    matchedIntentId: displayOrDash(full.matched_intent_id ?? undefined),
  }
}

export function observationSearchHaystack(row: SettlementObservationTableRow): string {
  return [
    row.observationId,
    row.settlementBatchId,
    row.ingestRunId,
    row.clientBatchId,
    row.sourceRowRef,
    row.sourceFileRef,
    row.clientRef,
    row.providerRef,
    row.bankRef,
    row.status,
    row.statusRaw,
    row.sourceSystem,
    row.sourceSystemId,
    row.sourceType,
    row.sourceStrength,
    row.observationKind,
    row.providerStatusCode,
    row.failureReasonCode,
    row.settlementEnvelopeId,
    row.externalReference,
    row.batchReference,
    row.connectorId,
    row.canonicalHash,
    String(row.amount),
    String(row.settledAmount),
    String(row.feeAmount),
  ]
    .join(' ')
    .toLowerCase()
}
