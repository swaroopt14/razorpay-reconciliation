'use client'

import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { ActionDeskSurface } from '@/features/control-plane/ActionDeskSurface'

export default function ActionDeskPage() {
  return (
    <ControlPlaneShell>
      <ActionDeskSurface />
    </ControlPlaneShell>
  )
}
