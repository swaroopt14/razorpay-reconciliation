'use client'

import { useParams } from 'next/navigation'
import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { SignalMeshSurface } from '@/features/control-plane/SignalMeshSurface'
import { CROSS_BORDER_TRACE_ID } from '@/services/payout-command/demo/scenarioMode'

export default function SignalsPage() {
  const params = useParams()
  const traceId =
    typeof params?.trace_id === 'string' ? params.trace_id : CROSS_BORDER_TRACE_ID
  return (
    <ControlPlaneShell>
      <SignalMeshSurface traceId={traceId} />
    </ControlPlaneShell>
  )
}
