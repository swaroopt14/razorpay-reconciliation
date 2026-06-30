'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DASHBOARD_FONT_STACK,
  CONNECTORS_DOCK_TEMPORARILY_HIDDEN,
  dockItems,
  type DockId,
  type WorkspaceTab,
} from '@/services/payout-command/model'
import { EnvironmentProvider, type EnvMode } from '@/services/auth/EnvironmentProvider'
import { useHomeState } from '../hooks/useHomeState'
import { useWorkspaceState } from '../hooks/useWorkspaceState'
import { useAskZordState } from '../hooks/useAskZordState'
import { AskZordPanel } from '../layout/AskZordPanel'
import { PayoutConsoleNavStack } from '../layout/PayoutConsoleNavStack'
import { PageHeader } from '../layout/PageHeader'
import { PayoutPageActionsProvider } from '../layout/PayoutPageActionsContext'
// Connectors dock temporarily hidden — keep imports for when CONNECTORS_DOCK_TEMPORARILY_HIDDEN is false.
// import ConnectorIntelligenceClient from '../connectors/ConnectorIntelligenceClient'
import {
  AmbiguitySurface,
  BillingSurface,
  BorrowerVerificationSurface,
  EvidenceSurface,
  HomeSurface,
  IntentJournalSurface,
  SettlementJournalSurface,
  LeakageSurface,
  ProofSurface,
  PostDisbursalMonitoringSurface,
  // SandboxConnectorsSurface,
  SupportSurface,
  WorkspaceSurface,
} from '../surfaces'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { SandboxSetupGuidePanel } from '../sandbox/SandboxSetupGuidePanel'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

export type PayoutCommandScope = {
  batchId?: string
  clientBatchId?: string
  accountTab?: string
}

type PayoutCommandViewClientProps = {
  /** When set, pins sandbox vs live for this route (`/sandbox` vs `/today`). */
  forceMode?: EnvMode
  /**
   * Initial dock from the URL — must be resolved on the server (e.g. `searchParams.dock`)
   * so the first client render matches SSR and avoids hydration errors. Do not read
   * `window` / `location` only on the client for this value.
   */
  initialDock?: DockId
  scope?: PayoutCommandScope
}

/** Shared URL batch scope for journal, evidence, and patterns KPIs. */
function resolveSharedBatchId(initial?: string) {
  const id = apiTrimmedString(initial)
  return id || undefined
}

function resolveDockFromSearchParam(raw: string | null): DockId | null {
  if (!raw) return null
  const id = raw as DockId
  if (CONNECTORS_DOCK_TEMPORARILY_HIDDEN && id === 'connectors') return null
  return dockItems.some((item) => item.id === id) ? id : null
}

export default function PayoutCommandViewClient({
  forceMode,
  initialDock = 'home',
  scope = {},
}: PayoutCommandViewClientProps) {
  // ── Navigation state ───────────────────────────────────────────────────────
  const [activeDock, setActiveDock] = useState<DockId>(initialDock)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Today')
  const [activateWizardOpen, setActivateWizardOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeSurface = dockItems.find((item) => item.id === activeDock) ?? dockItems[0]
  const sharedBatchId = resolveSharedBatchId(scope.batchId)
  const onWorkspaceSuggestionSelect = useCallback((_label: string | null) => {}, [])

  const pageHeaderMeta = useMemo(() => {
    const label = activeSurface.label
    const title = activeSurface.title
    const same = label.trim() === title.trim()
    return {
      pageEyebrow: same ? undefined : label,
      pageTitle: title,
      pageSubtitle: activeSurface.summary,
    }
  }, [activeSurface])

  // ── Feature hooks ──────────────────────────────────────────────────────────
  const home = useHomeState(activeDock === 'home')
  const workspace = useWorkspaceState(activeTab, onWorkspaceSuggestionSelect)
  const askZord = useAskZordState(activeSurface.title)

  const handleAskZordQuickPrompt = useCallback(
    (prompt: string) => {
      if (activeDock === 'home') home.applyScopeFromPrompt(prompt)
      askZord.run(prompt)
    },
    [activeDock, askZord, home],
  )

  const handleAskZordToggle = useCallback(() => {
    askZord.toggle()
  }, [askZord])

  useEffect(() => {
    if (activeDock === 'workspace') {
      askZord.close()
    }
  }, [activeDock, askZord.close])

  useEffect(() => {
    const dockFromUrl = resolveDockFromSearchParam(searchParams.get('dock')) ?? initialDock
    setActiveDock((currentDock) => (currentDock === dockFromUrl ? currentDock : dockFromUrl))
  }, [initialDock, searchParams])

  // Deep links with ?dock=connectors redirect to home while connectors nav is hidden.
  useEffect(() => {
    if (!CONNECTORS_DOCK_TEMPORARILY_HIDDEN || searchParams.get('dock') !== 'connectors') return
    const params = new URLSearchParams(searchParams.toString())
    params.set('dock', 'home')
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  // ── Navigation handlers ────────────────────────────────────────────────────
  const handleDockChange = useCallback(
    (id: DockId) => {
      setActiveDock(id)
      if (id === 'workspace') {
        setActiveTab('Today')
        workspace.resetForTab('Today')
      }
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        params.set('dock', id)
        const newUrl = `${window.location.pathname}?${params.toString()}`
        router.push(newUrl)
      }
    },
    [router, workspace],
  )

  const handleTabChange = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab)
      workspace.resetForTab(tab)
    },
    [workspace],
  )

  // ── Active surface body ────────────────────────────────────────────────────
  const surfaceBody = useMemo(() => {
    if (activeDock === 'home') {
      return (
        <div>
          <HomeSurface
            batchId={sharedBatchId}
            snapshot={home.snapshot}
            timeframe={home.timeframe}
            onTimeframeChange={home.setTimeframe}
            onYearChange={home.setYear}
            onQuarterChange={(qi) => {
              home.setQuarterIndex(qi)
              if (home.timeframe !== 'Quarter' && home.timeframe !== 'Custom') {
                home.setTimeframe('Quarter')
              }
            }}
          />
        </div>
      )
    }

    if (activeDock === 'workspace') {
      return (
        <div>
          <WorkspaceSurface askZord={askZord} batchId={sharedBatchId} />
        </div>
      )
    }

    if (activeDock === 'leakage') return <LeakageSurface initialBatchId={sharedBatchId} />
    if (activeDock === 'ambiguity') return <AmbiguitySurface initialBatchId={sharedBatchId} />
    if (activeDock === 'verification') return <BorrowerVerificationSurface />
    if (activeDock === 'monitoring') return <PostDisbursalMonitoringSurface />
    if (activeDock === 'grid') return <IntentJournalSurface initialBatchId={scope.batchId} />
    if (activeDock === 'settlement') {
      return <SettlementJournalSurface initialClientBatchId={scope.clientBatchId} />
    }
    // Connectors dock temporarily hidden — see CONNECTORS_DOCK_TEMPORARILY_HIDDEN in model.ts.
    // if (activeDock === 'connectors') {
    //   return forceMode === 'sandbox' ? <SandboxConnectorsSurface /> : <ConnectorIntelligenceClient />
    // }
    if (activeDock === 'proof')
      return (
        <EvidenceSurface initialBatchId={sharedBatchId} />
      )
    if (activeDock === 'billing') {
      return <BillingSurface onActivateClick={() => setActivateWizardOpen(true)} />
    }
    if (activeDock === 'support') {
      return (
        <div>
          <SupportSurface initialAccountTab={scope.accountTab} />
        </div>
      )
    }
    return <ProofSurface />
  }, [
    activeDock,
    activeTab,
    askZord,
    forceMode,
    scope.batchId,
    scope.clientBatchId,
    scope.accountTab,
    sharedBatchId,
    handleTabChange,
    home,
    workspace,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <EnvironmentProvider routeMode={forceMode}>
      <main
        className={`payout-command-console min-h-screen ${PAYOUT_PAGE_BG_CLASS}`}
        style={{ fontFamily: DASHBOARD_FONT_STACK }}
      >
        <div className={PAYOUT_CONSOLE_CARD_CLASS}>
          <PayoutConsoleNavStack
            activeDock={activeDock}
            onDockChange={handleDockChange}
            onActivateClick={() => setActivateWizardOpen(true)}
            showSandboxStrip={forceMode === 'sandbox'}
          />

          <section
            className={`relative ${activeDock === 'workspace' ? 'px-3 py-3 sm:px-4 sm:py-4 lg:px-5' : 'p-4 sm:p-5 lg:p-6'}`}
          >
            <PayoutPageActionsProvider>
              <PageHeader
                pageEyebrow={pageHeaderMeta.pageEyebrow}
                pageTitle={pageHeaderMeta.pageTitle}
                pageSubtitle={pageHeaderMeta.pageSubtitle}
                onAskZordToggle={handleAskZordToggle}
                hideAskZordButton={activeDock === 'workspace'}
              />

              {surfaceBody}
            </PayoutPageActionsProvider>

            {activeDock !== 'workspace' ? (
              <AskZordPanel
                isOpen={askZord.isOpen}
                close={askZord.close}
                input={askZord.input}
                setInput={askZord.setInput}
                status={askZord.status}
                response={askZord.response}
                lastUserPrompt={askZord.lastUserPrompt}
                archivedTurns={askZord.archivedTurns}
                onSubmit={() => handleAskZordQuickPrompt(askZord.input)}
                onQuickPrompt={handleAskZordQuickPrompt}
              />
            ) : null}
          </section>
        </div>
      </main>
      {activateWizardOpen ? (
        <ActivateLiveWizard onClose={() => setActivateWizardOpen(false)} />
      ) : null}
      {forceMode === 'sandbox' ? <SandboxSetupGuidePanel /> : null}
    </EnvironmentProvider>
  )
}
