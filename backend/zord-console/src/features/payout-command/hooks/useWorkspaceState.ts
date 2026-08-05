'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/hooks'
import { workspacePromptCopy, type WorkspaceTab } from '@/services/payout-command/model'
import {
  mapPromptLayerAnswer,
  postPromptLayerQuery,
  sessionTenantForPromptLayer,
} from '@/services/payout-command/prompt-layer/postPromptLayerQuery'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import type {
  PromptLayerCitation,
  WorkspaceChatThread,
  WorkspaceConversationMessage,
  WorkspaceLoadingPhase,
  WorkspaceLiveAnswer,
} from '@/services/payout-command/types'

const WORKSPACE_LIVE_ANSWER_TITLE = 'Zord'
const THREADS_STORAGE_PREFIX = 'zord:workspace-threads:'

const LOADING_PHASES: WorkspaceLoadingPhase[] = [
  'understanding',
  'fetching',
  'listing',
  'checking',
  'summarizing',
]

const LOADING_PHASE_LABEL: Record<WorkspaceLoadingPhase, string> = {
  understanding: 'Understanding your question…',
  fetching: "Searching your workspace's payment data…",
  listing: 'Listing related payout records…',
  checking: 'Checking signals and posture…',
  summarizing: 'Summarizing answer…',
}

function formatChatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function newThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
function newSessionId() {
  return crypto.randomUUID()
}
function threadTitleFromPrompt(prompt: string) {
  const t = prompt.trim()
  if (t.length <= 48) return t
  return `${t.slice(0, 45)}…`
}

function loadThreads(storageKey: string): WorkspaceChatThread[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorkspaceChatThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveThreads(storageKey: string, threads: WorkspaceChatThread[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(threads.slice(0, 40)))
  } catch {
    /* quota */
  }
}

function welcomeMessages(tab: WorkspaceTab): WorkspaceConversationMessage[] {
  const copy = workspacePromptCopy[tab]
  const ts = formatChatTimestamp()
  return [
    {
      id: `${tab}-welcome`,
      role: 'assistant',
      body: `${copy.question}\n\n${copy.supporting}`,
      timestamp: ts,
      status: 'done',
    },
  ]
}

function mapLiveAnswer(raw: unknown): WorkspaceLiveAnswer | null {
  const mapped = mapPromptLayerAnswer(raw, WORKSPACE_LIVE_ANSWER_TITLE)
  if (!mapped) return null
  const root = (raw as { response?: unknown }).response ?? raw
  const res = root && typeof root === 'object' ? (root as Record<string, unknown>) : {}
  return {
    title: mapped.title,
    body: mapped.body,
    confidence: typeof res.confidence === 'string' ? res.confidence : null,
    citations: Array.isArray(res.citations) ? (res.citations as PromptLayerCitation[]) : [],
    visualization: 'visualization' in res ? (res.visualization as WorkspaceLiveAnswer['visualization']) : null,
  }
}

export type WorkspaceInitialAnswer = {
  body: string
  status: 'idle' | 'loading' | 'done' | 'error'
}

export type WorkspaceState = {
  promptInput: string
  setPromptInput: (value: string) => void
  isSubmitting: boolean
  connectionState: 'idle' | 'connected' | 'error'
  conversation: WorkspaceConversationMessage[]
  threads: WorkspaceChatThread[]
  activeThreadId: string | null
  initialAnswer: WorkspaceInitialAnswer
  startNewChat: () => void
  selectThread: (threadId: string) => void
  deleteThread: (threadId: string) => void
  submitPrompt: (prompt: string) => Promise<void>
  refreshStarterAnswer: () => void
  resetForTab: (tab: WorkspaceTab) => void
}

export function useWorkspaceState(
  activeTab: WorkspaceTab,
  setSelectedSuggestion: (label: string | null) => void,
): WorkspaceState {
  const { tenantId, tenantReady } = useSessionTenant()
  const { user, isLoading: authLoading } = useAuth()
  const storageKey = `${THREADS_STORAGE_PREFIX}${tenantId.trim() || 'anonymous'}`

  const [threads, setThreads] = useState<WorkspaceChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [conversation, setConversation] = useState<WorkspaceConversationMessage[]>(() =>
    welcomeMessages(activeTab),
  )
  const [promptInput, setPromptInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [connectionState, setConnectionState] = useState<'idle' | 'connected' | 'error'>('idle')
  const [initialAnswer, setInitialAnswer] = useState<WorkspaceInitialAnswer>({ body: '', status: 'idle' })
  const [initialAnswerNonce, setInitialAnswerNonce] = useState(0)

  const requestIdRef = useRef(0)
  const initialAnswerRequestRef = useRef(0)
  const initialSessionIdRef = useRef(newSessionId())
  const phaseTimerRef = useRef<number | null>(null)
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation

  useEffect(() => {
    setThreads(loadThreads(storageKey))
  }, [storageKey])

  const persistThreads = useCallback(
    (next: WorkspaceChatThread[]) => {
      setThreads(next)
      saveThreads(storageKey, next)
    },
    [storageKey],
  )

  const upsertActiveThread = useCallback(
  (messages: WorkspaceConversationMessage[], threadId: string, title?: string, sessionId?: string) => {
      const now = new Date().toISOString()
      setThreads((prev) => {
        const existing = prev.find((t) => t.id === threadId)
        const next = existing
          ? prev.map((t) =>
            t.id === threadId
              ? {
                ...t,
                messages,
                title: title ?? t.title,
                updatedAt: now,
                tab: activeTab,
              }
              : t,
          )
          : [
            {
              id: threadId,
              tab: activeTab,
              title: title ?? 'New conversation',
              createdAt: now,
              updatedAt: now,
              messages,
              sessionId: sessionId ?? newSessionId(),
            },
            ...prev,
          ]
        saveThreads(storageKey, next)
        return next
      })
    },
    [activeTab, storageKey],
  )

  const startNewChat = useCallback(() => {
    if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
    setActiveThreadId(null)
    setConversation(welcomeMessages(activeTab))
    setPromptInput('')
    setIsSubmitting(false)
    setConnectionState('idle')
    setInitialAnswer({ body: '', status: 'idle' })
    initialSessionIdRef.current = newSessionId()
    setInitialAnswerNonce((n) => n + 1)
    setSelectedSuggestion(null)
  }, [activeTab, setSelectedSuggestion])

  const selectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId)
      if (!thread) return
      setActiveThreadId(threadId)
      setConversation(thread.messages.length > 0 ? thread.messages : welcomeMessages(activeTab))
      setConnectionState('idle')
      setSelectedSuggestion(null)
    },
    [activeTab, setSelectedSuggestion, threads],
  )

  const deleteThread = useCallback(
    (threadId: string) => {
      persistThreads(threads.filter((t) => t.id !== threadId))
      if (activeThreadId === threadId) startNewChat()
    },
    [activeThreadId, persistThreads, startNewChat, threads],
  )

  const resetForTab = useCallback(
    (tab: WorkspaceTab) => {
      startNewChat()
      setConversation(welcomeMessages(tab))
    },
    [startNewChat],
  )

  const submitPrompt = useCallback(
    async (rawPrompt: string) => {
      const cleaned = rawPrompt.trim()
      if (!cleaned || isSubmitting) return

      const suggestions = workspacePromptCopy[activeTab].suggestions as readonly string[]
      setSelectedSuggestion(suggestions.includes(cleaned) ? cleaned : null)
      setPromptInput('')
      const threadId = activeThreadId ?? newThreadId()
      const existingThread = threads.find((t) => t.id === threadId)
      const threadSessionId = existingThread?.sessionId || newSessionId()
      if (!activeThreadId) setActiveThreadId(threadId)

      const requestId = ++requestIdRef.current
      const assistantMessageId = `assistant-${requestId}`
      const timestamp = formatChatTimestamp()

      const userMessage: WorkspaceConversationMessage = {
        id: `user-${requestId}`,
        role: 'user',
        body: cleaned,
        timestamp,
        status: 'done',
      }

      const baseMessages = conversation.filter((m) => !m.id.endsWith('-welcome'))
      const withUser = [...baseMessages, userMessage]

      setConversation([
        ...withUser,
        {
          id: assistantMessageId,
          role: 'assistant',
          body: LOADING_PHASE_LABEL.understanding,
          timestamp,
          status: 'typing',
          loadingPhase: 'understanding',
        },
      ])
      setIsSubmitting(true)
      setConnectionState('idle')

      let phaseIndex = 0
      if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
      phaseTimerRef.current = window.setInterval(() => {
        phaseIndex = (phaseIndex + 1) % LOADING_PHASES.length
        const phase = LOADING_PHASES[phaseIndex]
        if (requestIdRef.current !== requestId) return
        setConversation((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, body: LOADING_PHASE_LABEL[phase], loadingPhase: phase, status: 'typing' }
              : msg,
          ),
        )
      }, 1400)

      const tenantGate = sessionTenantForPromptLayer(tenantId, tenantReady)
      if (!tenantGate.ok) {
        if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
        if (requestIdRef.current !== requestId) return
        const finalMessages: WorkspaceConversationMessage[] = [
          ...withUser,
          {
            id: assistantMessageId,
            role: 'assistant',
            body: tenantGate.body,
            timestamp,
            status: 'error',
            loadingPhase: null,
          },
        ]
        setConversation(finalMessages)
        upsertActiveThread(finalMessages, threadId, threadTitleFromPrompt(cleaned), threadSessionId)
        setConnectionState('error')
        setIsSubmitting(false)
        return
      }

      try {
        const userId = user?.id?.trim()
        if (authLoading) {
          throw new Error('User session is still loading. Please retry in a moment.')
        }
        if (!userId) {
          throw new Error('Missing user context. Please login again.')
        }
        const result = await postPromptLayerQuery(
          {
            query: cleaned,
            top_k: 6,
          },
          {
            tenantId: tenantGate.tenantId,
            sessionId: threadSessionId,
            // optional, backend falls back to JWT if missing
            userId,
          },
        )

        if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
        if (requestIdRef.current !== requestId) return

        if (!result.ok) {
          const detail =
            typeof result.payload === 'object' &&
              result.payload &&
              'details' in result.payload &&
              typeof (result.payload as { details?: string }).details === 'string'
              ? (result.payload as { details: string }).details
              : `HTTP ${result.httpStatus}`

          throw new Error(
            `Ask Zord could not complete your request (${detail}). Try again or ask a more specific question.`,
          )
        }

        const mapped = mapLiveAnswer(result.payload)
        if (!mapped?.body.trim()) {
          throw new Error('Ask Zord returned an empty answer. Try a more specific payout question.')
        }

        const citationSnippet = mapped.citations[0]?.snippet ?? null
        const assistantMessage: WorkspaceConversationMessage = {
          id: assistantMessageId,
          role: 'assistant',
          body: mapped.body,
          timestamp: formatChatTimestamp(),
          status: 'done',
          loadingPhase: null,
          confidence: mapped.confidence,
          citationSnippet,
          citations: mapped.citations,
          hasVisualization: mapped.visualization != null,
          visualization: mapped.visualization,
        }

        const finalMessages = [...withUser, assistantMessage]
        setConversation(finalMessages)
        upsertActiveThread(finalMessages, threadId, threadTitleFromPrompt(cleaned), threadSessionId)
        setConnectionState('connected')
      } catch (error) {
        if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
        if (requestIdRef.current !== requestId) return

        const message =
          error instanceof Error
            ? error.message
            : 'Could not reach Ask Zord. Check your connection and try again.'

        const finalMessages: WorkspaceConversationMessage[] = [
          ...withUser,
          {
            id: assistantMessageId,
            role: 'assistant',
            body: message,
            timestamp: formatChatTimestamp(),
            status: 'error',
            loadingPhase: null,
          },
        ]
        setConversation(finalMessages)
        upsertActiveThread(finalMessages, threadId, threadTitleFromPrompt(cleaned), threadSessionId)
        setConnectionState('error')
      } finally {
        if (requestIdRef.current === requestId) setIsSubmitting(false)
      }
    },
    [
      activeTab,
      activeThreadId,
      authLoading,
      conversation,
      isSubmitting,
      setSelectedSuggestion,
      tenantId,
      tenantReady,
      threads,
      upsertActiveThread,
      user?.id,
    ],
  )

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) window.clearInterval(phaseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const hasUserTurn = conversationRef.current.some((m) => m.role === 'user')
    if (hasUserTurn || activeThreadId) return

    const tenantGate = sessionTenantForPromptLayer(tenantId, tenantReady)
    if (!tenantGate.ok || authLoading) return

    const userId = user?.id?.trim()
    if (!userId) return

    const requestId = ++initialAnswerRequestRef.current
    const tabQuestion = workspacePromptCopy[activeTab].question

    setInitialAnswer({ body: '', status: 'loading' })

    void (async () => {
      try {
        const result = await postPromptLayerQuery(
          { query: tabQuestion, top_k: 6 },
          {
            tenantId: tenantGate.tenantId,
            sessionId: initialSessionIdRef.current,
            userId,
          },
        )

        if (initialAnswerRequestRef.current !== requestId) return

        if (!result.ok) {
          setInitialAnswer({ body: '', status: 'error' })
          return
        }

        const mapped = mapLiveAnswer(result.payload)
        if (!mapped?.body.trim()) {
          setInitialAnswer({ body: '', status: 'error' })
          return
        }

        setInitialAnswer({ body: mapped.body, status: 'done' })
      } catch {
        if (initialAnswerRequestRef.current !== requestId) return
        setInitialAnswer({ body: '', status: 'error' })
      }
    })()

    return () => {
      initialAnswerRequestRef.current += 1
    }
  }, [activeTab, activeThreadId, authLoading, initialAnswerNonce, tenantId, tenantReady, user?.id])

  const refreshStarterAnswer = useCallback(() => {
    const hasUserTurn = conversationRef.current.some((m) => m.role === 'user')
    if (hasUserTurn || activeThreadId) return
    setInitialAnswer({ body: '', status: 'idle' })
    setInitialAnswerNonce((n) => n + 1)
  }, [activeThreadId])

  return {
    promptInput,
    setPromptInput,
    isSubmitting,
    connectionState,
    conversation,
    threads: threads.filter((t) => t.tab === activeTab),
    activeThreadId,
    initialAnswer,
    startNewChat,
    selectThread,
    deleteThread,
    submitPrompt,
    resetForTab,
    refreshStarterAnswer,
  }
}
