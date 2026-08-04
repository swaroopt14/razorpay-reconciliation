/**
 * Production-style readiness: journals / overview fixtures stay empty until
 * both obligation (intent) upload and settlement upload succeed for a batch.
 */

import { useEffect, useState } from 'react'
import { DEMO_SMOKE_BATCH_ID, getActiveDemoBatchId } from './ycDemoConstants'

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

/** React hook - the batch id that was dispatched from the Intent Journal (null if none yet). */
export function useDispatchedBatchId(): string | null {
  const [dispatchedId, setDispatchedId] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      try {
        setDispatchedId(sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY))
      } catch {
        setDispatchedId(null)
      }
    }
    sync()
    window.addEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return dispatchedId
}

const DEMO_BATCH_POLICY_KEY = 'zord_demo_batch_policy'
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
    sessionStorage.setItem(DEMO_BATCH_POLICY_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(DEMO_BATCH_POLICY_EVENT))
  } catch {
    /* ignore */
  }
}

/** Read the attached policy record (null if none). */
export function readBatchPolicyRecord(): DemoBatchPolicyRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DEMO_BATCH_POLICY_KEY)
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
  const [record, setRecord] = useState<DemoBatchPolicyRecord | null>(null)

  useEffect(() => {
    const sync = () => {
      setRecord(readBatchPolicyRecord())
    }
    sync()
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
  const [record, setRecord] = useState<DemoBatchPolicyRecord | null>(null)

  useEffect(() => {
    const sync = () => {
      setRecord(readBatchPolicyRecord())
    }
    sync()
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

/** React hook - true once the batch was dispatched from the Intent Journal. */
export function useBatchDispatched(batchId?: string): boolean {
  const [dispatchedId, setDispatchedId] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => {
      try {
        setDispatchedId(sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY))
      } catch {
        setDispatchedId(null)
      }
    }
    sync()
    window.addEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!dispatchedId) return false
  const checkId = batchId?.trim()
  return !checkId || dispatchedId === checkId
}

/**
 * React hook - re-renders when uploads complete.
 * Defaults to the active demo batch when checking readiness.
 *
 * `ready` is true only after both obligation + settlement uploads for the batch.
 * Pass `{ requireUploads: false }` to skip the gate (e.g. live mode with API data).
 */
export function useDemoBatchReady(
  batchId?: string,
  opts?: { requireUploads?: boolean },
): {
  ready: boolean
  readiness: DemoBatchReadiness | null
  activeBatchId: string
} {
  const requireUploads = opts?.requireUploads !== false
  const [readiness, setReadiness] = useState<DemoBatchReadiness | null>(null)
  const [activeBatchId, setActiveBatchId] = useState(DEMO_SMOKE_BATCH_ID)

  useEffect(() => {
    const sync = () => {
      setReadiness(readRaw())
      setActiveBatchId(batchId?.trim() || getActiveDemoBatchId())
    }
    sync()
    window.addEventListener(DEMO_BATCH_READY_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_READY_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [batchId])

  const checkId = batchId?.trim() || activeBatchId
  const uploadsReady = Boolean(
    readiness?.intentOk &&
      readiness?.settlementOk &&
      (!checkId || readiness.batchId === checkId),
  )
  const ready = requireUploads ? uploadsReady : true

  return { ready, readiness, activeBatchId: checkId }
}
