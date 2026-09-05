/**
 * Production-style readiness for the sandbox upload-first simulation.
 *
 * Stage gates (same batch id):
 *   intentOk      → Intent Journal, Control, Contract, Dispatch
 *   settlementOk  → Settlement Journal
 *   both          → Outcome, Gaps, Proof, full-loop metrics
 */

import { useEffect, useState } from 'react'
import { DEMO_SMOKE_BATCH_ID, getActiveDemoBatchId } from './ycDemoConstants'
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

/** React hook - the batch id that was dispatched from the Intent Journal (null if none yet). */
export function useDispatchedBatchId(): string | null {
  const [dispatchedId, setDispatchedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    const sync = () => {
      try {
        setDispatchedId(sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY))
      } catch {
        setDispatchedId(null)
      }
    }
    window.addEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DEMO_BATCH_DISPATCHED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return dispatchedId
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

/** React hook - true once the batch was dispatched from the Intent Journal. */
export function useBatchDispatched(batchId?: string): boolean {
  const [dispatchedId, setDispatchedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    const sync = () => {
      try {
        setDispatchedId(sessionStorage.getItem(DEMO_BATCH_DISPATCHED_KEY))
      } catch {
        setDispatchedId(null)
      }
    }
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

function stageReady(
  readiness: DemoBatchReadiness | null,
  checkId: string,
  require: DemoBatchRequire,
): boolean {
  if (!readiness || (checkId && readiness.batchId !== checkId)) return false
  if (require === 'intent') return Boolean(readiness.intentOk)
  if (require === 'settlement') return Boolean(readiness.settlementOk)
  return Boolean(readiness.intentOk && readiness.settlementOk)
}

type ServerIngestFlags = {
  intentOk: boolean | null
  settlementOk: boolean | null
  checked: boolean
}

async function fetchServerIngest(): Promise<{ intentOk: boolean; settlementOk: boolean } | null> {
  try {
    const res = await fetch('/api/prod/ingest-status', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as {
      sources?: Array<{ id?: string; status?: string }>
    }
    const sources = Array.isArray(data?.sources) ? data.sources : []
    const intent = sources.find((s) => s.id === 'intent_file')
    const settlement = sources.find((s) => s.id === 'settlement_file')
    return {
      intentOk: intent?.status === 'received',
      settlementOk: settlement?.status === 'received',
    }
  } catch {
    return null
  }
}

function mergeReadiness(
  local: DemoBatchReadiness | null,
  server: ServerIngestFlags,
  fallbackBatchId: string,
): DemoBatchReadiness | null {
  // Local session flags (set by markDemo*Uploaded in the browser) are the
  // primary signal — they represent the user's explicit upload action in
  // the current session.  Server positive confirmation strengthens that;
  // server absence (null = probe failed) or negative (false = not yet
  // visible upstream) must NOT override a fresh local upload flag.
  //
  // This OR-logic prevents three common failure modes:
  //  1. Server probe fails (401 / network) — local still unlocks the gate.
  //  2. Upstream hasn't finished processing — local unlocks immediately.
  //  3. Multi-tenant cookie collision — only the local tenant's flag
  //     applies because keys are now tenant-scoped.
  const intentOk = Boolean(local?.intentOk) || server.intentOk === true
  const settlementOk = Boolean(local?.settlementOk) || server.settlementOk === true
  if (!intentOk && !settlementOk && !local) return null
  return {
    batchId: fallbackBatchId,
    intentOk,
    settlementOk,
    updatedAt: local?.updatedAt || '',
  }
}

/**
 * React hook - re-renders when uploads complete.
 * Defaults to the active demo batch when checking readiness.
 *
 * Pass `require: 'intent' | 'settlement' | 'both'` (default `'both'`) for stage gates.
 * Pass `{ requireUploads: false }` to skip the gate (e.g. live mode with API data).
 *
 * Server ingest-status wins when it reports a file missing — leftover
 * sessionStorage from a previous demo must not fill Dispatch / Trace /
 * Control plane while Intent Journal is still empty.
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
  const requireUploads = opts?.requireUploads !== false
  const require = opts?.require ?? 'both'
  const [local, setLocal] = useState<DemoBatchReadiness | null>(() => readRaw())
  const [server, setServer] = useState<ServerIngestFlags>({
    intentOk: null,
    settlementOk: null,
    checked: false,
  })
  const [activeBatchId, setActiveBatchId] = useState(DEMO_SMOKE_BATCH_ID)
  const [hydrated, setHydrated] = useState(() => typeof window !== 'undefined')

  useEffect(() => {
    let cancelled = false

    const pullServer = () => {
      void fetchServerIngest().then((result) => {
        if (cancelled) return
        if (!result) {
          setServer((prev) => ({ ...prev, checked: true }))
          return
        }
        setServer({
          intentOk: result.intentOk,
          settlementOk: result.settlementOk,
          checked: true,
        })
      })
    }

    const syncLocal = () => {
      setLocal(readRaw())
      setActiveBatchId(batchId?.trim() || getActiveDemoBatchId())
      pullServer()
    }

    syncLocal()
    window.addEventListener(DEMO_BATCH_READY_EVENT, syncLocal)
    window.addEventListener('storage', syncLocal)
    return () => {
      cancelled = true
      window.removeEventListener(DEMO_BATCH_READY_EVENT, syncLocal)
      window.removeEventListener('storage', syncLocal)
    }
  }, [batchId])

  // NOTE: The cleanup effect that used to clear local flags based on
  // server probe responses has been removed.  It caused a destructive
  // cascade: markDemo*Uploaded sets intentOk/settlementOk = true in
  // sessionStorage, the server probe returns false (data not yet
  // processed or upstream not reachable), and the effect immediately
  // overwrites the fresh upload flag back to false — undoing the upload.
  //
  // The OR-logic in mergeReadiness already handles all cases:
  //  - Fresh upload: local=true  → intentOk/settlementOk = true
  //  - Server confirms: server=true  → adds confirmation
  //  - Stale session, no server data: local=true still shows
  //  - No upload ever: local=null, server=false → stays hidden

  const checkId = batchId?.trim() || activeBatchId
  const readiness = mergeReadiness(local, server, checkId)
  // When the user just uploaded a file, the local session flag is already
  // set — don't block readiness on the (asynchronous) server probe.
  const hasLocalUpload = Boolean(local?.intentOk) || Boolean(local?.settlementOk)
  const uploadsReady = (server.checked || hasLocalUpload) && stageReady(readiness, checkId, require)
  const ready = hydrated && (requireUploads ? uploadsReady : true)

  return { ready, readiness, activeBatchId: checkId, require }
}
