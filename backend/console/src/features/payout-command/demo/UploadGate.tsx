'use client'

import type { ReactNode } from 'react'
import type { DemoBatchRequire } from '@/services/payout-command/demo/demoBatchReadiness'

type UploadGateProps = {
  require?: DemoBatchRequire
  title?: string
  children: ReactNode
}

/** Demo fixtures are hardcoded — always render children. */
export function UploadGate({ children }: UploadGateProps) {
  return <>{children}</>
}
