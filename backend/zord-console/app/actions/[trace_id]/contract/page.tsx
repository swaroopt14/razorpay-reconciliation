'use client'

import { useParams } from 'next/navigation'
import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { PacCombinedSurface } from '@/features/control-plane/PacCombinedSurface'
import { CROSS_BORDER_TRACE_ID } from '@/services/payout-command/demo/scenarioMode'

export default function ContractPage() {
  const params = useParams()
  const traceId =
    typeof params?.trace_id === 'string' ? params.trace_id : CROSS_BORDER_TRACE_ID
  return (
    <ControlPlaneShell>
      <PacCombinedSurface traceId={traceId} focusSection="pac-contract" />
    </ControlPlaneShell>
  )
}
