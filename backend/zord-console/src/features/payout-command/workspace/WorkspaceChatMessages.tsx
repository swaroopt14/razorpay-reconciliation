'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceConversationMessage, WorkspaceLoadingPhase } from '@/services/payout-command/types'
import { CHAT_USER_BUBBLE } from './workspaceChatTokens'

export function MarkdownMessage({ body }: { body: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <p className="mt-2 first:mt-0" {...props} />,
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
  )
}

const PHASE_SPINNER_LABEL: Record<WorkspaceLoadingPhase, string> = {
  understanding: 'Thinking',
  fetching: 'Fetching evidence',
  listing: 'Listing records',
  checking: 'Checking signals',
  summarizing: 'Summarizing',
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 pl-1 align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  )
}

function AssistantLoadingIndicator({ phase }: { phase?: WorkspaceLoadingPhase | null }) {
  const label = phase ? PHASE_SPINNER_LABEL[phase] : 'Thinking'
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
      {label}
      <ThinkingDots />
    </span>
  )
}

export function ZordAvatar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#000000] text-[#0A0A0A] shadow-sm ring-1 ring-[#000000]/40 ${className}`}
      aria-hidden
    >
      <svg className="h-[16px] w-[16px]" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M10.7 2.8 5.8 10h3l-.5 7.2 5-7.3h-3l.4-7.1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function ConnectionPill({ state }: { state: 'idle' | 'connected' | 'error' }) {
  if (state === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/30 bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-black">
        <span className="h-1.5 w-1.5 rounded-full bg-black" />
        Live operating context
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Unavailable
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#eef1f5] px-2.5 py-1 text-[11px] font-medium text-[#111111]">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Ready
    </span>
  )
}

function CitationBlock({ message }: { message: WorkspaceConversationMessage }) {
  const citations = message.citations ?? []
  const [open, setOpen] = useState(false)
  if (citations.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold uppercase tracking-[0.06em] text-black hover:text-black"
      >
        Sources ({citations.length}) {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {citations.slice(0, 4).map((c, i) => (
            <div
              key={`${c.chunk_id ?? c.record_id ?? i}`}
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[13px] leading-relaxed text-slate-600"
            >
              {(c.source_type || c.record_id) && (
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black">
                  {[c.source_type, c.record_id].filter(Boolean).join(' · ')}
                </p>
              )}
              {c.snippet?.trim() || '—'}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MessageBubble({ message }: { message: WorkspaceConversationMessage }) {
  const isUser = message.role === 'user'
  const isLoading = message.status === 'typing'
  const isError = message.status === 'error'

  if (isUser) {
    return (
      <div className="flex justify-end" data-testid="workspace-chat-user-message">
        <div className={CHAT_USER_BUBBLE}>
          <p className="whitespace-pre-wrap">{message.body}</p>
          <p className="mt-1.5 text-right text-[11px] text-slate-500">{message.timestamp}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" data-testid="workspace-chat-assistant-message">
      <ZordAvatar />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[13px] font-semibold text-slate-900">Zord</p>
          {!isLoading ? <span className="text-[11px] text-slate-400">{message.timestamp}</span> : null}
        </div>
        <div
          className={`mt-1 text-[15px] leading-relaxed ${
            isError ? 'text-red-800' : isLoading ? 'text-slate-500' : 'text-slate-700'
          }`}
        >
          {isLoading ? <AssistantLoadingIndicator phase={message.loadingPhase} /> : <MarkdownMessage body={message.body} />}
        </div>
        {!isLoading ? <CitationBlock message={message} /> : null}
        {!isLoading && message.confidence ? (
          <span className="mt-3 inline-flex rounded-full border border-black/30 bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-black">
            {message.confidence}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function WorkspaceChatStarterTurn({
  question,
  supporting,
  answerBody,
  answerStatus,
}: {
  question: string
  supporting: string
  answerBody: string
  answerStatus: 'idle' | 'loading' | 'done' | 'error'
}) {
  const showAnswer = answerStatus === 'done' && answerBody.trim().length > 0
  const isLoading = answerStatus === 'loading'

  return (
    <div className="flex gap-3" data-testid="workspace-chat-starter-turn">
      <ZordAvatar />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">Zord</p>
        <div className="mt-1 text-[15px] leading-relaxed text-slate-800">
          <p className="font-medium text-[#111111]">{question}</p>
          <p className="mt-2 text-[14px] text-slate-600">{supporting}</p>
          {isLoading ? (
            <div className="mt-4">
              <AssistantLoadingIndicator phase="understanding" />
            </div>
          ) : null}
          {showAnswer ? (
            <div className="mt-4 border-t border-slate-200/80 pt-4" data-testid="workspace-chat-transcript-answer">
              <MarkdownMessage body={answerBody} />
            </div>
          ) : null}
          {answerStatus === 'error' ? (
            <p className="mt-4 text-[13px] text-slate-500">
              Could not load a grounded answer yet. Ask a specific question below.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
