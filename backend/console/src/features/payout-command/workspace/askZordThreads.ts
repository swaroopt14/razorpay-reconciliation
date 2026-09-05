import type { AskZordArchivedTurn } from '../layout/AskZordPromptLayer'

export type AskZordThread = {
  id: string
  title: string
  updatedAt: number
  turns: AskZordArchivedTurn[]
}

const STORAGE_PREFIX = 'ask-zord-threads-v1'

function storageKey(tenantId: string) {
  return `${STORAGE_PREFIX}:${tenantId}`
}

export function loadAskZordThreads(tenantId: string): AskZordThread[] {
  if (typeof window === 'undefined' || !tenantId.trim()) return []
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as AskZordThread[]
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch {
    return []
  }
}

export function saveAskZordThreads(tenantId: string, threads: AskZordThread[]) {
  if (typeof window === 'undefined' || !tenantId.trim()) return
  window.localStorage.setItem(storageKey(tenantId), JSON.stringify(threads))
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
