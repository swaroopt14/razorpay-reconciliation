'use client'

import { useParams } from 'next/navigation'
import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { DispatchControlSurface } from '@/features/control-plane/DispatchControlSurface'
import { CROSS_BORDER_TRACE_ID } from '@/services/payout-command/demo/scenarioMode'

export default function DispatchPage() {
  const params = useParams()
  const traceId =
    typeof params?.trace_id === 'string' ? params.trace_id : CROSS_BORDER_TRACE_ID
  return (
    <ControlPlaneShell>
      <DispatchControlSurface traceId={traceId} />
    </ControlPlaneShell>
  )
}
