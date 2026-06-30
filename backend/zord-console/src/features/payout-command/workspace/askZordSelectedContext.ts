'use client'
import type { PromptLayerUIContext } from '@/services/payout-command/prompt-layer/postPromptLayerQuery'

export const ASK_ZORD_SELECTED_CONTEXT_STORAGE_KEY = 'zord:ask:selected-context'

type SearchParamsLike = {
  get: (name: string) => string | null
}

export type AskZordSelectedContext = {
  scope: string
  scopeLevel: 'tenant' | 'batch'
  sourcePage: string
  sectionTitle: string
  selectedTitle: string
  selectedDescription?: string
  selectedMetrics?: Array<{ label: string; value: string }>
  batchId?: string
}

export function storeAskZordSelectedContext(context: AskZordSelectedContext) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(ASK_ZORD_SELECTED_CONTEXT_STORAGE_KEY, JSON.stringify(context))
}
export function clearAskZordSelectedContext() {
  if (typeof window === 'undefined') return

  window.sessionStorage.removeItem(ASK_ZORD_SELECTED_CONTEXT_STORAGE_KEY)

  const url = new URL(window.location.href)
  url.searchParams.delete('ask_scope')
  url.searchParams.delete('source_page')
  url.searchParams.delete('batch_id')
  url.searchParams.set('dock', 'workspace')

  window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}`)
}
export function readAskZordSelectedContext(searchParams?: SearchParamsLike | null): AskZordSelectedContext | null {
  if (typeof window === 'undefined') return null

  const hasSelectedScope = Boolean(searchParams?.get('ask_scope')?.trim())
  if (!hasSelectedScope) {
    window.sessionStorage.removeItem(ASK_ZORD_SELECTED_CONTEXT_STORAGE_KEY)
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(ASK_ZORD_SELECTED_CONTEXT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as AskZordSelectedContext
    if (!parsed?.scope || !parsed?.selectedTitle) return null

    return parsed
  } catch {
    return null
  }
}

export function buildAskZordWorkspaceHref(context: AskZordSelectedContext) {
  const params = new URLSearchParams()
  params.set('dock', 'workspace')
  params.set('ask_scope', context.scope)
  params.set('source_page', context.sourcePage)

  if (context.batchId) {
    params.set('batch_id', context.batchId)
  }

  return `/payout-command-view/today?${params.toString()}`
}

export function toPromptLayerUIContext(context: AskZordSelectedContext | null): PromptLayerUIContext | undefined {
  if (!context) return undefined

  return {
    scope: context.scope,
    scope_level: context.scopeLevel,
    source_page: context.sourcePage,
    section_title: context.sectionTitle,
    selected_title: context.selectedTitle,
    selected_description: context.selectedDescription,
    selected_metrics: context.selectedMetrics,
    batch_id: context.batchId,
  }
}
