'use client'

import type { AskZordState } from '../hooks/useAskZordState'
import { AskZordWorkspaceLayout } from '../workspace/AskZordWorkspaceLayout'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'

export function WorkspaceSurface({
  askZord,
  batchId,
}: {
  askZord: AskZordState
  batchId?: string
}) {
  const { tenantReady } = useSessionTenant()

  useRegisterPayoutPageActions({
    refresh: tenantReady ? () => askZord.dismissResponse() : undefined,
    refreshing: askZord.status === 'loading',
  })

  return (
    <div className="-mx-1 sm:-mx-2 lg:-mx-3">
      <div className="mt-2 rounded-2xl bg-white" data-testid="workspace-surface">
        <AskZordWorkspaceLayout askZord={askZord} batchId={batchId} />
      </div>
    </div>
  )
}
