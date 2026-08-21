'use client'

import { DeferredCapabilitySurface } from './DeferredCapabilitySurface'

/** Live V1: post-disbursal monitoring is deferred (CON-P1-36 / CON-P1-38). */
export function PostDisbursalMonitoringSurface() {
  return (
    <DeferredCapabilitySurface
      title="Post-Disbursal Monitoring"
      capability="Post-disbursal monitoring"
    />
  )
}
