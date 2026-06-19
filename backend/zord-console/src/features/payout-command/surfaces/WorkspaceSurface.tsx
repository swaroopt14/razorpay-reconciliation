'use client'

import { useCallback, useMemo } from 'react'
import { workspacePromptCopy, type WorkspaceTab } from '@/services/payout-command/model'
import type { WorkspaceState } from '../hooks/useWorkspaceState'
import { buildGroundedAnswerSnapshot } from '../workspace/buildGroundedAnswerSnapshot'
import { WorkspaceOperationsGrid } from '../workspace/WorkspaceOperationsGrid'
import { WorkspaceIntelligencePanel } from '../workspace/WorkspaceIntelligencePanel'
import { usePaymentOperationsView } from '../workspace/usePaymentOperationsView'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'

export function WorkspaceSurface({
  activeTab,
  setActiveTab,
  workspace,
  batchId,
}: {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  workspace: WorkspaceState
  batchId?: string
}) {
  const copy = workspacePromptCopy[activeTab]
  const { tenantReady } = useSessionTenant()
  const { viewModel, loading, refresh } = usePaymentOperationsView(batchId)
  const ingestIncomplete =
    viewModel.dataSources.intentStatus === 'missing' &&
    viewModel.dataSources.settlementStatus === 'missing'

  const handlePageRefresh = useCallback(async () => {
    await refresh()
    workspace.refreshStarterAnswer()
  }, [refresh, workspace])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: loading,
  })

  const groundedAnswer = useMemo(
    () =>
      buildGroundedAnswerSnapshot({
        lifecycle: viewModel.lifecycle,
        hasLiveData: viewModel.hasLiveData,
        matchConfidencePct: viewModel.matchConfidencePct,
        refCompletenessPct: viewModel.refCompletenessPct,
        reviewMinor: viewModel.reviewMinor,
        ambiguousCount: viewModel.ambiguousIntentCount,
        intentMissing: viewModel.hero.showIntentMissing,
        ingestIncomplete,
      }),
    [ingestIncomplete, viewModel],
  )

  return (
    <div className="-mx-1 sm:-mx-2 lg:-mx-3">
      <div className="mt-2 space-y-4 rounded-2xl bg-[#e8eef5] p-4" data-testid="workspace-surface">
        <div className="grid items-stretch gap-4 xl:grid-cols-[1.78fr_1.46fr]">
          <WorkspaceOperationsGrid viewModel={viewModel} loading={loading} />
          <WorkspaceIntelligencePanel
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            workspace={workspace}
            question={copy.question}
            supporting={copy.supporting}
            groundedAnswer={viewModel.hasLiveData && !ingestIncomplete ? groundedAnswer : ''}
          />
        </div>
      </div>
    </div>
  )
}
