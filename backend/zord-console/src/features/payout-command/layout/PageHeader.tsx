'use client'

type PageHeaderProps = {
  /** Dock label (e.g. Today, Ask) - small eyebrow above the title; omit when same as title */
  pageEyebrow?: string
  /** Full surface name (e.g. Command center, Ask Zord workspace) */
  pageTitle?: string
  /** Optional second line under title (e.g. Ask workspace tab) */
  pageSubtitle?: string
  /** @deprecated Action toolbar removed - kept optional for call-site compatibility. */
  onAskZordToggle?: () => void
  /** @deprecated Action toolbar removed. */
  hideAskZordButton?: boolean
  /** @deprecated Action toolbar removed. */
  onViewBatches?: () => void
  /** @deprecated Action toolbar removed. */
  onIntegrationsClick?: () => void
  /** Home: toggle command center vs connected-systems (knowledge flow) view */
  homeSystemKnowledgeFlow?: {
    enabled: boolean
    onChange: (enabled: boolean) => void
  }
}

/**
  * Page title block only - the old action strip
  * (Ask / View Batches / Integrations / Upload / Export) is removed on all pages.
  */
export function PageHeader({
  pageEyebrow,
  pageTitle,
  pageSubtitle,
  homeSystemKnowledgeFlow,
}: PageHeaderProps) {
  const showPageHeading = Boolean(pageTitle)
  const showEyebrow = Boolean(pageEyebrow && pageEyebrow !== pageTitle)

  if (!showPageHeading && !homeSystemKnowledgeFlow) {
    return null
  }

  return (
    <div className="mb-5 flex flex-col gap-0">
      <div className="min-w-0 space-y-3">
        {showPageHeading ? (
          <div>
            {showEyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">
                {pageEyebrow}
              </p>
            ) : null}
            <h1
              className={`font-semibold tracking-[-0.02em] text-[#0F172A] sm:text-[1.5rem] ${
                showEyebrow ? 'mt-1 text-[1.35rem]' : 'text-[1.4rem]'
              }`}
            >
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="mt-1 max-w-3xl text-[13px] text-[#64748B]">{pageSubtitle}</p>
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
    </div>
  )
}
