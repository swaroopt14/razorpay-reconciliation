/**
 * Production-style readiness for the sandbox upload-first simulation.
 *
 * Stage gates (same batch id):
 *   intentOk      → Intent Journal, Control, Contract, Dispatch
 *   settlementOk  → Settlement Journal
 *   both          → Outcome, Gaps, Proof, full-loop metrics
 */

import { useEffect, useState } from 'react'
import { DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { scenarioScopedKey } from './scenarioMode'

/** Which upload stage a surface needs before showing fixture data. */
export type DemoBatchRequire = 'intent' | 'settlement' | 'both'

const DEMO_BATCH_READY_KEY = 'zord_demo_batch_ready'
const DEMO_BATCH_READY_EVENT = 'zord:demo-batch-ready'

export type DemoBatchReadiness = {
  batchId: string
  intentOk: boolean
  settlementOk: boolean
  updatedAt: string
}

function readRaw(): DemoBatchReadiness | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DEMO_BATCH_READY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoBatchReadiness
    if (!parsed?.batchId || typeof parsed.intentOk !== 'boolean' || typeof parsed.settlementOk !== 'boolean') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeRaw(next: DemoBatchReadiness) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DEMO_BATCH_READY_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_READY_EVENT, { detail: next }))
  } catch {
    /* ignore */
  }
}

/**
 * Clear ingest / dispatch / policy attachment so the workspace starts empty
 * until obligation + settlement files are uploaded again (upload-first).
 */
export function clearDemoIngestState() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(DEMO_BATCH_READY_KEY)
    sessionStorage.removeItem(DEMO_BATCH_DISPATCHED_KEY)
    sessionStorage.removeItem(scenarioScopedKey(DEMO_BATCH_POLICY_BASE))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_READY_EVENT, { detail: null }))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_DISPATCHED_EVENT, { detail: null }))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_POLICY_EVENT))
  } catch {
    /* ignore */
  }
}

export function markDemoIntentUploaded(batchId: string) {
  const id = batchId.trim()
  if (!id) return
  const prev = readRaw()
  writeRaw({
    batchId: id,
    intentOk: true,
    settlementOk: prev?.batchId === id ? prev.settlementOk : false,
    updatedAt: new Date().toISOString(),
  })
  try {
    sessionStorage.setItem('zord_demo_batch', id)
  } catch {
    /* ignore */
  }
}

export function markDemoSettlementUploaded(batchId: string) {
  const id = batchId.trim()
  if (!id) return
  const prev = readRaw()
  writeRaw({
    batchId: id,
    intentOk: prev?.batchId === id ? prev.intentOk : false,
    settlementOk: true,
    updatedAt: new Date().toISOString(),
  })
  try {
    sessionStorage.setItem('zord_demo_batch', id)
  } catch {
    /* ignore */
  }
}

const DEMO_BATCH_DISPATCHED_KEY = 'zord_demo_batch_dispatched'
const DEMO_BATCH_DISPATCHED_EVENT = 'zord:demo-batch-dispatched'

/** Marks a batch as dispatched from the Intent Journal - Dispatch & Relay stays empty until then. */
export function markBatchDispatched(batchId: string) {
  const id = batchId.trim()
  if (typeof window === 'undefined' || !id) return
  try {
    sessionStorage.setItem(DEMO_BATCH_DISPATCHED_KEY, id)
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_DISPATCHED_EVENT, { detail: id }))
  } catch {
    /* ignore */
  }
}

/** React hook - the demo batch is always treated as dispatched (hardcoded fixtures). */
export function useDispatchedBatchId(): string | null {
  return DEMO_SMOKE_BATCH_ID
}

const DEMO_BATCH_POLICY_BASE = 'zord_demo_batch_policy'
const DEMO_BATCH_POLICY_EVENT = 'zord:demo-batch-policy'

export type DemoBatchPolicyRecord = {
  batchId: string
  policyLabel: string
  packId?: string
  attachedAt?: string
}

/** Records the policy pack attached to a batch from Policy Studio. */
export function markBatchPolicyAttached(
  batchId: string,
  policyLabel: string,
  packId?: string,
) {
  if (typeof window === 'undefined' || !batchId.trim()) return
  try {
    const next: DemoBatchPolicyRecord = {
      batchId: batchId.trim(),
      policyLabel,
      packId: packId?.trim() || undefined,
      attachedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(scenarioScopedKey(DEMO_BATCH_POLICY_BASE), JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_POLICY_EVENT))
  } catch {
    /* ignore */
  }
}

/** Read the attached policy record (null if none). */
export function readBatchPolicyRecord(): DemoBatchPolicyRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(scenarioScopedKey(DEMO_BATCH_POLICY_BASE))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoBatchPolicyRecord
    if (!parsed?.batchId || !parsed?.policyLabel) return null
    return parsed
  } catch {
    return null
  }
}

/** React hook - label of the policy attached to the batch (null if none). */
export function useBatchPolicy(batchId?: string): string | null {
  const [record, setRecord] = useState<DemoBatchPolicyRecord | null>(() => readBatchPolicyRecord())

  useEffect(() => {
    const sync = () => {
      setRecord(readBatchPolicyRecord())
    }
    window.addEventListener(DEMO_BATCH_POLICY_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_POLICY_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!record) return null
  const checkId = batchId?.trim()
  return !checkId || record.batchId === checkId ? record.policyLabel : null
}

/** React hook - full attached-policy record for the batch (null if none). */
export function useBatchPolicyRecord(batchId?: string): DemoBatchPolicyRecord | null {
  const [record, setRecord] = useState<DemoBatchPolicyRecord | null>(() => readBatchPolicyRecord())

  useEffect(() => {
    const sync = () => {
      setRecord(readBatchPolicyRecord())
    }
    window.addEventListener(DEMO_BATCH_POLICY_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_POLICY_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!record) return null
  const checkId = batchId?.trim()
  return !checkId || record.batchId === checkId ? record : null
}

/** React hook - demo fixtures are always treated as dispatched. */
export function useBatchDispatched(_batchId?: string): boolean {
  return true
}

/**
 * React hook - hardcoded demo fixtures are always ready (no upload / ingest gate).
 */
export function useDemoBatchReady(
  batchId?: string,
  opts?: { requireUploads?: boolean; require?: DemoBatchRequire },
): {
  ready: boolean
  readiness: DemoBatchReadiness | null
  activeBatchId: string
  require: DemoBatchRequire
} {
  const require = opts?.require ?? 'both'
  const checkId = batchId?.trim() || DEMO_SMOKE_BATCH_ID
  const readiness: DemoBatchReadiness = {
    batchId: checkId,
    intentOk: true,
    settlementOk: true,
    updatedAt: '',
  }
  return { ready: true, readiness, activeBatchId: checkId, require }
}
