'use client'

import { useParams } from 'next/navigation'
import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { ExceptionWorkbenchSurface } from '@/features/control-plane/ExceptionWorkbenchSurface'
import { CROSS_BORDER_EXCEPTION_ID } from '@/services/payout-command/demo/scenarioMode'

export default function ExceptionPage() {
  const params = useParams()
  const exceptionId =
    typeof params?.exception_id === 'string' ? params.exception_id : CROSS_BORDER_EXCEPTION_ID
  return (
    <ControlPlaneShell>
      <ExceptionWorkbenchSurface exceptionId={exceptionId} />
    </ControlPlaneShell>
  )
}
