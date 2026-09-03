/**
 * Upload-first gate — scoped per user session (Bearer token).
 * Each login gets a unique access_token; readiness is keyed by that token.
 */

/** @type {Map<string, Map<string, { intentOk: boolean, settlementOk: boolean, updatedAt: string }>>} */
const readinessBySession = new Map()

function sessionKey(request) {
  if (!request) return '__default__'
  const auth = request.headers?.get?.('authorization') ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || '__default__'
}

export function isUploadFirstEnabled() {
  const preseed = (process.env.SMOKE_PRESEED_DATA ?? '').trim().toLowerCase()
  if (preseed === '1' || preseed === 'true' || preseed === 'yes') return false
  const flag = (process.env.SMOKE_UPLOAD_FIRST ?? '1').trim().toLowerCase()
  return !(flag === '0' || flag === 'false' || flag === 'no')
}

export function resetUploadReadiness(request) {
  if (!request) {
    readinessBySession.clear()
    return
  }
  const key = sessionKey(request)
  readinessBySession.delete(key)
}

function touch(batchId, patch, request) {
  const id = String(batchId || '').trim()
  if (!id) return null
  const key = sessionKey(request)
  if (!readinessBySession.has(key)) readinessBySession.set(key, new Map())
  const batches = readinessBySession.get(key)
  const prev = batches.get(id) || { intentOk: false, settlementOk: false, updatedAt: '' }
  const next = {
    intentOk: patch.intentOk ?? prev.intentOk,
    settlementOk: patch.settlementOk ?? prev.settlementOk,
    updatedAt: new Date().toISOString(),
  }
  batches.set(id, next)
  return next
}

export function markIntentUploaded(batchId, request) {
  return touch(batchId, { intentOk: true }, request)
}

export function markSettlementUploaded(batchId, request) {
  return touch(batchId, { settlementOk: true }, request)
}

export function getBatchReadiness(batchId, request) {
  const id = String(batchId || '').trim()
  if (!id) return null
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  return batches?.get(id) || null
}

export function isIntentReady(batchId, request) {
  if (!isUploadFirstEnabled()) return true
  const r = getBatchReadiness(batchId, request)
  return Boolean(r?.intentOk)
}

export function isSettlementReady(batchId, request) {
  if (!isUploadFirstEnabled()) return true
  const r = getBatchReadiness(batchId, request)
  return Boolean(r?.settlementOk)
}

export function isBatchFullyReady(batchId, request) {
  if (!isUploadFirstEnabled()) return true
  const r = getBatchReadiness(batchId, request)
  return Boolean(r?.intentOk && r?.settlementOk)
}

function listIdsWhere(predicate, request) {
  if (!isUploadFirstEnabled()) return null
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return []
  const ids = []
  for (const [id, r] of batches.entries()) {
    if (predicate(r)) ids.push(id)
  }
  return ids
}

export function listIntentReadyBatchIds(request) {
  return listIdsWhere((r) => r.intentOk, request)
}

export function listSettlementReadyBatchIds(request) {
  return listIdsWhere((r) => r.settlementOk, request)
}

export function listFullyReadyBatchIds(request) {
  return listIdsWhere((r) => r.intentOk && r.settlementOk, request)
}

export function hasIngestedIntentFile(request) {
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return false
  for (const r of batches.values()) {
    if (r.intentOk) return true
  }
  return false
}

export function hasIngestedSettlementFile(request) {
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return false
  for (const r of batches.values()) {
    if (r.settlementOk) return true
  }
  return false
}

export function hasAnyIntentReadyBatch(request) {
  if (!isUploadFirstEnabled()) return true
  return hasIngestedIntentFile(request)
}

export function hasAnySettlementReadyBatch(request) {
  if (!isUploadFirstEnabled()) return true
  return hasIngestedSettlementFile(request)
}

export function hasAnyFullyReadyBatch(request) {
  if (!isUploadFirstEnabled()) return true
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return false
  for (const r of batches.values()) {
    if (r.intentOk && r.settlementOk) return true
  }
  return false
}

export function uploadReadinessSnapshot(request) {
  return {
    upload_first: isUploadFirstEnabled(),
    intent_ready_batch_ids: listIntentReadyBatchIds(request) ?? ['*'],
    settlement_ready_batch_ids: listSettlementReadyBatchIds(request) ?? ['*'],
    ready_batch_ids: listFullyReadyBatchIds(request) ?? ['*'],
    session_count: readinessBySession.size,
  }
}
