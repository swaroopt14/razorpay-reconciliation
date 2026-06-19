'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { workspacePromptCopy, workspaceTabs, type WorkspaceTab } from '@/services/payout-command/model'
import type { WorkspaceState } from '../hooks/useWorkspaceState'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { Glyph } from '../shared'
import { ConnectionPill, MessageBubble, WorkspaceChatStarterTurn } from './WorkspaceChatMessages'
import { WorkspaceChatHistoryOverlay } from './WorkspaceChatHistoryOverlay'
import { PAYMENT_OPERATIONS } from './paymentOperationsCopy'
import {
  WORKSPACE_PANEL_SHELL,
  WORKSPACE_TAB_ACTIVE,
  WORKSPACE_TAB_INACTIVE,
  WORKSPACE_TEXT_MUTED,
  WORKSPACE_TEXT_PRIMARY,
} from './workspaceTokens'
import {
  CHAT_CARD_INNER,
  CHAT_COMPOSER_FOOTER,
  CHAT_COMPOSER_SHELL,
  CHAT_HEADER,
  CHAT_HISTORY_BTN,
  CHAT_RECENT_CHIP,
  CHAT_SUGGESTION_CHIP,
  CHAT_TRANSCRIPT,
} from './workspaceChatTokens'

type WorkspaceIntelligencePanelProps = {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  workspace: WorkspaceState
  question: string
  supporting: string
  groundedAnswer: string
}

function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [value])
  return ref
}

export function WorkspaceIntelligencePanel({
  activeTab,
  setActiveTab,
  workspace,
  question,
  supporting,
  groundedAnswer,
}: WorkspaceIntelligencePanelProps) {
  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(workspace.promptInput)
  const [historyOpen, setHistoryOpen] = useState(false)

  const hasUserTurn = workspace.conversation.some((m) => m.role === 'user')
  const transcriptMessages = useMemo(
    () => workspace.conversation.filter((m) => !m.id.endsWith('-welcome')),
    [workspace.conversation],
  )

  const messageCount = transcriptMessages.length

  const starterAnswerBody =
    workspace.initialAnswer.status === 'done' && workspace.initialAnswer.body.trim()
      ? workspace.initialAnswer.body
      : groundedAnswer.trim()

  const suggestions = workspacePromptCopy[activeTab].suggestions as readonly string[]
  const recentThreads = workspace.threads.slice(0, 3)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [workspace.conversation, workspace.isSubmitting, workspace.initialAnswer.status, starterAnswerBody])

  const handleSubmit = useCallback(() => {
    const text = workspace.promptInput.trim()
    if (!text || workspace.isSubmitting) return
    void workspace.submitPrompt(text)
  }, [workspace])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSuggestion = (text: string) => {
    if (workspace.isSubmitting) return
    void workspace.submitPrompt(text)
  }

  const footerHint = !tenantReady
    ? 'Resolving your workspace…'
    : !tenantId.trim()
      ? 'Sign in so Ask Zord can focus answers on your workspace.'
      : workspace.isSubmitting
        ? "Searching your workspace's payment data…"
        : 'Shift+Enter for new line · Enter to send'

  return (
    <article className={WORKSPACE_PANEL_SHELL} data-testid="workspace-intelligence-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2" role="tablist" aria-label="Workspace context">
          {workspaceTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2.5 text-[13px] font-medium transition ${
                activeTab === tab ? WORKSPACE_TAB_ACTIVE : WORKSPACE_TAB_INACTIVE
              }`}
            >
              {tab}
            </button>
          ))}
          <span
            className="max-w-full cursor-not-allowed rounded-full border border-[#00239C]/30 bg-[#EEF3FF] px-4 py-2.5 text-[13px] font-semibold leading-snug text-[#00239C] shadow-sm"
            title={PAYMENT_OPERATIONS.routingTabDisabled}
            data-testid="workspace-routing-tab-disabled"
          >
            {PAYMENT_OPERATIONS.routingTabDisabled}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionPill state={workspace.connectionState} />
          <button
            type="button"
            onClick={workspace.startNewChat}
            className="rounded-[12px] border border-black/10 bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#111111] hover:bg-[#fafafa]"
          >
            New chat
          </button>
        </div>
      </div>

      <div className={`relative mt-5 ${CHAT_CARD_INNER}`}>
        <WorkspaceChatHistoryOverlay
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          threads={workspace.threads}
          activeThreadId={workspace.activeThreadId}
          onSelectThread={workspace.selectThread}
          onDeleteThread={workspace.deleteThread}
        />

        <div className={CHAT_HEADER}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a8a86]">
                {PAYMENT_OPERATIONS.askPanelTitle}
              </div>
              <div className={`mt-1.5 text-[1.02rem] font-medium tracking-[-0.03em] ${WORKSPACE_TEXT_PRIMARY}`}>
                {PAYMENT_OPERATIONS.askPanelSubtitle}
              </div>
              <p className={`mt-1 text-[12px] ${WORKSPACE_TEXT_MUTED}`}>
                {mode === 'sandbox' ? 'Sandbox' : 'Live'} · {activeTab} context
                {messageCount > 0 ? ` · ${messageCount} message${messageCount === 1 ? '' : 's'}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className={CHAT_HISTORY_BTN}
              data-testid="workspace-chat-history-button"
            >
              History
              {workspace.threads.length > 0 ? (
                <span className="rounded-full bg-[#eef1f5] px-1.5 py-0.5 text-[10px] tabular-nums text-[#64748b]">
                  {workspace.threads.length}
                </span>
              ) : null}
            </button>
          </div>

          {!hasUserTurn && recentThreads.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8a86]">Recent</span>
              {recentThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => workspace.selectThread(thread.id)}
                  className={CHAT_RECENT_CHIP}
                  title={thread.title}
                >
                  {thread.title}
                </button>
              ))}
              {workspace.threads.length > recentThreads.length ? (
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="text-[11px] font-medium text-[#00239C] hover:underline"
                >
                  +{workspace.threads.length - recentThreads.length} more
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={CHAT_TRANSCRIPT} data-testid="workspace-chat-transcript" aria-live="polite">
          {!hasUserTurn ? (
            <>
              <WorkspaceChatStarterTurn
                question={question}
                supporting={supporting}
                answerBody={starterAnswerBody}
                answerStatus={workspace.initialAnswer.status}
              />
              <div className="mt-5 flex flex-wrap gap-2">
                {suggestions.slice(0, 4).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={workspace.isSubmitting}
                    onClick={() => handleSuggestion(suggestion)}
                    className={CHAT_SUGGESTION_CHIP}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              {transcriptMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
          <div ref={chatEndRef} className="h-2" />
        </div>

        <div className={CHAT_COMPOSER_FOOTER}>
          <div className={CHAT_COMPOSER_SHELL}>
            <textarea
              ref={textareaRef}
              value={workspace.promptInput}
              onChange={(e) => workspace.setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={PAYMENT_OPERATIONS.composerPlaceholder}
              rows={1}
              disabled={workspace.isSubmitting}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-[#111111] outline-none placeholder:text-[#8a8a86] disabled:opacity-60"
              aria-label="Ask Zord"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={workspace.isSubmitting || !workspace.promptInput.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111111] text-white transition hover:bg-[#00239C] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Glyph name="arrow-up-right" className="h-[16px] w-[16px]" />
            </button>
          </div>
          <p className={`mt-2 text-center text-[11px] ${WORKSPACE_TEXT_MUTED}`}>{footerHint}</p>
        </div>
      </div>
    </article>
  )
}
