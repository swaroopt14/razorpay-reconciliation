'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createFinanceInvestigation,
  getFinancePayment,
  getFinanceRefunds,
  getFinanceSettlements,
} from '@/services/payout-command/prod-api/financeApi'
import type {
  FinanceInvestigation,
  FinancePayment,
  FinanceRefund,
  FinanceSettlementLine,
} from '@/services/payout-command/prod-api/financeTypes'
import {
  formatPaise,
  reconLabel,
  settlementPill,
} from './reasonCopy'
import { PaymentLifecycleStrip, buildLifecycleSteps } from './PaymentLifecycleStrip'
import { ErrorInvestigationPanel } from './ErrorInvestigationPanel'
import { buildRazorpayXError } from './razorpayXErrors'
import { PayoutLifecycleView } from './PayoutLifecycleView'
import { buildPayoutLifecycle } from './payoutLifecycleModel'
import type { PayoutReconDisplayRow } from './payoutReconCopy'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-[#F1F5F9] py-2.5 text-[13px]">
      <dt className="text-[#64748B]">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-[#0F172A]">{children}</dd>
    </div>
  )
}

function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (s === 'failed' || s === 'cancelled' || s === 'rejected') return 'bg-[#FEF2F2] text-[#B91C1C]'
  if (s === 'captured' || s === 'processed' || s === 'settled') return 'bg-[#F0FDF4] text-[#15803D]'
  if (s === 'authorized' || s === 'created' || s === 'processing') return 'bg-[#EEF4FF] text-[#1D4ED8]'
  return 'bg-[#F1F5F9] text-[#475569]'
}

function reconTone(result: string): string {
  const r = result.toUpperCase()
  if (r === 'MATCHED') return 'bg-[#F0FDF4] text-[#15803D]'
  if (r === 'UNRESOLVED' || r === 'CONFLICTED' || r === 'VARIANCE') return 'bg-[#FFF7ED] text-[#C2410C]'
  if (r === 'AMBIGUOUS') return 'bg-[#EEF4FF] text-[#1D4ED8]'
  return 'bg-[#F1F5F9] text-[#475569]'
}

function pillToneClass(tone: string): string {
  if (tone === 'processed') return 'bg-[#F0FDF4] text-[#15803D]'
  if (tone === 'pending') return 'bg-[#EEF4FF] text-[#1D4ED8]'
  if (tone === 'review') return 'bg-[#FFFBEB] text-[#B45309]'
  return 'bg-[#FEF2F2] text-[#B91C1C]'
}

function movementValue(amount: number | null | undefined, missingLabel: string) {
  if (amount == null) return <span className="text-[#94A3B8]">{missingLabel}</span>
  return formatPaise(amount)
}

export function PaymentDrawer({
  entityId,
  exceptionId,
  onClose,
}: {
  entityId: string
  exceptionId?: string
  onClose: () => void
}) {
  const [payment, setPayment] = useState<FinancePayment | null>(null)
  const [refunds, setRefunds] = useState<FinanceRefund[]>([])
  const [settlements, setSettlements] = useState<FinanceSettlementLine[]>([])
  const [investigation, setInvestigation] = useState<FinanceInvestigation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [investigating, setInvestigating] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setInvestigation(null)
    setPayment(null)

    async function load() {
      const pay = await getFinancePayment(entityId)
      if (cancelled) return
      if (!pay.ok || !pay.data) {
        if (pay.status === 404) {
          setPayment(null)
          setError(null)
          setLoading(false)
          return
        }
        setError('Could not load payment.')
        setLoading(false)
        return
      }
      setPayment(pay.data)
      const [ref, setl] = await Promise.all([
        getFinanceRefunds(entityId),
        getFinanceSettlements(entityId),
      ])
      if (cancelled) return
      setRefunds(ref.data?.refunds ?? [])
      setSettlements(setl.data?.settlements ?? [])
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [entityId])

  const recon = payment?.reconciliation
  const pill = settlementPill({
    result: recon?.result,
    reason: recon?.reason,
    bankProven: recon?.bank_credit_proven,
  })
  const movement = payment?.financial_movement
  const hasBank =
    (movement?.bank != null && movement.bank > 0) ||
    Boolean(recon?.bank_credit_proven) ||
    (payment?.observations ?? []).some((o) => o.source.includes('bank'))
  const hasRefund = refunds.length > 0 || (movement?.refund != null && movement.refund > 0)
  const hasSettlement = settlements.length > 0 || (movement?.settlement != null && movement.settlement > 0)

  const steps = useMemo(
    () =>
      buildLifecycleSteps({
        observations: payment?.observations,
        providerStatus: payment?.provider_status,
        reason: recon?.reason,
        hasSettlement,
        hasRefund,
        hasBank,
      }),
    [payment, recon?.reason, hasSettlement, hasRefund, hasBank],
  )

  async function runInvestigate() {
    setInvestigating(true)
    const rec = await createFinanceInvestigation({
      exception_id: exceptionId,
      entity_id: entityId,
      payment_id: entityId,
    })
    setInvestigating(false)
    if (rec.ok && rec.data) setInvestigation(rec.data)
  }

  const reconRow: PayoutReconDisplayRow | null = payment
    ? {
        payoutId: payment.payment_id,
        status: payment.provider_status,
        amountMinor: payment.amount_minor,
        utr: '—',
        errorCode: recon?.reason || payment.provider_status,
        errorDescription: recon?.reason || '',
        signalSource: 'business',
        evidence: '',
        nextSteps: '—',
        result: recon?.result || 'UNRESOLVED',
        reason: recon?.reason || payment.provider_status,
        contact: payment.order_id || '—',
        varianceMinor: recon?.variance_amount || 0,
        settlement: hasSettlement,
        bank: hasBank,
        mode: payment.method,
        paymentProvider: payment.provider,
        currency: payment.currency,
      }
    : null
  const life = reconRow ? buildPayoutLifecycle(reconRow) : null

  const processedBy =
    payment?.notes?.processed_by ||
    (payment?.method?.includes('optimizer') ? payment.method : null)

  return (
    <aside
      className="flex h-full min-h-[calc(100dvh-7rem)] w-full flex-col border-l border-[#E2E8F0] bg-white xl:max-w-[560px]"
      aria-label="Transaction lifecycle"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Transaction lifecycle</p>
          <h2 className="mt-1 font-mono text-[15px] font-semibold text-[#0F172A]">{entityId}</h2>
          {payment ? (
            <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight text-[#0F172A]">
              {formatPaise(payment.amount_minor, 2)} {payment.currency}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-2 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A]"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="text-[13px] text-[#64748B]">Loading payment…</p>
        ) : error ? (
          <p className="text-[13px] text-[#B91C1C]">{error}</p>
        ) : !payment ? (
          <>
            <p className="text-[13px] leading-relaxed text-[#64748B]">
              This exception is not a Razorpay payment record. Investigate from the settlement or bank entity
              without inventing a payment status.
            </p>
            <ErrorInvestigationPanel
              errorView={buildRazorpayXError({
                reason: investigation?.root_cause || exceptionId || 'open_status_no_downstream',
                description: investigation?.root_cause,
                nextSteps: investigation?.recommendation,
                payoutId: entityId,
              })}
              financialImpactMinor={investigation?.financial_impact}
              confidence={investigation?.confidence}
              investigating={investigating}
              hasRun={Boolean(investigation)}
              onInvestigate={() => void runInvestigate()}
            />
          </>
        ) : payment ? (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex h-6 items-center px-2 text-[11px] font-semibold uppercase tracking-[0.04em] ${statusTone(payment.provider_status)}`}>
                {payment.provider_status}
              </span>
              <span className={`inline-flex h-6 items-center px-2 text-[11px] font-semibold uppercase tracking-[0.04em] ${reconTone(recon?.result ?? '')}`}>
                Reconciliation: {reconLabel(recon?.result)}
              </span>
            </div>

            <section className="mt-6">
              {life ? (
                <PayoutLifecycleView
                  life={life}
                  variant="drawer"
                  initialTab="events"
                  traceHref={`/reconciliation/${encodeURIComponent(payment.payment_id)}?demo=sandbox`}
                />
              ) : (
                <>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Lifecycle</h3>
                  <PaymentLifecycleStrip steps={steps} />
                </>
              )}
            </section>

            <section className="mt-2">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                Financial movement
              </h3>
              <dl>
                <Field label="Payment">{movementValue(movement?.payment ?? payment.amount_minor, 'Not found')}</Field>
                <Field label="Settlement">{movementValue(movement?.settlement, 'Not found')}</Field>
                <Field label="Bank">{movementValue(movement?.bank, 'Not found')}</Field>
                <Field label="Refund">{movementValue(movement?.refund, 'Not found')}</Field>
              </dl>
            </section>

            <section className="mt-5">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Attributes</h3>
              <dl>
                <Field label="Payment Id">{payment.payment_id}</Field>
                <Field label="Amount">{formatPaise(payment.amount_minor, 2)}</Field>
                <Field label="Payment method">{payment.method || '—'}</Field>
                <Field label="Order ID">{payment.order_id || '—'}</Field>
                <Field label="Gateway / Processed by">{processedBy || payment.provider || 'not in this phase'}</Field>
                <Field label="Created at">{payment.provider_created_at?.replace('T', ' ').replace('Z', ' UTC') || '—'}</Field>
                <Field label="Description">
                  {payment.notes?.description ||
                    (payment.notes && Object.keys(payment.notes).length
                      ? JSON.stringify(payment.notes)
                      : '—')}
                </Field>
                <Field label="Refunds">
                  {refunds.length === 0 ? 'No refunds issued yet' : `${refunds.length} refund(s)`}
                </Field>
                <Field label="Settlement">
                  <span className={`inline-flex h-6 items-center px-2 text-[11px] font-semibold ${pillToneClass(pill.tone)}`}>
                    {pill.label}
                  </span>
                </Field>
              </dl>
              <button
                type="button"
                className="mt-3 text-[13px] font-semibold text-[#2E5BFF] hover:underline"
                onClick={() => setDetailsOpen((v) => !v)}
              >
                {detailsOpen ? 'Hide settlement details' : 'View details'}
              </button>
              {detailsOpen ? (
                <div className="mt-3 space-y-2 border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[12px] text-[#334155]">
                  {settlements.length === 0 ? (
                    <p>No settlement line for this payment.</p>
                  ) : (
                    settlements.map((line) => (
                      <p key={`${line.settlement_id}-${line.utr}`}>
                        {line.settlement_id || 'line'} · UTR {line.utr || '—'} · {formatPaise(line.amount_minor)}
                        {line.on_hold ? ' · on hold' : ''}
                      </p>
                    ))
                  )}
                  {recon?.reason ? <p>Reason: {recon.reason}</p> : null}
                </div>
              ) : null}
            </section>

            <ErrorInvestigationPanel
              errorView={buildRazorpayXError({
                reason: recon?.reason || payment.provider_status,
                status: payment.provider_status,
                description: investigation?.root_cause || recon?.reason,
                nextSteps: investigation?.recommendation,
                payoutId: payment.payment_id,
              })}
              financialImpactMinor={investigation?.financial_impact ?? recon?.variance_amount ?? payment.amount_minor}
              confidence={investigation?.confidence ?? recon?.confidence}
              investigating={investigating}
              hasRun={Boolean(investigation)}
              onInvestigate={() => void runInvestigate()}
            />
          </>
        ) : null}
      </div>
    </aside>
  )
}
