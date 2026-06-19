'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { leakageCopy } from '../copy/leakageCopy'

export function LeakageActionBar() {
  const pathname = usePathname()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`${pathname}?dock=grid`}
        className="rounded-xl bg-slate-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-slate-800"
      >
        {leakageCopy.actions.openReview}
      </Link>
      <button
        type="button"
        onClick={async () => {
          const res = await fetch('/api/prod/exports/gap-report', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          })
          const body = await res.json().catch(() => ({}))
          setMessage(body.message || leakageCopy.actions.exportPending)
        }}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {leakageCopy.actions.exportGap}
      </button>
      <Link
        href="/payout-command-view/batch-command-center"
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {leakageCopy.actions.uploadSettlement}
      </Link>
      <Link
        href={`${pathname}?dock=ambiguity`}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-medium text-slate-600 hover:bg-slate-50"
      >
        {leakageCopy.linkMatching}
      </Link>
      {message ? <p className="w-full text-[12px] text-slate-500">{message}</p> : null}
    </div>
  )
}
