/**
 * Upload-first gate — scoped per tenant (stable across token refresh / re-login).
 * Persisted to disk so Docker rebuilds and page revisits keep uploaded batches.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.SMOKE_DATA_DIR?.trim() || join(__dirname, '..', 'data')
const STORE_PATH = join(DATA_DIR, 'upload-readiness.json')

/** @type {Map<string, Map<string, { intentOk: boolean, settlementOk: boolean, updatedAt: string }>>} */
const readinessBySession = new Map()

function ensureLoaded() {
  if (ensureLoaded.done) return
  ensureLoaded.done = true
  try {
    if (!existsSync(STORE_PATH)) return
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    if (!raw || typeof raw !== 'object') return
    for (const [session, batches] of Object.entries(raw)) {
      if (!batches || typeof batches !== 'object') continue
      const map = new Map()
      for (const [batchId, row] of Object.entries(batches)) {
        map.set(batchId, {
          intentOk: Boolean(row?.intentOk),
          settlementOk: Boolean(row?.settlementOk),
          updatedAt: String(row?.updatedAt || ''),
        })
      }
      readinessBySession.set(session, map)
    }
  } catch {
    /* ignore corrupt store */
  }
}
ensureLoaded.done = false

function persist() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    const out = {}
    for (const [session, batches] of readinessBySession.entries()) {
      out[session] = Object.fromEntries(batches.entries())
    }
    writeFileSync(STORE_PATH, JSON.stringify(out, null, 2))
  } catch {
    /* best-effort for smoke demo */
  }
}

/** Prefer tenant id (stable) over bearer token (rotates on refresh/login). */
function normalizeTenantId(raw) {
  const first = String(raw || '')
    .split(',')[0]
    ?.trim()
  return first || ''
}

function sessionKey(request) {
  if (!request) return '__default__'
  const tenantHeader = normalizeTenantId(
    request.headers?.get?.('x-tenant-id') ||
      request.headers?.get?.('tenant-id') ||
      request.headers?.get?.('X-Tenant-Id') ||
      '',
  )
  if (tenantHeader) return `tenant:${tenantHeader}`

  try {
    const href = typeof request.url === 'string' ? request.url : ''
    if (href) {
      const tid = normalizeTenantId(new URL(href, 'http://localhost').searchParams.get('tenant_id'))
      if (tid) return `tenant:${tid}`
    }
  } catch {
    /* ignore bad url */
  }

  const auth = request.headers?.get?.('authorization') ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  if (token) return `token:${token}`
  return '__default__'
}

export function isUploadFirstEnabled() {
  const preseed = (process.env.SMOKE_PRESEED_DATA ?? '').trim().toLowerCase()
  if (preseed === '1' || preseed === 'true' || preseed === 'yes') return false
  const flag = (process.env.SMOKE_UPLOAD_FIRST ?? '1').trim().toLowerCase()
  return !(flag === '0' || flag === 'false' || flag === 'no')
}

export function resetUploadReadiness(request) {
  ensureLoaded()
  if (!request) {
    readinessBySession.clear()
    persist()
    return
  }
  const key = sessionKey(request)
  readinessBySession.delete(key)
  persist()
}

function touch(batchId, patch, request) {
  ensureLoaded()
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
  persist()
  return next
}

export function markIntentUploaded(batchId, request) {
  return touch(batchId, { intentOk: true }, request)
}

export function markSettlementUploaded(batchId, request) {
  return touch(batchId, { settlementOk: true }, request)
}

export function getBatchReadiness(batchId, request) {
  ensureLoaded()
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
  ensureLoaded()
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
  ensureLoaded()
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return false
  for (const r of batches.values()) {
    if (r.intentOk) return true
  }
  return false
}

export function hasIngestedSettlementFile(request) {
  ensureLoaded()
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
  ensureLoaded()
  const key = sessionKey(request)
  const batches = readinessBySession.get(key)
  if (!batches) return false
  for (const r of batches.values()) {
    if (r.intentOk && r.settlementOk) return true
  }
  return false
}

export function uploadReadinessSnapshot(request) {
  ensureLoaded()
  return {
    upload_first: isUploadFirstEnabled(),
    intent_ready_batch_ids: listIntentReadyBatchIds(request) ?? ['*'],
    settlement_ready_batch_ids: listSettlementReadyBatchIds(request) ?? ['*'],
    ready_batch_ids: listFullyReadyBatchIds(request) ?? ['*'],
    session_count: readinessBySession.size,
    persist_path: STORE_PATH,
  }
}

/** Seed Batch 001 for known demo tenants so Transactions always has the 100-payout spine. */
export function seedDemoBatchReadiness(tenantIds = []) {
  ensureLoaded()
  const ids = Array.isArray(tenantIds) && tenantIds.length > 0
    ? tenantIds
    : [
        '00000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ]
  let changed = false
  for (const tenant of ids) {
    const key = `tenant:${tenant}`
    if (!readinessBySession.has(key)) readinessBySession.set(key, new Map())
    const batches = readinessBySession.get(key)
    const prev = batches.get('batch-001')
    if (!prev?.intentOk) {
      batches.set('batch-001', {
        intentOk: true,
        settlementOk: prev?.settlementOk ?? true,
        updatedAt: new Date().toISOString(),
      })
      changed = true
    } else if (prev && prev.settlementOk !== true) {
      // Keep intent; ensure settlement unlocked for demo KPIs that need both.
      batches.set('batch-001', { ...prev, settlementOk: true, updatedAt: new Date().toISOString() })
      changed = true
    }
  }
  if (changed) persist()
}
