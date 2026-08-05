'use client'

/**
 * Seeded batches store — localStorage-backed list of sandbox-seeded batches
 * with cross-tab sync via the `storage` event.
 *
 * Why this exists: sandbox test flows produce a `TEST_*` batch
 * that the Intent Journal sidebar must show. Without this store, the journal
 * would only see the canned mocks. Persisting to localStorage means the
 * batch survives a refresh and propagates to other tabs that have the
 * journal open.
 */

import { useCallback, useEffect, useState } from 'react'
import { buildSeededBatchFromScenario } from './intent-journal-mocks'
import type { SeededBatch } from './intent-journal-types'
import { SANDBOX_SCENARIOS, type SandboxScenarioId } from './sandbox-data'

const STORAGE_KEY = 'zord:seeded-batches'
/** Same-tab + other-tab: `useSeededBatches` listens for this after local writes. */
export const SEEDED_BATCHES_CHANGED_EVENT = 'zord-seeded-batches-changed'

function loadFromStorage(): SeededBatch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as SeededBatch[]) : []
  } catch {
    return []
  }
}

function persistToStorage(batches: SeededBatch[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(batches))
  } catch {
    // Quota exceeded or privacy mode — silently ignore. Worst case the user
    // loses sandbox-seeded data on refresh.
  }
}

export function useSeededBatches() {
  const [hydrated, setHydrated] = useState(false)
  const [batches, setBatches] = useState<SeededBatch[]>([])

  // Hydrate once on mount.
  useEffect(() => {
    setBatches(loadFromStorage())
    setHydrated(true)
  }, [])

  // Cross-tab sync — when another tab writes to the same key, refresh ours.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setBatches(loadFromStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Same-tab: Batch Command Center prepends without going through React state first.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onCustom = () => setBatches(loadFromStorage())
    window.addEventListener(SEEDED_BATCHES_CHANGED_EVENT, onCustom)
    return () => window.removeEventListener(SEEDED_BATCHES_CHANGED_EVENT, onCustom)
  }, [])

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydrated) return
    persistToStorage(batches)
  }, [batches, hydrated])

  /**
   * Add a new seeded batch from a scenario. Returns the generated batchId so
   * the caller can navigate to it.
   */
  const addSeededBatch = useCallback((scenarioId: SandboxScenarioId): string => {
    const scenario = SANDBOX_SCENARIOS.find((s) => s.id === scenarioId)
    if (!scenario) throw new Error(`Unknown sandbox scenario: ${scenarioId}`)

    // Use the scenario's resultBatchId, but suffix with a counter if it already exists
    // so multiple runs of the same scenario don't collide.
    let batchId = scenario.resultBatchId
    let suffix = 2
    while (batches.some((b) => b.batchId === batchId)) {
      batchId = `${scenario.resultBatchId}-${suffix}`
      suffix += 1
    }

    const seeded = buildSeededBatchFromScenario(scenarioId, batchId, scenario.name)
    setBatches((prev) => [seeded, ...prev])
    return batchId
  }, [batches])

  const removeSeededBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId))
  }, [])

  const clearAll = useCallback(() => {
    setBatches([])
  }, [])

  return {
    seededBatches: batches,
    addSeededBatch,
    removeSeededBatch,
    clearAll,
    hydrated,
  }
}

/**
 * Push a batch from Bulk Command Center (or any caller) into the journal store.
 * Replaces an existing entry with the same `batchId`. Fires
 * {@link SEEDED_BATCHES_CHANGED_EVENT} so the Intent Journal updates in the same tab.
 */
export function persistSeededBatchPrepend(batch: SeededBatch): void {
  if (typeof window === 'undefined') return
  try {
    const prev = loadFromStorage()
    const withoutDup = prev.filter((b) => b.batchId !== batch.batchId)
    const next = [batch, ...withoutDup]
    persistToStorage(next)
    window.dispatchEvent(new CustomEvent(SEEDED_BATCHES_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/**
 * Standalone helper to look up a seeded batch by ID without mounting the hook.
 * Useful for short-lived component lookups (e.g. resolving `?batch=` URL param).
 */
export function findSeededBatch(batchId: string): SeededBatch | null {
  return loadFromStorage().find((b) => b.batchId === batchId) ?? null
}
