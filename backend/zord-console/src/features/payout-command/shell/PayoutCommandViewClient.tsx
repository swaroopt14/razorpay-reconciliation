'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
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
import {
  AmbiguitySurface,
  BillingSurface,
  BorrowerVerificationSurface,
  EvidenceSurface,
  IntentJournalSurface,
  LeakageSurface,
  ProofSurface,
  PostDisbursalMonitoringSurface,
  SupportSurface,
  WorkspaceSurface,
} from '../surfaces'
import { SettlementJournalSurface as SettlementJournalV2Surface } from '../settlement-journal-v2/SettlementJournalSurface'
import { ActivateLiveWizard } from '../sandbox/ActivateLiveWizard'
import { SandboxSetupGuidePanel } from '../sandbox/SandboxSetupGuidePanel'
import { OperationsOverviewSurface } from '../overview/OperationsOverviewSurface'
import { ExceptionsSurface } from '../finance-ops/ExceptionsSurface'
import {
  PAYOUT_CONSOLE_CARD_CLASS,
  PAYOUT_PAGE_BG_CLASS,
} from '../command-center/homeCommandCenterTokens'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import {
  getActiveDemoBatchId,
  setActiveDemoBatchId,
  withDemoBatchScope,
} from '@/services/payout-command/demo/ycDemoConstants'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'

export type PayoutCommandScope = {
  batchId?: string
  clientBatchId?: string
  accountTab?: string
}

type PayoutCommandViewClientProps = {
  /** When set, pins sandbox vs live for this route (`/sandbox` vs `/today`). */
  forceMode?: EnvMode
  /**
    * Initial dock from the URL - must be resolved on the server (e.g. `searchParams.dock`)
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

  // ── Proof dock settlement gate (sandbox) ──────────────────────────────────
  const isSandbox = forceMode === 'sandbox'
  const {
    ready: proofSettlementReady,
    readiness: proofReadiness,
    require: proofRequire,
  } = useDemoBatchReady(undefined, {
    requireUploads: isSandbox,
    require: 'settlement',
  })

  const pageHeaderMeta = useMemo(() => {
    // Surfaces that render their own title/hero - shell PageHeader would double-banner.
    const ownsHeader =
      activeDock === 'home' || // Spec 7.2 Overview
      activeDock === 'grid' || // Spec 7.6 Intent Journal
      activeDock === 'settlement' || // Settlement Journal (JournalPageHeader)
      activeDock === 'exceptions' ||
      activeDock === 'workspace' // Ask Zord (canonical /ask also owns header)
    if (ownsHeader) {
      return { pageEyebrow: undefined, pageTitle: undefined, pageSubtitle: undefined }
    }
    const label = activeSurface.label
    const title = activeSurface.title
    const same = label.trim() === title.trim()
    return {
      pageEyebrow: same ? undefined : label,
      pageTitle: title,
      pageSubtitle: activeSurface.summary,
    }
  }, [activeDock, activeSurface])

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

  // Spec 7.16 canonical route is `/ask` - redirect legacy dock=workspace.
  useEffect(() => {
    if (activeDock !== 'workspace') return
    router.replace(withDemoBatchScope('/ask'))
  }, [activeDock, router])

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
        // Keep / restore batch scope so menus stay connected to the open batch.
        const batch =
          apiTrimmedString(params.get('batch_id')) ||
          apiTrimmedString(params.get('client_batch_id')) ||
          getActiveDemoBatchId()
        if (batch) {
          params.set('batch_id', batch)
          params.set('client_batch_id', batch)
          setActiveDemoBatchId(batch)
        }
        if (!params.get('demo')) params.set('demo', 'sandbox')
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
      return <OperationsOverviewSurface />
    }

    if (activeDock === 'workspace') {
      return (
        <div>
          <WorkspaceSurface askZord={askZord} batchId={sharedBatchId} />
        </div>
      )
    }

    if (activeDock === 'leakage') return <LeakageSurface initialBatchId={sharedBatchId} />
    if (activeDock === 'exceptions') {
      return (
        <Suspense fallback={<p className="p-6 text-[13px] text-[#64748B]">Loading exceptions…</p>}>
          <ExceptionsSurface />
        </Suspense>
      )
    }
    if (activeDock === 'ambiguity') return <AmbiguitySurface initialBatchId={sharedBatchId} />
    if (activeDock === 'verification') return <BorrowerVerificationSurface />
    if (activeDock === 'monitoring') return <PostDisbursalMonitoringSurface />
    if (activeDock === 'grid') return <IntentJournalSurface initialBatchId={scope.batchId} />
    if (activeDock === 'settlement') {
      // Spec 7.11 v2 batch-first journal (same as /settlement/journal) - not the legacy dock surface.
      return <SettlementJournalV2Surface />
    }
    if (activeDock === 'proof') {
      if (isSandbox && !proofSettlementReady) {
        return (
          <AwaitingUploadsEmptyState
            title="Evidence & proof unlock after settlement upload"
            readiness={proofReadiness}
            require={proofRequire}
          />
        )
      }
      return (
        <EvidenceSurface initialBatchId={sharedBatchId} />
      )
    }
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
    scope.batchId,
    scope.clientBatchId,
    scope.accountTab,
    sharedBatchId,
    handleTabChange,
    home,
    workspace,
    isSandbox,
    proofSettlementReady,
    proofReadiness,
    proofRequire,
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
            
          >
            <section
              className={`relative flex-1 ${
                activeDock === 'workspace'
                  ? 'px-3 py-3 sm:px-4 sm:py-4 lg:px-5'
                  : activeDock === 'exceptions'
                    ? 'p-0'
                    : 'p-4 sm:p-5 lg:p-6'
              }`}
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
          </PayoutConsoleNavStack>
        </div>
      </main>
      {activateWizardOpen ? (
        <ActivateLiveWizard onClose={() => setActivateWizardOpen(false)} />
      ) : null}
      {forceMode === 'sandbox' ? <SandboxSetupGuidePanel /> : null}
    </EnvironmentProvider>
  )
}
