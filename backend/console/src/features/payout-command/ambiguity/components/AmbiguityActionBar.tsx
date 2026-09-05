'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ambiguityCopy } from '../copy/ambiguityCopy'

export function AmbiguityActionBar() {
  const pathname = usePathname()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`${pathname}?dock=grid`}
        className="rounded-full bg-neutral-100 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-black transition hover:bg-neutral-200"
      >
        {ambiguityCopy.actions.reviewUnclear}
      </Link>
      <Link
        href={`${pathname}?dock=grid`}
        className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-600 transition hover:bg-slate-50"
      >
        {ambiguityCopy.actions.openMissingRefs}
      </Link>
      <button
        type="button"
        onClick={async () => {
          const res = await fetch('/api/prod/exports/review-list', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          })
          const body = await res.json().catch(() => ({}))
          setMessage(body.message || ambiguityCopy.actions.exportPending)
        }}
        className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-600 transition hover:bg-slate-50"
      >
        {ambiguityCopy.actions.exportList}
      </button>
      {message ? <p className="w-full text-[12px] text-black">{message}</p> : null}
    </div>
  )
}
