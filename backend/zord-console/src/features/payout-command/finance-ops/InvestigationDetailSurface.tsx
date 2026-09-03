'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getFinanceInvestigations, getFinancePayment } from '@/services/payout-command/prod-api/financeApi'
import type { FinanceInvestigation, FinancePayment } from '@/services/payout-command/prod-api/financeTypes'
import {
  RZ_CARD,
  RZ_MUTED,
  RZ_PAGE,
  RZ_WRAP,
} from './razorpayChrome'
import { formatPaise, reasonTitle } from './reasonCopy'

const AGENT_STEPS = [
  'Payment retrieved',
  'Payment events checked',
  'Settlement searched',
  'Bank transactions searched',
  'Refund searched',
  'Ledger checked',
  'Evidence verified',
]

function verdictTone(verdict: string) {
  const v = verdict.toUpperCase()
  if (v === 'SUPPORTED') return 'text-[#C0372A]'
  if (v === 'CONTRADICTED') return 'text-[#147A3F]'
  if (v === 'POSSIBLE') return 'text-[#B36B00]'
  return 'text-[#64748B]'
}

function verdictMark(verdict: string) {
  const v = verdict.toUpperCase()
  if (v === 'SUPPORTED') return '⚠'
  if (v === 'CONTRADICTED') return '✓'
  if (v === 'POSSIBLE') return '?'
  return '·'
}

function defaultHypotheses(reason: string): Array<{ claim: string; verdict: string }> {
  if (reason === 'failed_with_bank_movement' || reason === 'payout_failed_with_bank_movement') {
    return [
      { claim: 'Payment settled', verdict: 'CONTRADICTED' },
      { claim: 'Payment refunded', verdict: 'CONTRADICTED' },
      { claim: 'Bank transaction unrelated', verdict: 'POSSIBLE' },
      { claim: 'Unexplained financial movement', verdict: 'SUPPORTED' },
    ]
  }
  return [{ claim: 'Needs finance review', verdict: 'SUPPORTED' }]
}

export function InvestigationDetailSurface({ investigationId }: { investigationId: string }) {
  const [row, setRow] = useState<FinanceInvestigation | null>(null)
  const [payment, setPayment] = useState<FinancePayment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const list = await getFinanceInvestigations()
      if (cancelled) return
      if (!list.ok || !list.data) {
        setError('Could not load investigation.')
        setLoading(false)
        return
      }
      const hit =
        (list.data.investigations ?? []).find((r) => r.id === investigationId) ||
        (list.data.investigations ?? []).find((r) => r.entity_id === investigationId) ||
        (list.data.investigations ?? [])[0] ||
        null
      setRow(hit)
      if (hit?.entity_id) {
        const pay = await getFinancePayment(hit.entity_id)
        if (!cancelled && pay.ok) setPayment(pay.data)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [investigationId])

  const title = useMemo(() => {
    if (row?.issue) return row.issue
    const reason = payment?.reconciliation?.reason || ''
    if (reason === 'failed_with_bank_movement') return 'Failed payment with unexplained bank movement'
    return reasonTitle(reason || row?.root_cause || 'Investigation')
  }, [row, payment])

  const amount = payment?.amount_minor ?? row?.financial_impact ?? 0
  const movement = payment?.financial_movement
  const recon = payment?.reconciliation
  const provider = (payment?.provider_status || 'failed').toUpperCase()
  const hasBank = Boolean(movement?.bank) || recon?.bank_credit_proven
  const hasSettlement = movement?.settlement != null && movement.settlement > 0
  const hasRefund = movement?.refund != null && movement.refund > 0
  const hypotheses = row?.hypotheses?.length
    ? row.hypotheses
    : defaultHypotheses(recon?.reason || '')

  const conclusion =
    row?.recommendation ||
    `${formatPaise(amount, 2)} remains financially unaccounted for. Permanent loss is not proven.`

  const complete = String(row?.status || '').toLowerCase() !== 'unresolved'

  return (
    <div className={RZ_PAGE}>
      <div className={`${RZ_WRAP} max-w-[820px]`}>
        <Link href="/investigations?demo=sandbox" className="text-[13px] font-medium text-[#528FF0] hover:underline">
          ← Investigations
        </Link>

        {loading ? (
          <p className={`mt-8 ${RZ_MUTED}`}>Loading investigation…</p>
        ) : error ? (
          <p className="mt-8 text-[13px] text-[#B91C1C]">{error}</p>
        ) : row ? (
          <div className="mt-4 space-y-5">
            <header>
              <p className="font-mono text-[13px] font-semibold text-[#528FF0]">{row.id}</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[#1A1A1A]">{title}</h1>
              <p className="mt-2 text-[32px] font-semibold tabular-nums tracking-tight text-[#1A1A1A]">
                {formatPaise(amount, 2)}
                <span className="ml-2 text-[14px] font-medium text-[#8F8F8F]">
                  {payment?.currency || 'INR'}
                </span>
              </p>
              <p className={`mt-1 ${RZ_MUTED}`}>
                {row.entity_type || 'payment'} · <span className="font-mono">{row.entity_id}</span>
                <span className="mx-1.5 text-[#D0D4DA]">·</span>
                Provider {provider}
                <span className="mx-1.5 text-[#D0D4DA]">·</span>
                Recon {recon?.result || 'UNRESOLVED'}
              </p>
            </header>

            <section className={`${RZ_CARD} px-5 py-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Agent status</p>
              <ul className="mt-4 space-y-2.5">
                {AGENT_STEPS.map((step) => (
                  <li key={step} className="flex items-center gap-2.5 text-[14px] text-[#0F172A]">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F8EE] text-[11px] font-bold text-[#147A3F]">
                      ✓
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
              <p
                className={`mt-5 rounded-[6px] px-3 py-2 text-[13px] font-semibold ${
                  complete ? 'bg-[#E8F8EE] text-[#147A3F]' : 'bg-[#FFF6E5] text-[#B36B00]'
                }`}
              >
                {complete ? 'Investigation complete' : 'Investigation in progress'}
              </p>
            </section>

            <section className={`${RZ_CARD} px-5 py-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                Financial timeline
              </p>
              <div className="mt-4 grid grid-cols-[112px_1fr] gap-x-4">
                <div>
                  <p className="text-[13px] font-semibold text-[#0F172A]">Payment</p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums">{formatPaise(amount, 2)}</p>
                </div>
                <ol className="relative border-l border-[#E6E8EB] pl-5">
                  <TimelineNode
                    label={provider}
                    tone="fail"
                    detail="Provider status unchanged"
                  />
                  <TimelineNode
                    label={hasSettlement ? `Settlement ${formatPaise(movement?.settlement, 2)}` : 'No settlement'}
                    tone={hasSettlement ? 'ok' : 'muted'}
                  />
                  <TimelineNode
                    label={
                      hasBank
                        ? `Bank +${formatPaise(movement?.bank ?? amount, 2)}`
                        : 'No bank movement'
                    }
                    tone={hasBank ? 'warn' : 'muted'}
                  />
                  <TimelineNode
                    label={hasRefund ? `Refund ${formatPaise(movement?.refund, 2)}` : 'No refund'}
                    tone={hasRefund ? 'ok' : 'muted'}
                    last
                  />
                </ol>
              </div>
            </section>

            <section className={`${RZ_CARD} px-5 py-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Hypotheses</p>
              <ul className="mt-3 divide-y divide-[#F1F5F9]">
                {hypotheses.map((h) => (
                  <li key={h.claim} className="flex items-start justify-between gap-4 py-3">
                    <p className="text-[14px] text-[#0F172A]">
                      <span className={`mr-2 font-semibold ${verdictTone(h.verdict)}`}>
                        {verdictMark(h.verdict)}
                      </span>
                      {h.claim}
                    </p>
                    <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] ${verdictTone(h.verdict)}`}>
                      {h.verdict}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={`${RZ_CARD} border-[#F6E7C1] bg-[#FFFEF8] px-5 py-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Conclusion</p>
              <p className="mt-2 text-[16px] font-semibold leading-snug text-[#1A1A1A]">{conclusion}</p>
              {row.root_cause ? (
                <p className="mt-3 text-[13px] leading-relaxed text-[#64748B]">{row.root_cause}</p>
              ) : null}
              <p className="mt-3 text-[12px] text-[#8F8F8F]">
                Do not rename the Razorpay provider status. Exposure {formatPaise(row.financial_impact, 2)} ·
                confidence {Math.round((row.confidence || 0) * 100)}%.
              </p>
            </section>
          </div>
        ) : (
          <p className={`mt-8 ${RZ_MUTED}`}>Investigation not found.</p>
        )}
      </div>
    </div>
  )
}

function TimelineNode({
  label,
  detail,
  tone,
  last,
}: {
  label: string
  detail?: string
  tone: 'ok' | 'fail' | 'warn' | 'muted'
  last?: boolean
}) {
  const dot =
    tone === 'ok'
      ? 'bg-[#16A34A]'
      : tone === 'fail'
        ? 'bg-[#C0372A]'
        : tone === 'warn'
          ? 'bg-[#D97706]'
          : 'bg-[#CBD5E1]'
  const text =
    tone === 'fail' ? 'text-[#C0372A]' : tone === 'warn' ? 'text-[#B36B00]' : tone === 'muted' ? 'text-[#94A3B8]' : 'text-[#0F172A]'
  return (
    <li className={`relative ${last ? 'pb-0' : 'pb-4'}`}>
      <span className={`absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full ${dot}`} />
      <p className={`text-[14px] font-semibold ${text}`}>{label}</p>
      {detail ? <p className="mt-0.5 text-[12px] text-[#8F8F8F]">{detail}</p> : null}
    </li>
  )
}
