'use client'

import type { WorkspaceChatThread } from '@/services/payout-command/types'
import { WORKSPACE_TEXT_MUTED, WORKSPACE_TEXT_PRIMARY } from './workspaceTokens'

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export type WorkspaceChatHistoryOverlayProps = {
  open: boolean
  onClose: () => void
  threads: WorkspaceChatThread[]
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
}

export function WorkspaceChatHistoryOverlay({
  open,
  onClose,
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
}: WorkspaceChatHistoryOverlayProps) {
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col rounded-[1.5rem] bg-[#fbfbfc]/95 backdrop-blur-[2px]"
      data-testid="workspace-chat-history-overlay"
      role="dialog"
      aria-label="Chat history"
    >
      <div className="flex items-center justify-between border-b border-black/8 px-4 py-3 sm:px-5">
        <div>
          <p className={`text-[14px] font-semibold ${WORKSPACE_TEXT_PRIMARY}`}>History</p>
          <p className={`mt-0.5 text-[12px] ${WORKSPACE_TEXT_MUTED}`}>
            {threads.length} conversation{threads.length === 1 ? '' : 's'} for this tab
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[18px] leading-none text-[#111111] hover:bg-[#fafafa]"
          aria-label="Close history"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {threads.length === 0 ? (
          <p className={`rounded-[1rem] border border-dashed border-black/10 bg-white px-4 py-8 text-center text-[13px] ${WORKSPACE_TEXT_MUTED}`}>
            No saved conversations yet. Ask a question to start one.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {threads.map((thread) => {
              const selected = thread.id === activeThreadId
              return (
                <li key={thread.id}>
                  <div
                    className={`flex items-center gap-2 rounded-[1rem] border px-3 py-2.5 transition ${
                      selected
                        ? 'border-[#00239C]/25 bg-[#eef3fa]'
                        : 'border-black/8 bg-white hover:border-black/15 hover:bg-[#fafafa]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectThread(thread.id)
                        onClose()
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className={`truncate text-[13px] font-medium ${WORKSPACE_TEXT_PRIMARY}`}>{thread.title}</p>
                      <p className={`mt-0.5 text-[11px] ${WORKSPACE_TEXT_MUTED}`}>
                        {formatRelativeTime(thread.updatedAt)}
                        {thread.messages.filter((m) => m.role === 'user').length > 0
                          ? ` · ${thread.messages.filter((m) => m.role === 'user').length} question${
                              thread.messages.filter((m) => m.role === 'user').length === 1 ? '' : 's'
                            }`
                          : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteThread(thread.id)}
                      className="shrink-0 rounded-[8px] px-2 py-1 text-[11px] font-medium text-[#64748b] transition hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete ${thread.title}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export function formatThreadRelativeTime(iso: string): string {
  return formatRelativeTime(iso)
}
