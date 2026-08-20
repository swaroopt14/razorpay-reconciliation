'use client'

import { DeferredCapabilitySurface } from './DeferredCapabilitySurface'

/** Live V1: borrower verification is deferred (CON-P1-36 / CON-P1-38). Mock data stays sandbox-only. */
export function BorrowerVerificationSurface() {
  return (
    <DeferredCapabilitySurface
      title="Borrower Verification"
      capability="Borrower verification"
    />
  )
}
