import type { AskZordArchivedTurn } from '../layout/AskZordPromptLayer'
import {
  ASK_ZORD_PERSIST_OPT_IN_KEY,
  isAskZordPersistApproved,
  setAskZordPersistApprovedFlag,
} from './payoutChatPersistence'
import {
  migrateSessionWorkspaceChatThreadsToLocal,
  purgeLegacyLocalWorkspaceChatThreads,
} from './workspaceChatThreads'

export type AskZordThread = {
  id: string
  title: string
  updatedAt: number
  turns: AskZordArchivedTurn[]
}

export { ASK_ZORD_PERSIST_OPT_IN_KEY, isAskZordPersistApproved }

/** Legacy localStorage prefix — purged unless user explicitly opts into device persistence. */
const LOCAL_STORAGE_PREFIX = 'ask-zord-threads-v1'
const SESSION_STORAGE_PREFIX = 'ask-zord-threads-session-v1'

function localStorageKey(tenantId: string) {
  return `${LOCAL_STORAGE_PREFIX}:${tenantId}`
}

function sessionStorageKey(tenantId: string) {
  return `${SESSION_STORAGE_PREFIX}:${tenantId}`
}

/** Copy session Ask Zord threads into localStorage (all tenants). */
function migrateSessionAskZordThreadsToLocal() {
  if (typeof window === 'undefined') return
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (!key || !key.startsWith(`${SESSION_STORAGE_PREFIX}:`)) continue
      const tenantId = key.slice(`${SESSION_STORAGE_PREFIX}:`.length)
      const raw = window.sessionStorage.getItem(key)
      if (raw) window.localStorage.setItem(localStorageKey(tenantId), raw)
    }
  } catch {
    /* ignore */
  }
}

export function setAskZordPersistApproved(enabled: boolean) {
  setAskZordPersistApprovedFlag(enabled)
  if (enabled) {
    migrateSessionAskZordThreadsToLocal()
    migrateSessionWorkspaceChatThreadsToLocal()
  } else {
    purgeLegacyLocalAskZordThreads()
    purgeLegacyLocalWorkspaceChatThreads()
  }
}

/** Remove legacy/local Ask Zord chat keys (all tenants). */
export function purgeLegacyLocalAskZordThreads() {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(`${LOCAL_STORAGE_PREFIX}:`)) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function parseThreads(raw: string | null): AskZordThread[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as AskZordThread[]
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch {
    return []
  }
}

/**
 * CON-P1-12 — load Ask Zord threads.
 * Default: sessionStorage only (cleared on browser restart / new session).
 * Opt-in: localStorage when `ask-zord-persist-approved` is set.
 */
export function loadAskZordThreads(tenantId: string): AskZordThread[] {
  if (typeof window === 'undefined' || !tenantId.trim()) return []

  // Always strip legacy local copies when persistence is not approved.
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

export function saveAskZordThreads(tenantId: string, threads: AskZordThread[]) {
  if (typeof window === 'undefined' || !tenantId.trim()) return
  const payload = JSON.stringify(threads)
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

export function clearAskZordThreadsForTenant(tenantId: string) {
  if (typeof window === 'undefined' || !tenantId.trim()) return
  try {
    window.sessionStorage.removeItem(sessionStorageKey(tenantId))
    window.localStorage.removeItem(localStorageKey(tenantId))
  } catch {
    /* ignore */
  }
}

/** Clear Ask Zord session chat history (all tenants). */
export function clearAllSessionAskZordThreads() {
  if (typeof window === 'undefined') return
  try {
    const sessionKeys: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (key && key.startsWith(`${SESSION_STORAGE_PREFIX}:`)) sessionKeys.push(key)
    }
    for (const key of sessionKeys) window.sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Clear all Ask Zord chat history from session + local storage (all tenants). */
export function clearAllAskZordChatHistory() {
  if (typeof window === 'undefined') return
  purgeLegacyLocalAskZordThreads()
  clearAllSessionAskZordThreads()
}

/**
 * CON-P1-12 — on sign-out: always drop session chat memory.
 * Device-persisted copies remain only when the user explicitly opted in.
 */
export function clearAskZordChatHistoryOnSignOut() {
  if (typeof window === 'undefined') return
  clearAllSessionAskZordThreads()
  if (!isAskZordPersistApproved()) {
    purgeLegacyLocalAskZordThreads()
  }
}

export function threadTitleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return 'New chat'
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed
}

export function buildThreadSnapshot(params: {
  id: string
  turns: AskZordArchivedTurn[]
  lastUserPrompt: string | null
  responseTitle: string | null
  responseBody: string | null
  complete: boolean
}): AskZordThread | null {
  const turns = [...params.turns]
  if (params.complete && params.lastUserPrompt && params.responseBody?.trim()) {
    turns.push({
      user: params.lastUserPrompt,
      title: params.responseTitle ?? 'Ask Zord',
      body: params.responseBody,
    })
  }
  if (turns.length === 0) return null
  const firstPrompt = turns[0]?.user ?? 'New chat'
  return {
    id: params.id,
    title: threadTitleFromPrompt(firstPrompt),
    updatedAt: Date.now(),
    turns,
  }
}
