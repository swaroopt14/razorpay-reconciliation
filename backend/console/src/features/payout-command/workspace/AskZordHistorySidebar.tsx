'use client'

import { useMemo, useState } from 'react'
import type { AskZordThread } from './askZordThreads'

type AskZordHistorySidebarProps = {
  threads: AskZordThread[]
  activeThreadId: string | null
  onSelectThread: (id: string) => void
  onNewThread: () => void
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function AskZordHistorySidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
}: AskZordHistorySidebarProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.turns.some((turn) => turn.user.toLowerCase().includes(q) || turn.body.toLowerCase().includes(q)),
    )
  }, [query, threads])

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-r border-neutral-100 bg-[#fafafa] md:w-[280px]"
      data-testid="ask-zord-history-sidebar"
    >
      <div className="border-b border-neutral-100 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-neutral-900">Chat history</p>
          <button
            type="button"
            onClick={onNewThread}
            className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-neutral-800"
          >
            + New
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
          aria-label="Search chat history"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-neutral-500">
            {query.trim() ? 'No chats match your search.' : 'No chats yet. Ask Zord to start one.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((thread) => {
              const active = thread.id === activeThreadId
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? 'bg-white shadow-[0_1px_8px_rgba(15,23,42,0.06)] ring-1 ring-violet-200'
                        : 'hover:bg-white/80'
                    }`}
                    data-testid="ask-zord-history-item"
                  >
                    <p className={`truncate text-[13px] font-medium ${active ? 'text-neutral-900' : 'text-neutral-700'}`}>
                      {thread.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {formatRelativeTime(thread.updatedAt)} · {thread.turns.length} message{thread.turns.length === 1 ? '' : 's'}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
