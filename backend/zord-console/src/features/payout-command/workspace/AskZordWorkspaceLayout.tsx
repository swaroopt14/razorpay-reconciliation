'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/hooks'
import type { AskZordState } from '../hooks/useAskZordState'
import { AskZordOrb } from './AskZordOrb'
import { AskZordHistorySidebar } from './AskZordHistorySidebar'
import type { AskZordArchivedTurn } from '../layout/AskZordPromptLayer'
import { MarkdownMessage, MessageBubble, ZordAvatar } from './WorkspaceChatMessages'

const EXAMPLE_CHIPS = [
  {
    title: 'Which payments need review?',
    hint: 'Surface open match-review items from your workspace.',
  },
  {
    title: 'What data is missing for proof?',
    hint: 'Check evidence gaps before batch close.',
  },
  {
    title: 'Which batches are blocked from close?',
    hint: 'See close-readiness blockers across batches.',
  },
  {
    title: 'Open financial exceptions?',
    hint: 'Summarize exception queue value and count.',
  },
] as const

type AskZordWorkspaceLayoutProps = {
  askZord: AskZordState
  batchId?: string
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export function AskZordWorkspaceLayout({ askZord, batchId }: AskZordWorkspaceLayoutProps) {
  const { user } = useAuth()
  const firstName = user?.name?.split(' ')[0]?.trim() || 'there'
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const prompt = askZord.input.trim()
      if (!prompt) return
      askZord.run(prompt)
    },
    [askZord],
  )

  const handleChip = useCallback(
    (chip: string) => {
      askZord.run(chip)
    },
    [askZord],
  )

  const hasThread =
    askZord.archivedTurns.length > 0 ||
    Boolean(askZord.lastUserPrompt) ||
    askZord.status === 'loading' ||
    askZord.status === 'typing'

  const showHero = !hasThread

  return (
    <div
      className="flex min-h-[calc(100vh-11rem)] overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
      data-testid="ask-zord-workspace"
    >
      <div className="hidden md:flex">
        <AskZordHistorySidebar
          threads={askZord.threads}
          activeThreadId={askZord.activeThreadId}
          onSelectThread={askZord.selectThread}
          onNewThread={askZord.startNewThread}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={askZord.startNewThread}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700"
            >
              + New
            </button>
          </div>
          <p className="hidden text-[13px] font-medium text-neutral-500 lg:block">Ask Zord</p>

        </header>

        <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-10 sm:px-8">
          {showHero ? (
            <>
              <AskZordOrb />
              <h1 className="mt-8 text-center text-[2rem] font-semibold tracking-tight text-neutral-900">
                {greeting}, {firstName}
              </h1>
              <p className="mt-2 text-center text-[1.35rem] text-neutral-500">
                What&apos;s on{' '}
                <span className="bg-gradient-to-r from-violet-600 to-indigo-500 bg-clip-text font-semibold text-transparent">
                  your mind?
                </span>
              </p>
            </>
          ) : null}

          {hasThread ? (
            <div className="mb-8 w-full max-w-3xl space-y-5" data-testid="ask-zord-thread">
              {askZord.archivedTurns.map((turn: AskZordArchivedTurn, i) => (
                <div key={`archived-${i}`} className="space-y-4">
                  <MessageBubble
                    message={{
                      id: `archived-user-${i}`,
                      role: 'user',
                      body: turn.user,
                      timestamp: '',
                      status: 'done',
                    }}
                  />
                  <MessageBubble
                    message={{
                      id: `archived-assistant-${i}`,
                      role: 'assistant',
                      body: turn.body,
                      timestamp: '',
                      status: 'done',
                    }}
                  />
                </div>
              ))}
              {askZord.lastUserPrompt ? (
                <MessageBubble
                  message={{
                    id: 'current-user',
                    role: 'user',
                    body: askZord.lastUserPrompt,
                    timestamp: '',
                    status: 'done',
                  }}
                />
              ) : null}
              {askZord.response ? (
                <div className="flex gap-3">
                  <ZordAvatar />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-neutral-900">{askZord.response.title}</p>
                    <div className="mt-1 text-[15px] leading-relaxed text-neutral-600">
                      {askZord.status === 'loading' || askZord.status === 'typing' ? (
                        <p className="text-neutral-400">{askZord.response.body || 'Searching…'}</p>
                      ) : (
                        <MarkdownMessage body={askZord.response.body} />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="w-full max-w-3xl">
            <div className="rounded-[1.25rem] border border-neutral-200/80 bg-white p-4 shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
              <textarea
                value={askZord.input}
                onChange={(e) => askZord.setInput(e.target.value)}
                rows={3}
                placeholder="Ask Zord about payment gaps, proof, or review…"
                className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
                data-testid="ask-zord-prompt-input"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
                  >
                    <span aria-hidden>📎</span> Attach
                  </button>
                  <div className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-neutral-500">
                    <span>
                      Context
                      {askZord.selectedContext
                        ? ` - ${askZord.selectedContext.selectedTitle}`
                        : batchId
                          ? ` - ${batchId.slice(0, 8)}...`
                          : ''}
                    </span>
                    {askZord.selectedContext ? (
                      <button
                        type="button"
                        onClick={askZord.clearSelectedContext}
                        className="rounded-full px-1.5 text-[12px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                        aria-label="Clear selected context"
                        title="Clear selected context"
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-[15px] text-white shadow-sm transition hover:bg-neutral-800"
                  aria-label="Send"
                >
                  ↑
                </button>
              </div>
            </div>
          </form>

          {showHero ? (
            <>
              <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Get started with an example below
              </p>
              <div className="mt-4 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                {EXAMPLE_CHIPS.map((chip) => (
                  <button
                    key={chip.title}
                    type="button"
                    onClick={() => handleChip(chip.title)}
                    className="group rounded-2xl border border-neutral-100 bg-[#f9fafb] px-4 py-4 text-left transition hover:border-violet-200 hover:bg-white hover:shadow-[0_4px_20px_rgba(124,58,237,0.08)]"
                    data-testid="ask-zord-example-chip"
                  >
                    <p className="text-[13px] font-semibold text-neutral-800 group-hover:text-neutral-900">
                      {chip.title}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">{chip.hint}</p>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-4 text-[12px] text-neutral-500">
            <button
              type="button"
              className="font-medium text-violet-700 transition hover:text-violet-900"
              onClick={() => {
                askZord.setInput(
                  batchId
                    ? `Ask about batch ${batchId} payment gap data`
                    : 'Ask about payment gap data for this workspace',
                )
              }}
            >
              Ask about this data
            </button>
            <Link href="/payout-command-view/batch-command-center" className="font-medium text-neutral-500 hover:text-neutral-800">
              View Batches
            </Link>
            {/* Connectors temporarily hidden — see CONNECTORS_DOCK_TEMPORARILY_HIDDEN
            <Link href="/payout-command-view/today?dock=connectors" className="font-medium text-neutral-500 hover:text-neutral-800">
              Integrations
            </Link>
            */}
          </div>
        </div>
      </div>
    </div>
  )
}
