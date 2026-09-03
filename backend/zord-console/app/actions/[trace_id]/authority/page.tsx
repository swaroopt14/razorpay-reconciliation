'use client'

import { useParams } from 'next/navigation'
import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { AuthorityConsoleSurface } from '@/features/control-plane/AuthorityConsoleSurface'
import { CROSS_BORDER_TRACE_ID } from '@/services/payout-command/demo/scenarioMode'

export default function AuthorityPage() {
  const params = useParams()
  const traceId =
    typeof params?.trace_id === 'string' ? params.trace_id : CROSS_BORDER_TRACE_ID
  return (
    <ControlPlaneShell>
      <AuthorityConsoleSurface traceId={traceId} />
    </ControlPlaneShell>
  )
}
