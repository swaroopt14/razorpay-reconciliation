'use client'
import { useAuth } from '@/app/hooks'
import { useCallback, useEffect, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  mapPromptLayerAnswer,
  postPromptLayerQuery,
  sessionTenantForPromptLayer,
} from '@/services/payout-command/prompt-layer/postPromptLayerQuery'
import type { AskZordResponse } from '@/services/payout-command/types'
import type { HomeCommandStatus } from '@/services/payout-command/model'
import type { AskZordArchivedTurn } from '../layout/AskZordPromptLayer'

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
  run: (prompt: string) => void
  dismissResponse: () => void
}

export function useAskZordState(_activeSurfaceTitle: string): AskZordState {
  const { tenantId, tenantReady } = useSessionTenant()
  const { user, isLoading: authLoading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<HomeCommandStatus>('idle')
  const [pendingResponse, setPendingResponse] = useState<AskZordResponse | null>(null)
  const [response, setResponse] = useState<AskZordResponse | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState<string | null>(null)
  const [archivedTurns, setArchivedTurns] = useState<AskZordArchivedTurn[]>([])

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

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((current) => !current), [])

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

      setIsOpen(true)
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
          },
          {
            tenantId: tenantGate.tenantId,
            sessionId: crypto.randomUUID(), // or persisted ref if this hook has multi-turn continuity
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
    [authLoading, lastUserPrompt, response, status, tenantId, tenantReady, user?.id],
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
    run,
    dismissResponse,
  }
}
