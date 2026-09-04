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
    <section className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#E5E5E5] bg-[#111111] px-4 py-3.5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {evidenceCopy.graph.verifyTitle}
        </p>
        <p className="mt-1 text-[14px] font-semibold tracking-tight">Recompute Merkle root from lineage</p>
      </div>

      <div className="space-y-3 p-4">
        <button
          type="button"
          disabled={busy}
          onClick={onVerify}
          className={`group relative w-full overflow-hidden rounded-xl px-4 py-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            busy
              ? 'border border-[#E5E5E5] bg-[#f4f4f5] text-[#111111]'
              : 'bg-[#111111] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:bg-[#222222] active:scale-[0.99]'
          }`}
        >
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#111111]/25 border-t-[#111111]" />
                {evidenceCopy.graph.verifyBusy}
              </>
            ) : (
              <>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px]">
                  ✓
                </span>
                {evidenceCopy.verify.button}
              </>
            )}
          </span>
        </button>

        {error && !result ? (
          <div className="rounded-xl border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2.5 text-[12px] font-medium text-[#0B1324]">
            {error}
          </div>
        ) : null}

        {result ? (
          <div
            className={`overflow-hidden rounded-xl border ${
              verified
                ? 'border-[#bbf7d0] bg-[#f0fdf4]'
                : corrupted
                  ? 'border-[#fecaca] bg-[#fef2f2]'
                  : 'border-[#fde68a] bg-[#fffbeb]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/5 px-3 py-2.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  verified
                    ? 'border-[#86efac] bg-white text-[#14532d]'
                    : corrupted
                      ? 'border-[#fca5a5] bg-white text-[#991b1b]'
                      : 'border-[#fcd34d] bg-white text-[#92400e]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    verified ? 'bg-[#15803D]' : corrupted ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'
                  }`}
                  aria-hidden
                />
                {verified
                  ? evidenceCopy.graph.verified
                  : corrupted
                    ? evidenceCopy.graph.corrupted
                    : result.status}
              </span>
              <span className="text-[11px] font-medium text-[#555555]">
                {new Date(result.checked_at).toLocaleString()}
              </span>
            </div>

            <div className="space-y-3 px-3 py-3">
              <p
                className={`text-[13px] leading-relaxed ${
                  verified ? 'text-[#14532d]' : corrupted ? 'text-[#7f1d1d]' : 'text-[#78350f]'
                }`}
              >
                {result.explanation}
              </p>

              <dl className="overflow-hidden rounded-[10px] border border-black/10 bg-white">
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-b border-[#EFEFEF] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold text-[#666666]">Stored root</dt>
                  <dd
                    className="truncate font-mono text-[12px] font-semibold text-[#111111]"
                    title={result.stored_root}
                  >
                    {shortHash(result.stored_root)}
                  </dd>
                </div>
                {result.computed_root ? (
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-b border-[#EFEFEF] px-3 py-2.5">
                    <dt className="text-[11px] font-semibold text-[#666666]">Computed</dt>
                    <dd
                      className="truncate font-mono text-[12px] font-semibold text-[#111111]"
                      title={result.computed_root}
                    >
                      {shortHash(result.computed_root)}
                    </dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-3 py-2.5">
                  <dt className="text-[11px] font-semibold text-[#666666]">Match</dt>
                  <dd className="text-[12px] font-semibold text-[#111111]">
                    {verified ? 'Roots identical' : corrupted ? 'Roots diverge' : 'See status'}
                  </dd>
                </div>
              </dl>

              <div className="rounded-[10px] bg-[#111111] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Full stored root</p>
                <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[#e4e4e7]">
                  {result.stored_root || '-'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[#d4d4d8] bg-[#fafafa] px-3 py-3 text-center text-[12px] leading-relaxed text-[#555555]">
            Run verification to compare the stored Merkle root against a recomputed digest from lineage leaves.
          </p>
        )}
      </div>
    </section>
  )
}
