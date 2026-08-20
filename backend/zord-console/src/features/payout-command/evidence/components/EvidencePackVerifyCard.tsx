'use client'

import { useCallback, useState } from 'react'
import { evidenceCopy } from '../copy/evidenceCopy'
import { postEvidencePackVerify } from '@/services/payout-command/prod-api/postEvidencePackVerify'
import type { EvidencePackVerifyResponse } from '@/services/payout-command/prod-api/evidenceTypes'
import {
  parseLayeredVerification,
  type LayeredVerification,
} from '@/services/payout-command/prod-api/layeredVerification'

function shortHash(h: string): string {
  const t = h.trim()
  if (t.length <= 18) return t
  return `${t.slice(0, 10)}…${t.slice(-8)}`
}

function layerTone(status: string): string {
  if (status === 'PASSED') return 'text-slate-900'
  if (status === 'FAILED') return 'text-red-800'
  return 'text-amber-800'
}

function overallTone(verification: LayeredVerification): string {
  if (verification.allowsVerifiedClaim) return 'border-black/30 bg-neutral-100 text-black'
  if (verification.overallStatus === 'CORRUPTED' || verification.overallStatus === 'COMPROMISED') {
    return 'border-red-200 bg-red-50 text-red-950'
  }
  return 'border-amber-200 bg-amber-50 text-amber-950'
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

  const layered = result ? parseLayeredVerification(result) : null

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
      {layered ? (
        <div className={`mt-3 rounded-lg border px-3 py-3 text-[13px] ${overallTone(layered)}`}>
          <p className="font-bold uppercase tracking-wide">{layered.overallLabel}</p>
          <p className="mt-2 leading-relaxed">{layered.explanation}</p>
          <ul className="mt-3 space-y-2">
            {layered.layers.map((layer) => (
              <li key={layer.id} className="rounded-md border border-black/10 bg-white/70 px-2 py-2">
                <p className={`text-[12px] font-semibold ${layerTone(layer.status)}`}>
                  {layer.label}: {layer.status}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">{layer.explanation}</p>
                {layered.checkedAt ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Checked {new Date(layered.checkedAt).toLocaleString()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
            {layered.verificationRunId ? (
              <div>
                <dt className="text-slate-500">Verification run</dt>
                <dd className="break-all">{layered.verificationRunId}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Stored root</dt>
              <dd className="break-all" title={layered.storedRoot}>
                {shortHash(layered.storedRoot)}
              </dd>
            </div>
            {layered.computedRoot ? (
              <div>
                <dt className="text-slate-500">Computed root</dt>
                <dd className="break-all" title={layered.computedRoot}>
                  {shortHash(layered.computedRoot)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Checked at</dt>
              <dd>{layered.checkedAt ? new Date(layered.checkedAt).toLocaleString() : 'unavailable'}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  )
}
