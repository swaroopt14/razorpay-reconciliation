'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HomeCommandStatus } from '@/services/payout-command/model'
import type { AskZordResponse } from '@/services/payout-command/types'
import { ASK_ZORD_QUICK_PROMPTS } from '../hooks/useAskZordState'
import { Glyph } from '../shared'

export type AskZordArchivedTurn = {
  user: string
  title: string
  body: string
}

export type AskZordPromptLayerProps = {
  onClose: () => void
  promptInput: string
  onPromptInputChange: (value: string) => void
  onSubmit: () => void
  onQuickPrompt: (prompt: string) => void
  lastPrompt: string | null
  status: HomeCommandStatus
  response: AskZordResponse | null
  archivedTurns: AskZordArchivedTurn[]
  tenantReady: boolean
  tenantId: string
}

function ZordAssistantAvatar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#000000] text-[#0A0A0A] shadow-sm ring-1 ring-[#000000]/40 ${className}`}
      aria-hidden
    >
      <Glyph name="zap" className="h-[18px] w-[18px]" />
    </span>
  )
}

function UserAvatar() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700"
      aria-hidden
    >
      You
    </span>
  )
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function UserBubble({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex gap-3">
      <UserAvatar />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold text-slate-900">You</p>
          <span className="shrink-0 text-[12px] text-slate-400">{time}</span>
        </div>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{text}</p>
      </div>
    </div>
  )
}

function AssistantBubble({
  title,
  body,
  time,
  isStreaming,
}: {
  title: string
  body: string
  time: string
  isStreaming?: boolean
}) {
  const isError =
    title.toLowerCase().includes('unavailable') ||
    title.toLowerCase().includes('sign in') ||
    title.toLowerCase().includes('tenant')

  return (
    <div className="flex gap-3">
      <ZordAssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold text-slate-900">Zord</p>
          <span className="shrink-0 text-[12px] text-slate-400">{time}</span>
        </div>
        {title && title !== 'Ask Zord' ? (
          <p className="mt-1 text-[14px] font-semibold text-slate-900">{title}</p>
        ) : null}
        <div
          className={`mt-1 text-[14px] leading-relaxed ${
            isError ? 'text-[#2563eb]' : 'text-slate-700'
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => <p className="mt-2" {...props} />,
              ul: ({ node, ...props }) => <ul className="mt-2 list-disc pl-5" {...props} />,
              ol: ({ node, ...props }) => <ol className="mt-2 list-decimal pl-5" {...props} />,
              li: ({ node, ...props }) => <li className="mt-1" {...props} />,
              strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
              em: ({ node, ...props }) => <em className="italic" {...props} />,
              table: ({ node, ...props }) => (
                <table className="mt-4 min-w-full divide-y divide-slate-200 border border-slate-200 text-sm" {...props} />
              ),
              th: ({ node, ...props }) => (
                <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold" {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="border border-slate-200 px-2 py-1" {...props} />
              ),
              pre: ({ node, ...props }) => (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[13px] text-slate-100" {...props} />
              ),
              code: ({ node, inline, className, ...props }) =>
                inline ? (
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-900" {...props} />
                ) : (
                  <code className="block rounded bg-slate-950 p-2 text-[13px] text-slate-100" {...props} />
                ),
            }}
          >
            {body}
          </ReactMarkdown>
          {isStreaming ? (
            <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-[#000000] align-middle" />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function footerCaption(status: HomeCommandStatus, tenantReady: boolean, tenantId: string) {
  if (status === 'loading') return "Searching your workspace's payment data…"
  if (status === 'typing') return 'Drafting answer from your workspace data…'
  if (tenantReady && tenantId.trim()) {
    return 'Charts load from your payment data · Ask Zord answers from your workspace context'
  }
  return 'Sign in and select a workspace to use Ask Zord.'
}

/** Single Ask Zord chat shell — only mounted inside `AskZordPanel` when opened. */
export function AskZordPromptLayer({
  onClose,
  promptInput,
  onPromptInputChange,
  onSubmit,
  onQuickPrompt,
  lastPrompt,
  status,
  response,
  archivedTurns,
  tenantReady,
  tenantId,
}: AskZordPromptLayerProps) {
  const isThinking = status === 'loading' || status === 'typing'
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = formatTime()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [archivedTurns, lastPrompt, response?.body, status])

  return (
    <div className="flex max-h-[min(88vh,40rem)] w-full flex-col overflow-hidden rounded-[20px] border border-slate-200/90 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Glyph name="zap" className="h-4 w-4" />
          </span>
          <p className="truncate text-[15px] font-semibold text-slate-900">Ask Zord</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close Ask Zord"
        >
          <Glyph name="arrow-up-right" className="h-4 w-4 rotate-45" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-[12rem] flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
        aria-live="polite"
      >
        {archivedTurns.length === 0 && !lastPrompt ? (
          <p className="text-center text-[14px] leading-relaxed text-slate-500">
            Ask about disbursement status, delays, confirmations, or pending value. Quick prompts below
            get you started.
          </p>
        ) : null}

        {archivedTurns.map((turn, index) => (
          <div key={`turn-${index}-${turn.user.slice(0, 24)}`} className="space-y-5">
            <UserBubble text={turn.user} time={now} />
            <AssistantBubble title={turn.title} body={turn.body} time={now} />
          </div>
        ))}

        {lastPrompt ? <UserBubble text={lastPrompt} time={now} /> : null}

        {response && (status !== 'idle' || response.body) ? (
          <AssistantBubble
            title={response.title}
            body={response.body}
            time={now}
            isStreaming={status === 'typing'}
          />
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-100 bg-[#fafafa] px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {ASK_ZORD_QUICK_PROMPTS.map((item) => {
            const selected = lastPrompt === item
            return (
              <button
                key={item}
                type="button"
                onClick={() => onQuickPrompt(item)}
                disabled={isThinking}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:text-[13px] ${
                  selected
                    ? 'border-sky-400 bg-sky-50 text-slate-900 ring-1 ring-sky-400/30'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            )
          })}
        </div>

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <input
              value={promptInput}
              onChange={(e) => onPromptInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
              placeholder="Enter your Ask Zord request"
              disabled={isThinking}
              className="w-full bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              {footerCaption(status, tenantReady, tenantId)}
            </p>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isThinking || !promptInput.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0A0A0A] text-white shadow-md transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Send"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  )
}
