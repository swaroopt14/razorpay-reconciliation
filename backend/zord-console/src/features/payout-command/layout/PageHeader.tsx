'use client'

import { useRouter } from 'next/navigation'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { ApiKeysPopoverButton } from './ApiKeysPopoverButton'
import { usePayoutPageActions } from './PayoutPageActionsContext'
import { HOME_BODY_IMPERIAL_SM } from '../command-center/homeCommandCenterTokens'
import { Glyph } from '../shared'

const TEAM_AVATARS = [
  { initial: 'A', bg: '#d8e6ff' },
  { initial: 'F', bg: '#dbf7dd' },
  { initial: 'E', bg: '#edd8f4' },
] as const

type PageHeaderProps = {
  /** Dock label (e.g. Today, Ask) — small eyebrow above the title; omit when same as title */
  pageEyebrow?: string
  /** Full surface name (e.g. Command center, Ask Zord workspace) */
  pageTitle?: string
  /** Optional second line under title (e.g. Ask workspace tab) */
  pageSubtitle?: string
  onAskZordToggle: () => void
  /** Workspace dock uses inline chat — hide header popup trigger. */
  hideAskZordButton?: boolean
  /** Home: toggle command center vs connected-systems (knowledge flow) view */
  homeSystemKnowledgeFlow?: {
    enabled: boolean
    onChange: (enabled: boolean) => void
  }
}

export function PageHeader({
  pageEyebrow,
  pageTitle,
  pageSubtitle,
  onAskZordToggle,
  hideAskZordButton = false,
  homeSystemKnowledgeFlow,
}: PageHeaderProps) {
  const router = useRouter()
  const { mode } = useEnvironment()
  const batchCenterHref = payoutBatchCommandCenterHref(mode === 'sandbox')
  const {
    triggerRefresh,
    triggerExportShare,
    refreshing,
    exportDisabled,
    hasRefresh,
    hasExport,
  } = usePayoutPageActions()
  const showPageHeading = Boolean(pageTitle)
  const showEyebrow = Boolean(pageEyebrow && pageEyebrow !== pageTitle)

  const handleRefresh = () => {
    if (hasRefresh) {
      void triggerRefresh()
      return
    }
    router.refresh()
  }

  return (
    <div className="mb-6 flex flex-col gap-0">
      <div
        className={`flex flex-col gap-2 xl:flex-row xl:items-center ${
          showPageHeading || homeSystemKnowledgeFlow ? 'xl:justify-between' : 'xl:justify-end'
        }`}
      >
        <div className="min-w-0 space-y-3">
          {showPageHeading ? (
            <div>
              {showEyebrow ? <p className="pc-section-label">{pageEyebrow}</p> : null}
              <h1
                className={`font-bold tracking-[-0.03em] text-neutral-950 sm:text-[1.85rem] ${
                  showEyebrow ? 'mt-1 text-[1.6rem]' : 'text-[1.65rem]'
                }`}
              >
                {pageTitle}
              </h1>
              {pageSubtitle ? (
                <p className={`mt-1.5 max-w-3xl ${HOME_BODY_IMPERIAL_SM}`}>{pageSubtitle}</p>
              ) : null}
            </div>
          ) : null}
          {homeSystemKnowledgeFlow ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-[#111111]">System knowledge flow</span>
              <button
                type="button"
                role="switch"
                aria-checked={homeSystemKnowledgeFlow.enabled}
                onClick={() => homeSystemKnowledgeFlow.onChange(!homeSystemKnowledgeFlow.enabled)}
                className={`relative flex h-7 w-[3rem] shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
                  homeSystemKnowledgeFlow.enabled
                    ? 'justify-end bg-neutral-900 shadow-[0_0_12px_rgba(0,0,0,0.12)]'
                    : 'justify-start bg-[#d4d4d0]'
                }`}
              >
                <span className="pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />
              </button>
              <span className="text-[13px] text-[#52525b]">
                {homeSystemKnowledgeFlow.enabled ? 'Showing connected systems' : 'Command center metrics'}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 xl:shrink-0">
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#111111] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Refresh page data"
            title="Refresh page data"
            data-testid="page-header-refresh"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {!hideAskZordButton ? (
            <button
              type="button"
              onClick={onAskZordToggle}
              title="Ask questions about payments, gaps, and proof."
              className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[#111111] bg-[#111111] px-2.5 text-[14px] font-semibold text-white"
            >
              <span className="h-2 w-2 rounded-full bg-white/90" />
              Ask about this data
            </button>
          ) : null}

          <a
            href={batchCenterHref}
            data-testid="view-batches-link"
            className="inline-flex h-9 items-center rounded-[8px] border border-[#111111] bg-white px-2.5 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]"
            title="View batch-level payment details"
          >
            View Batches
          </a>

          <ApiKeysPopoverButton label="Integrations" />

          <button
            type="button"
            disabled={!hasExport || exportDisabled}
            onClick={triggerExportShare}
            className="flex h-9 items-center gap-2 rounded-[8px] bg-[#111111] px-2.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-45"
            title="Export or share payment proof report"
          >
            <div className="flex -space-x-1.5">
              {TEAM_AVATARS.map(({ initial, bg }) => (
                <span
                  key={initial}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-white/60 text-[11px] font-semibold text-[#111111]"
                  style={{ background: bg }}
                >
                  {initial}
                </span>
              ))}
            </div>
            <span>Export / Share</span>
          </button>
        </div>
      </div>
    </div>
  )
}
