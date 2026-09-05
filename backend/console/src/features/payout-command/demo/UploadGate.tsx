'use client'

import type { ReactNode } from 'react'
import {
  useDemoBatchReady,
  type DemoBatchRequire,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { AwaitingUploadsEmptyState } from './AwaitingUploadsEmptyState'

type UploadGateProps = {
  require?: DemoBatchRequire
  title?: string
  children: ReactNode
}

/**
 * Hides catalog / fixture payout data until the matching upload exists.
 * Intent journal talks to ingest APIs (empty after login). Control-plane
 * Dispatch still talks to the protocol catalog (always populated) — this gate
 * keeps those surfaces aligned.
 */
export function UploadGate({
  require = 'intent',
  title = 'No payment obligations yet',
  children,
}: UploadGateProps) {
  const { ready, readiness, require: req } = useDemoBatchReady(undefined, { require })
  if (!ready) {
    return (
      <div className="p-6">
        <AwaitingUploadsEmptyState title={title} readiness={readiness} require={req} />
      </div>
    )
  }
  return <>{children}</>
}
