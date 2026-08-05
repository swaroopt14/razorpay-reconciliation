'use client'

import Link from 'next/link'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { useZordProcessingIntentCount } from '../billing/useZordProcessingIntentCount'
import { Glyph, LiveDataHint } from '../shared'

const SANDBOX_DAILY_INTENT_LIMIT = 10

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: '/mo',
    features: ['Sandbox-only access', '10 intents/day', 'Email support', 'Postman + OpenAPI'],
    cta: 'Current plan',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '—',
    cadence: '',
    features: ['Higher intent volume', 'Email + chat support', 'Basic analytics', 'Single workspace'],
    cta: 'Pricing set at activation',
    recommended: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '—',
    cadence: '',
    features: ['Team-scale volume', 'Phone support', 'Advanced analytics', 'Team seats', 'Priority routing'],
    cta: 'Pricing set at activation',
  },
] as const

const SHELL_CARD =
  'rounded-[12px] border border-slate-200/90 bg-white/95 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
const JOURNAL_PILL =
  'inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#000000] px-3.5 py-1.5 text-[14px] font-medium tracking-[0] text-[#000000] shadow-sm ring-1 ring-[#000000]/30'

export function BillingSurface({ onActivateClick }: { onActivateClick: () => void }) {
  const { mode, liveActivationStatus } = useEnvironment()
  const isSandbox = mode === 'sandbox'
  const inReview = liveActivationStatus === 'in_review'
  const { count: processingCount, loading: processingLoading, refresh: refreshProcessing } =
    useZordProcessingIntentCount(isSandbox)

  const processing = processingCount ?? 0
  const usagePct =
    isSandbox && processingCount !== null
      ? Math.min(100, Math.round((processing / SANDBOX_DAILY_INTENT_LIMIT) * 100))
      : null

  return (
    <div className="space-y-5">
      <div className={`${SHELL_CARD} px-3 py-2.5 sm:px-3.5`}>
        <h2 className={JOURNAL_PILL}>Billing · sandbox</h2>
        <p className={`mt-0.5 max-w-2xl ${HOME_BODY_IMPERIAL}`}>
          {isSandbox
            ? 'Sandbox is free. Plans, invoices, and payment stay static until you activate live.'
            : 'Manage your plan, payment method, and invoice history.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LiveDataHint isLive={isSandbox && !processingLoading && processingCount !== null} source="intent-engine" />
          {inReview ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[13px] font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              Activation in review
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className={`${COMMAND_CENTER_KPI_CARD} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#888888]">Current plan</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <h2 className={`text-[28px] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>Free</h2>
                  <span className="text-[15px] font-medium text-[#64748b]">· Sandbox</span>
                </div>
                <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
                  {SANDBOX_DAILY_INTENT_LIMIT} intents/day · sandbox-only · email support
                </p>
              </div>
              {!inReview ? (
                <button
                  type="button"
                  onClick={onActivateClick}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3.5 py-2 text-[14px] font-semibold text-white transition hover:bg-black"
                >
                  Activate to upgrade
                  <Glyph name="arrow-up-right" className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            {isSandbox ? (
              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                      Processing in Zord
                    </p>
                    <p className={`mt-1 text-[26px] font-semibold tabular-nums tracking-tight ${HOME_TITLE_BLACK}`}>
                      {processingLoading && processingCount === null ? '…' : processing}
                    </p>
                    <p className={`mt-0.5 ${HOME_BODY_IMPERIAL_SM}`}>
                      {processing === 1 ? 'intent' : 'intents'} in flight across recent batches (GET · intent engine)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={processingLoading}
                    onClick={() => void refreshProcessing()}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processingLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {usagePct !== null ? (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-medium text-[#64748b]">Sandbox daily cap (in-flight snapshot)</span>
                      <span className={`tabular-nums font-semibold ${HOME_TITLE_BLACK}`}>
                        {processing} / {SANDBOX_DAILY_INTENT_LIMIT}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usagePct >= 90 ? 'bg-amber-500' : 'bg-black'
                        }`}
                        style={{ width: `${usagePct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">
                      Cap applies to sandbox ingest volume, not billing charges. Resets at midnight IST.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link
                href={isSandbox ? '/sandbox?dock=grid' : '/payout-command-view/today?dock=grid'}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Intent Journal
              </Link>
              <Link
                href={payoutBatchCommandCenterHref(isSandbox)}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Batch Command Center
              </Link>
            </div>
          </section>

          <section>
            <h3 className={`mb-3 text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>Plan options</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === 'free'
                return (
                  <article
                    key={plan.id}
                    className={`flex flex-col rounded-2xl border p-5 ${
                      isCurrent
                        ? 'border-[#0f172a] bg-white ring-2 ring-[#0f172a]/10'
                        : 'border-slate-200/90 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>{plan.name}</p>
                      {'recommended' in plan && plan.recommended ? (
                        <span className="rounded-full border border-black/30 bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                          Recommended
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="rounded-full bg-[#0f172a] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <p className={`text-[26px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>{plan.price}</p>
                      <p className="text-[14px] text-[#64748b]">{plan.cadence}</p>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-[14px] text-[#475569]">
                          <Glyph name="check" className="mt-0.5 h-3 w-3 shrink-0 text-black" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-auto pt-4 text-[13px] text-[#94a3b8]">{plan.cta}</p>
                  </article>
                )
              })}
            </div>
          </section>

          <section className={`${SHELL_CARD} overflow-hidden`}>
            <header className="border-b border-slate-200/90 px-5 py-3">
              <p className={`text-[16px] font-semibold ${HOME_TITLE_BLACK}`}>Invoice history</p>
              <p className={`mt-0.5 ${HOME_BODY_IMPERIAL_SM}`}>No charges in sandbox mode.</p>
            </header>
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-[#94a3b8]">No invoices yet — your sandbox is free.</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <article className={`${SHELL_CARD} p-5`}>
            <p className={`text-[16px] font-semibold ${HOME_TITLE_BLACK}`}>Payment method</p>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Add when you activate live. Sandbox needs no card.</p>
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-[#fafafa] p-4">
              <div className="flex items-center gap-3">
                <CardLogoStack />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#475569]">No card on file</p>
                  <p className="text-[12px] text-[#94a3b8]">Visa, Mastercard, Amex accepted</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onActivateClick}
              disabled={inReview}
              className="mt-3 inline-flex w-full items-center justify-between rounded-[8px] border border-[#0f172a] bg-white px-3 py-2 text-[14px] font-medium text-[#0f172a] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inReview ? 'In review · ~24h' : 'Add payment method'}
              <Glyph name="arrow-up-right" className="h-3 w-3" />
            </button>
          </article>

          <article className={`${SHELL_CARD} p-5`}>
            <p className={`text-[16px] font-semibold ${HOME_TITLE_BLACK}`}>Billing contact</p>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Where invoices and payment receipts are sent.</p>
            <div className="mt-3 space-y-1">
              <p className={`text-[14px] ${HOME_TITLE_BLACK}`}>—</p>
              <p className="text-[12px] text-[#94a3b8]">No billing contact on file</p>
            </div>
            <button
              type="button"
              disabled
              className="mt-3 inline-flex w-full items-center justify-between rounded-[8px] border border-slate-200 bg-[#fafafa] px-3 py-2 text-[14px] font-medium text-[#94a3b8]"
            >
              Edit contact
              <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-[#475569]">
                Soon
              </span>
            </button>
          </article>
        </aside>
      </div>
    </div>
  )
}

function CardLogoStack() {
  return (
    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-[6px] border border-[#E5E5E5] bg-white">
      <span className="rounded-[2px] bg-[#1A1F71] px-1 py-0.5 font-mono text-[11px] font-bold tracking-wider text-white">
        VISA
      </span>
    </div>
  )
}
