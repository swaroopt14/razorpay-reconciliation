'use client'

import { ControlPlaneShell } from '@/features/control-plane/ControlPlaneShell'
import { AgentRegistrySurface } from '@/features/control-plane/AgentRegistrySurface'

export default function AgentsPage() {
  return (
    <ControlPlaneShell>
      <AgentRegistrySurface />
    </ControlPlaneShell>
  )
}
