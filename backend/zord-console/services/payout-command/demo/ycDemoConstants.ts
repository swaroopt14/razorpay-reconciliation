/** Minimal demo batch helpers used by Create Payout / journal readiness. */

export const DEMO_SMOKE_BATCH_ID = 'batch-001'
export const DEMO_BATCH_STORAGE_KEY = 'zord_demo_batch'

/** Resolve active batch: URL → session → default fixture id. */
export function getActiveDemoBatchId(): string {
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search)
      const fromUrl = q.get('batch_id')?.trim() || q.get('client_batch_id')?.trim()
      if (fromUrl) {
        sessionStorage.setItem(DEMO_BATCH_STORAGE_KEY, fromUrl)
        return fromUrl
      }
      const stored = sessionStorage.getItem(DEMO_BATCH_STORAGE_KEY)?.trim()
      if (stored) return stored
    } catch {
      /* ignore */
    }
  }
  return DEMO_SMOKE_BATCH_ID
}

export function setActiveDemoBatchId(batchId: string) {
  const id = batchId.trim()
  if (!id || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DEMO_BATCH_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
