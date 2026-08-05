'use client'

import { useCallback, useState } from 'react'
import { evidenceCopy } from '../copy/evidenceCopy'
import { postEvidencePackVerify } from '@/services/payout-command/prod-api/postEvidencePackVerify'
import type { EvidencePackVerifyResponse } from '@/services/payout-command/prod-api/evidenceTypes'

function shortHash(h: string): string {
  const t = h.trim()
  if (t.length <= 18) return t
  return `${t.slice(0, 10)}…${t.slice(-8)}`
}

export function EvidencePackVerifyCard({ packId }: { packId: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EvidencePackVerifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onVerify = useCallback(() => {
    setBusy(true)
    setError(null)
    void postEvidencePackVerify(packId).then((res) => {
      if (res.data) {
        setResult(res.data)
        if (!res.ok) setError(res.error ?? res.data.explanation)
      } else {
        setResult(null)
        setError(res.error ?? 'Verification failed')
      }
      setBusy(false)
    })
  }, [packId])

  const verified = result?.status?.toUpperCase() === 'VERIFIED'
  const corrupted = result?.status?.toUpperCase() === 'CORRUPTED'

  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {evidenceCopy.graph.verifyTitle}
      </h2>
      <button
        type="button"
        disabled={busy}
        onClick={onVerify}
        className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-900 transition hover:bg-white disabled:opacity-60"
      >
        {busy ? evidenceCopy.graph.verifyBusy : evidenceCopy.verify.button}
      </button>
      {error && !result ? (
        <p className="mt-3 text-[13px] text-red-800">{error}</p>
      ) : null}
      {result ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-3 text-[13px] ${
            verified
              ? 'border-black/30 bg-neutral-100 text-black'
              : corrupted
                ? 'border-red-200 bg-red-50 text-red-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <p className="font-bold uppercase tracking-wide">
            {verified ? evidenceCopy.graph.verified : corrupted ? evidenceCopy.graph.corrupted : result.status}
          </p>
          <p className="mt-2 leading-relaxed">{result.explanation}</p>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
            <div>
              <dt className="text-slate-500">Stored root</dt>
              <dd className="break-all" title={result.stored_root}>
                {shortHash(result.stored_root)}
              </dd>
            </div>
            {result.computed_root ? (
              <div>
                <dt className="text-slate-500">Computed root</dt>
                <dd className="break-all" title={result.computed_root}>
                  {shortHash(result.computed_root)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Checked at</dt>
              <dd>{new Date(result.checked_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  )
}
