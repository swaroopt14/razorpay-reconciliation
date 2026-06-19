'use client'

import { AskZordPromptLayer } from './AskZordPromptLayer'
import type { AskZordState } from '../hooks/useAskZordState'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'

type AskZordPanelProps = Pick<
  AskZordState,
  | 'isOpen'
  | 'close'
  | 'input'
  | 'setInput'
  | 'status'
  | 'response'
  | 'lastUserPrompt'
  | 'archivedTurns'
> & {
  onSubmit: () => void
  onQuickPrompt: (prompt: string) => void
}

/** Ask Zord opens only here — triggered from header or other explicit Ask Zord actions. */
export function AskZordPanel({
  isOpen,
  close,
  input,
  setInput,
  status,
  response,
  lastUserPrompt,
  archivedTurns,
  onSubmit,
  onQuickPrompt,
}: AskZordPanelProps) {
  const { tenantId, tenantReady } = useSessionTenant()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[3px]"
        aria-hidden={false}
        onClick={close}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask Zord"
        className="relative z-[1] w-full max-w-[min(100vw-1.5rem,42rem)] sm:max-w-[44rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <AskZordPromptLayer
          onClose={close}
          promptInput={input}
          onPromptInputChange={setInput}
          onSubmit={onSubmit}
          onQuickPrompt={onQuickPrompt}
          lastPrompt={lastUserPrompt}
          status={status}
          response={response}
          archivedTurns={archivedTurns}
          tenantReady={tenantReady}
          tenantId={tenantId}
        />
      </div>
    </div>
  )
}
