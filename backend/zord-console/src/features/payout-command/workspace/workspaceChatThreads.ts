import type { WorkspaceChatThread } from '@/services/payout-command/types'
import { isAskZordPersistApproved } from './payoutChatPersistence'

/** Legacy localStorage prefix — purged unless user explicitly opts into device persistence. */
const LOCAL_STORAGE_PREFIX = 'zord:workspace-threads:'
const SESSION_STORAGE_PREFIX = 'zord:workspace-threads-session:'

function localStorageKey(tenantId: string) {
  return `${LOCAL_STORAGE_PREFIX}${tenantId}`
}

function sessionStorageKey(tenantId: string) {
  return `${SESSION_STORAGE_PREFIX}${tenantId}`
}

function parseThreads(raw: string | null): WorkspaceChatThread[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as WorkspaceChatThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Copy session workspace threads into localStorage (all tenants). */
export function migrateSessionWorkspaceChatThreadsToLocal() {
  if (typeof window === 'undefined') return
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (!key || !key.startsWith(SESSION_STORAGE_PREFIX)) continue
      const tenantId = key.slice(SESSION_STORAGE_PREFIX.length)
      const raw = window.sessionStorage.getItem(key)
      if (raw) window.localStorage.setItem(localStorageKey(tenantId), raw)
    }
  } catch {
    /* ignore */
  }
}

/** Remove legacy/local workspace chat keys (all tenants). */
export function purgeLegacyLocalWorkspaceChatThreads() {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * CON-P1-12 — load workspace chat threads.
 * Default: sessionStorage only. Opt-in localStorage when Ask Zord persist is approved.
 */
export function loadWorkspaceChatThreads(tenantId: string): WorkspaceChatThread[] {
  if (typeof window === 'undefined' || !tenantId.trim()) return []

  if (!isAskZordPersistApproved()) {
    try {
      window.localStorage.removeItem(localStorageKey(tenantId))
    } catch {
      /* ignore */
    }
  }

  try {
    if (isAskZordPersistApproved()) {
      const fromLocal = parseThreads(window.localStorage.getItem(localStorageKey(tenantId)))
      if (fromLocal.length) return fromLocal
    }
    return parseThreads(window.sessionStorage.getItem(sessionStorageKey(tenantId)))
  } catch {
    return []
  }
}

export function saveWorkspaceChatThreads(tenantId: string, threads: WorkspaceChatThread[]) {
  if (typeof window === 'undefined' || !tenantId.trim()) return
  const payload = JSON.stringify(threads.slice(0, 40))
  try {
    window.sessionStorage.setItem(sessionStorageKey(tenantId), payload)
    if (isAskZordPersistApproved()) {
      window.localStorage.setItem(localStorageKey(tenantId), payload)
    } else {
      window.localStorage.removeItem(localStorageKey(tenantId))
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearWorkspaceChatThreadsForTenant(tenantId: string) {
  if (typeof window === 'undefined' || !tenantId.trim()) return
  try {
    window.sessionStorage.removeItem(sessionStorageKey(tenantId))
    window.localStorage.removeItem(localStorageKey(tenantId))
  } catch {
    /* ignore */
  }
}

/** Clear all workspace chat history from session storage (all tenants). */
export function clearAllSessionWorkspaceChatThreads() {
  if (typeof window === 'undefined') return
  try {
    const sessionKeys: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (key && key.startsWith(SESSION_STORAGE_PREFIX)) sessionKeys.push(key)
    }
    for (const key of sessionKeys) window.sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Clear all workspace chat history from session + local storage (all tenants). */
export function clearAllWorkspaceChatHistory() {
  if (typeof window === 'undefined') return
  purgeLegacyLocalWorkspaceChatThreads()
  clearAllSessionWorkspaceChatThreads()
}

/**
 * CON-P1-12 — on sign-out: always drop session chat memory.
 * Device-persisted copies remain only when the user explicitly opted in.
 */
export function clearWorkspaceChatHistoryOnSignOut() {
  if (typeof window === 'undefined') return
  clearAllSessionWorkspaceChatThreads()
  if (!isAskZordPersistApproved()) {
    purgeLegacyLocalWorkspaceChatThreads()
  }
}
