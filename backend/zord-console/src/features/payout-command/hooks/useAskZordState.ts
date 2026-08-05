'use client'
import { useAuth } from '@/app/hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  mapPromptLayerAnswer,
  postPromptLayerQuery,
  sessionTenantForPromptLayer,
} from '@/services/payout-command/prompt-layer/postPromptLayerQuery'
import type { AskZordResponse } from '@/services/payout-command/types'
import type { HomeCommandStatus } from '@/services/payout-command/model'
import type { AskZordArchivedTurn } from '../layout/AskZordPromptLayer'
import {
  buildThreadSnapshot,
  loadAskZordThreads,
  saveAskZordThreads,
  type AskZordThread,
} from '../workspace/askZordThreads'
import {
  clearAskZordSelectedContext,
  readAskZordSelectedContext,
  toPromptLayerUIContext,
  type AskZordSelectedContext,
} from '../workspace/askZordSelectedContext'
export const ASK_ZORD_QUICK_PROMPTS = [
  'Where are delays occurring?',
  'What is the total value awaiting confirmation?',
  'Which disbursements are still pending?',
  'Which transactions need manual review?',
] as const

export type AskZordState = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  input: string
  setInput: (value: string) => void
  status: HomeCommandStatus
  response: AskZordResponse | null
  lastUserPrompt: string | null
  archivedTurns: AskZordArchivedTurn[]
  threads: AskZordThread[]
  activeThreadId: string | null
  startNewThread: () => void
  selectedContext: AskZordSelectedContext | null
  clearSelectedContext: () => void
  selectThread: (id: string) => void
  run: (prompt: string) => void
  dismissResponse: () => void
}

function upsertThread(threads: AskZordThread[], snapshot: AskZordThread): AskZordThread[] {
  const rest = threads.filter((t) => t.id !== snapshot.id)
  return [snapshot, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function useAskZordState(_activeSurfaceTitle: string): AskZordState {
  const { tenantId, tenantReady } = useSessionTenant()
  const { user, isLoading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<HomeCommandStatus>('idle')
  const [pendingResponse, setPendingResponse] = useState<AskZordResponse | null>(null)
  const [response, setResponse] = useState<AskZordResponse | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState<string | null>(null)
  const [archivedTurns, setArchivedTurns] = useState<AskZordArchivedTurn[]>([])
  const [threads, setThreads] = useState<AskZordThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const activeThreadIdRef = useRef<string | null>(null)
  const [selectedContext, setSelectedContext] = useState<AskZordSelectedContext | null>(null)

  useEffect(() => {
    setSelectedContext(readAskZordSelectedContext(searchParams))
  }, [searchParams])
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  useEffect(() => {
    if (!tenantReady || !tenantId?.trim()) {
      setThreads([])
      return
    }
    setThreads(loadAskZordThreads(tenantId))
  }, [tenantId, tenantReady])

  const persistThreads = useCallback(
    (next: AskZordThread[]) => {
      setThreads(next)
      if (tenantId?.trim()) saveAskZordThreads(tenantId, next)
    },
    [tenantId],
  )

  const snapshotActiveThread = useCallback(
    (complete: boolean) => {
      const threadId = activeThreadIdRef.current ?? crypto.randomUUID()
      const snapshot = buildThreadSnapshot({
        id: threadId,
        turns: archivedTurns,
        lastUserPrompt,
        responseTitle: response?.title ?? null,
        responseBody: response?.body ?? null,
        complete,
      })
      if (!snapshot) return null
      persistThreads(upsertThread(threads, snapshot))
      if (!activeThreadIdRef.current) setActiveThreadId(threadId)
      return snapshot
    },
    [archivedTurns, lastUserPrompt, persistThreads, response, threads],
  )

  useEffect(() => {
    if (!pendingResponse) return

    setStatus('loading')
    setResponse({ title: pendingResponse.title, body: '' })
    let typingTimer: number | undefined

    const loadingTimer = window.setTimeout(() => {
      setStatus('typing')
      let index = 0
      const target = pendingResponse.body

      typingTimer = window.setInterval(() => {
        index += 5
        setResponse({ title: pendingResponse.title, body: target.slice(0, index) })

        if (index >= target.length) {
          window.clearInterval(typingTimer)
          setStatus('complete')
          setPendingResponse(null)
        }
      }, 18)
    }, 280)

    return () => {
      window.clearTimeout(loadingTimer)
      if (typingTimer) window.clearInterval(typingTimer)
    }
  }, [pendingResponse])

  useEffect(() => {
    if (status !== 'complete' || !lastUserPrompt || !response?.body.trim()) return
    const threadId = activeThreadIdRef.current ?? crypto.randomUUID()
    const snapshot = buildThreadSnapshot({
      id: threadId,
      turns: archivedTurns,
      lastUserPrompt,
      responseTitle: response.title,
      responseBody: response.body,
      complete: true,
    })
    if (!snapshot) return
    setThreads((prev) => {
      const next = upsertThread(prev, snapshot)
      if (tenantId?.trim()) saveAskZordThreads(tenantId, next)
      return next
    })
    if (!activeThreadIdRef.current) setActiveThreadId(threadId)
    setArchivedTurns(snapshot.turns)
    setLastUserPrompt(null)
    setResponse(null)
    setStatus('idle')
  }, [status, lastUserPrompt, response, archivedTurns, tenantId])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((current) => !current), [])
  const clearSelectedContext = useCallback(() => {
    clearAskZordSelectedContext()
    setSelectedContext(null)
  }, [])
    const startNewThread = useCallback(() => {
    snapshotActiveThread(true)
    clearSelectedContext()
    setArchivedTurns([])
    setLastUserPrompt(null)
    setResponse(null)
    setInput('')
    setStatus('idle')
    setPendingResponse(null)
    setActiveThreadId(null)
    activeThreadIdRef.current = null
  }, [clearSelectedContext, snapshotActiveThread])

  const selectThread = useCallback(
    (id: string) => {
      snapshotActiveThread(true)
      const thread = threads.find((t) => t.id === id)
      if (!thread) return
      setActiveThreadId(thread.id)
      setArchivedTurns(thread.turns)
      setLastUserPrompt(null)
      setResponse(null)
      setInput('')
      setStatus('idle')
      setPendingResponse(null)
    },
    [snapshotActiveThread, threads],
  )

  const run = useCallback(
    (rawPrompt: string) => {
      const cleaned = rawPrompt.trim()
      if (!cleaned) return

      if (lastUserPrompt && response && status === 'complete' && response.body.trim()) {
        setArchivedTurns((turns) => [
          ...turns,
          { user: lastUserPrompt, title: response.title, body: response.body },
        ])
      }

      const threadId = activeThreadIdRef.current ?? crypto.randomUUID()
if (!activeThreadIdRef.current) {
  activeThreadIdRef.current = threadId
  setActiveThreadId(threadId)
}

setInput('')
setLastUserPrompt(cleaned)

      const tenantGate = sessionTenantForPromptLayer(tenantId, tenantReady)
      if (!tenantGate.ok) {
        setPendingResponse({ title: tenantGate.title, body: tenantGate.body })
        return
      }

      const userId = user?.id?.trim()
      if (authLoading) {
        setPendingResponse({
          title: 'Waiting for auth',
          body: 'Confirming your signed-in session. Please wait a moment and try Ask Zord again.',
        })
        return
      }

      if (!userId) {
        setPendingResponse({
          title: 'User context required',
          body: 'Ask Zord needs the signed-in user identity from your session. Please refresh the page or sign in again.',
        })
        return
      }

      setStatus('loading')
      setResponse({
        title: 'Ask Zord',
        body: "Searching your workspace's payment data…",
      })

      void (async () => {
        const result = await postPromptLayerQuery(
          {
            query: cleaned,
            top_k: 6,
            ui_context: toPromptLayerUIContext(selectedContext),
          },
          {
            tenantId: tenantGate.tenantId,
            sessionId: threadId,
            userId,
          },
        )

        const mapped = mapPromptLayerAnswer(result.payload, 'Ask Zord')
        if (result.ok && mapped) {
          setPendingResponse(mapped)
          return
        }

        const detail =
          typeof result.payload === 'object' &&
            result.payload &&
            'details' in result.payload &&
            typeof (result.payload as { details?: string }).details === 'string'
            ? (result.payload as { details: string }).details
            : result.ok
              ? 'Ask Zord returned an empty answer.'
              : `HTTP ${result.httpStatus}`

        setPendingResponse({
          title: 'Ask Zord unavailable',
          body: `Could not complete your request (${detail}). Try again in a moment.`,
        })
      })()
    },
    [authLoading, lastUserPrompt, response, selectedContext, status, tenantId, tenantReady, user?.id],
  )

  const dismissResponse = useCallback(() => {
    setStatus('idle')
    setPendingResponse(null)
    setResponse(null)
  }, [])

  return {
    isOpen,
    open,
    close,
    toggle,
    input,
    setInput,
    status,
    response,
    lastUserPrompt,
    archivedTurns,
    threads,
    activeThreadId,
    selectedContext,
    clearSelectedContext,
    startNewThread,
    selectThread,
    run,
    dismissResponse,
  }
}
