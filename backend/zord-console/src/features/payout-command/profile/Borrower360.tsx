'use client'

import { DeferredCapabilitySurface } from '../surfaces/DeferredCapabilitySurface'

/** Live V1: mock borrower/loan 360 profiles are sandbox-only (CON-P1-36). */
export function BorrowerProfilePage({ onBack }: { borrowerId: string; onBack: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-[13px] font-semibold text-slate-600">
        Back
      </button>
      <DeferredCapabilitySurface title="Borrower profile" capability="Borrower 360" />
    </div>
  )
}

export function LoanProfilePage({ onBack }: { loanId: string; onBack: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-[13px] font-semibold text-slate-600">
        Back
      </button>
      <DeferredCapabilitySurface title="Loan profile" capability="Loan 360" />
    </div>
  )
}
