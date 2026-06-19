'use client'

import { DM_Mono } from 'next/font/google'
import { HOME_TITLE_BLACK } from '../command-center/homeCommandCenterTokens'
import { ZORD_SECTION_LABEL, ZORD_SURFACE_CLASS, ZORD_SURFACE_MUTED } from '../command-center/homeSurfaceFonts'
import { Glyph } from '../shared'
import {
  getBorrowerProfile,
  type BorrowerDocument,
  type ChecklistItem,
  type DocumentState,
} from '../verification/borrowerProfileMock'
import { getLoanProfile, type EmiHistoryEntry } from '../monitoring/loanProfileMock'

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

const SECTION_LABEL = ZORD_SECTION_LABEL
const CARD = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
const FIELD_LABEL = 'font-medium text-[#00239C]'
const FIELD_VALUE = 'font-semibold text-[#000000]'

function formatInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(amount % 10_000_000 === 0 ? 0 : 1)}Cr`
  if (amount >= 100_000) {
    const lakh = amount / 100_000
    return `₹${Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)}L`
  }
  return `₹${amount.toLocaleString('en-IN')}`
}

function docStateChip(state: DocumentState) {
  if (state === 'verified')
    return <span className="inline-flex items-center gap-1 rounded-full bg-black px-2 py-0.5 text-[11px] font-semibold text-white">✓ Verified</span>
  if (state === 'pending')
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">Pending</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[11px] font-semibold text-[#b91c1c]">Failed</span>
}

function resultDot(result: 'pass' | 'warn' | 'fail' | 'pending') {
  const tone =
    result === 'pass' ? 'bg-[#000000]' : result === 'warn' ? 'bg-[#d97706]' : result === 'fail' ? 'bg-[#dc2626]' : 'bg-slate-300'
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
}

function checklistGlyph(state: ChecklistItem['state']) {
  if (state === 'done') return <span className="font-semibold text-[#000000]">✓</span>
  if (state === 'pending') return <span className="font-semibold text-[#d97706]">○</span>
  return <span className="font-semibold text-slate-400">—</span>
}

/** Stylized mock document preview — CSS-drawn, clearly demo data. */
function DocumentSampleCard({ doc }: { doc: BorrowerDocument }) {
  const accent =
    doc.kind === 'pan'
      ? 'from-[#e0ecff] to-[#f1f6ff] border-[#bfd6f8]'
      : doc.kind === 'aadhaar'
        ? 'from-[#fff3e8] to-[#fffaf4] border-[#f5d9bd]'
        : doc.kind === 'liveness'
          ? 'from-[#eafaf1] to-[#f6fdf9] border-[#bfe8d2]'
          : 'from-[#f4f4f8] to-[#fbfbfd] border-slate-200'
  const livenessScore = doc.kind === 'liveness' ? Number(doc.primary.replace(/[^\d.]/g, '')) : 0
  return (
    <div className={`flex flex-col rounded-xl border bg-gradient-to-br p-3.5 ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${HOME_TITLE_BLACK}`}>{doc.title}</p>
        {docStateChip(doc.state)}
      </div>
      {doc.kind === 'liveness' ? (
        <div className="mt-2 flex items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#000000 ${Math.min(100, livenessScore * 100)}%, #e2e8f0 0)`,
            }}
          >
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white">
              <span className={`text-[12px] font-semibold text-[#000000] ${dmMono.className}`}>{livenessScore.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-[12px] font-medium text-[#00239C]">{doc.meta}</p>
        </div>
      ) : (
        <>
          <p className={`mt-2 text-[15px] font-semibold tracking-[0.04em] text-[#000000] ${dmMono.className}`}>{doc.primary}</p>
          <p className="mt-1 text-[12px] font-medium text-[#00239C]">{doc.meta}</p>
        </>
      )}
      <p className="mt-auto pt-2 text-[11px] font-semibold text-[#00239C]">
        Verified by <span className={doc.verifiedBy === 'Sumsub' ? 'text-[#1d4ed8]' : 'text-[#000000]'}>{doc.verifiedBy}</span>
      </p>
    </div>
  )
}

function ChecklistColumn({ title, items, accent }: { title: string; items: ChecklistItem[]; accent: string }) {
  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${accent}`}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[13px] font-medium text-[#00239C]">
            {checklistGlyph(item.state)}
            <span>
              {item.label}
              {item.note ? <span className="ml-1 text-[12px] font-medium text-[#00239C]/80">({item.note})</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileHeroBand({
  initials,
  title,
  subtitle,
  pills,
  actions,
}: {
  initials: string
  title: string
  subtitle: string
  pills: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[20px] bg-[#0f172a] p-5 text-white shadow-[0_16px_48px_-12px_rgba(15,23,42,0.45)] ring-1 ring-white/[0.08]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/10 text-[18px] font-semibold ring-1 ring-white/20">
            {initials}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.4rem] font-semibold tracking-[-0.02em]">{title}</h2>
              {pills}
            </div>
            <p className="mt-1 text-[13px] text-white/65">{subtitle}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-[#000000] transition hover:bg-slate-50"
    >
      ← {label}
    </button>
  )
}

function statusPillTone(status: string): string {
  if (status === 'Safe' || status === 'Confirmed') return 'bg-[#000000]/15 text-[#cbd5e1] ring-1 ring-[#000000]/40'
  if (status === 'Review' || status === 'Pending') return 'bg-[#d97706]/15 text-[#fcd34d] ring-1 ring-[#d97706]/40'
  return 'bg-[#dc2626]/15 text-[#fca5a5] ring-1 ring-[#dc2626]/40'
}

// ── Borrower 360 (verification dock) ─────────────────────────────────────────

export function BorrowerProfilePage({ borrowerId, onBack }: { borrowerId: string; onBack: () => void }) {
  const profile = getBorrowerProfile(borrowerId)

  if (!profile) {
    return (
      <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`}>
        <BackBar onBack={onBack} label="Back to queue" />
        <div className={`${CARD} py-12 text-center text-[14px] font-medium text-[#00239C]`}>
          Borrower {borrowerId} not found in the current queue.
        </div>
      </div>
    )
  }

  return (
    <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`} data-testid="borrower-360-page">
      <BackBar onBack={onBack} label="Back to queue" />

      <ProfileHeroBand
        initials={profile.initials}
        title={profile.name}
        subtitle={`${profile.borrowerId} · ${profile.product} ${formatInr(profile.loanAmountInr)} · ${profile.tenureMonths} mo · Risk score ${profile.riskScore}`}
        pills={
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${statusPillTone(profile.status)}`}>
            {profile.status === 'Safe' ? 'Safe to disburse' : profile.status}
          </span>
        }
        actions={
          <>
            <button type="button" className="inline-flex h-9 items-center rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-100">
              Approve
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-white/25 bg-white/10 px-3.5 text-[13px] font-semibold text-white transition hover:bg-white/20">
              Hold
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 text-[13px] font-semibold text-white transition hover:bg-white/20">
              <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
              Export
            </button>
          </>
        }
      />

      {profile.failReason ? (
        <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5 text-[13px] font-semibold text-[#92400e]">
          Open issue: {profile.failReason}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className={CARD}>
            <p className={SECTION_LABEL}>Document samples</p>
            <p className={`mt-1 ${ZORD_SURFACE_MUTED}`}>Every artifact collected for this borrower, with verification state and source.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.documents.map((doc) => (
                <DocumentSampleCard key={doc.kind} doc={doc} />
              ))}
            </div>
          </section>

          <section className={CARD}>
            <p className={SECTION_LABEL}>Coverage — Sumsub vs NBFC</p>
            <p className={`mt-1 ${ZORD_SURFACE_MUTED}`}>What the KYC provider verifies vs what this NBFC runs in-house.</p>
            <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-[#f8fafc] p-4 sm:grid-cols-2">
              <ChecklistColumn title="Sumsub verifies" items={profile.sumsubChecks} accent="text-[#1d4ed8]" />
              <ChecklistColumn title="NBFC runs" items={profile.nbfcChecks} accent={HOME_TITLE_BLACK} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className={CARD}>
            <p className={SECTION_LABEL}>KYC check timeline</p>
            <ul className="mt-3 space-y-2.5">
              {profile.timeline.map((event) => (
                <li key={`${event.time}-${event.label}`} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-11 shrink-0 text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>{event.time}</span>
                  {resultDot(event.result)}
                  <div className="min-w-0">
                    <p className={`text-[13px] font-semibold ${HOME_TITLE_BLACK}`}>
                      {event.label}
                      <span className={`ml-1.5 text-[11px] font-semibold ${event.source === 'Sumsub' ? 'text-[#1d4ed8]' : 'text-[#00239C]'}`}>
                        {event.source}
                      </span>
                    </p>
                    {event.note ? <p className="text-[12px] font-medium text-[#92400e]">{event.note}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={CARD}>
            <p className={SECTION_LABEL}>Bank details</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Account</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{profile.bank.bankName} {profile.bank.maskedAccount}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>IFSC</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{profile.bank.ifsc}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Penny-drop name match</dt>
                <dd className={`font-semibold ${profile.bank.pennyDropMatchPct === 100 ? 'text-[#000000]' : profile.bank.pennyDropMatchPct > 0 ? 'text-[#92400e]' : 'text-[#b91c1c]'}`}>
                  {profile.bank.pennyDropMatchPct > 0 ? `${profile.bank.pennyDropMatchPct}%` : 'Failed'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>eNACH mandate</dt>
                <dd className={`font-semibold ${profile.bank.mandateStatus === 'Registered' ? 'text-[#000000]' : profile.bank.mandateStatus === 'Pending' ? 'text-[#92400e]' : 'text-[#b91c1c]'}`}>
                  {profile.bank.mandateStatus}
                </dd>
              </div>
            </dl>
          </section>

          <section className={CARD}>
            <p className={SECTION_LABEL}>Loan details</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Product</dt>
                <dd className={FIELD_VALUE}>{profile.product}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Amount</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{formatInr(profile.loanAmountInr)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Tenure / rate</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{profile.tenureMonths} mo · {profile.interestRatePct}% p.a.</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>EMI</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>₹{profile.emiInr.toLocaleString('en-IN')} · {profile.emiDay}th of month</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Loan 360 (monitoring dock) ───────────────────────────────────────────────

function emiChipTone(status: EmiHistoryEntry['status']): string {
  if (status === 'Paid') return 'bg-[#f4f4f5] text-[#000000] border-[#e5e5e5]'
  if (status === 'Bounced') return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]'
  if (status === 'Due') return 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

function severityDot(severity: 'high' | 'medium' | 'low') {
  const tone = severity === 'high' ? 'bg-[#dc2626]' : severity === 'medium' ? 'bg-[#d97706]' : 'bg-slate-400'
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
}

export function LoanProfilePage({ loanId, onBack }: { loanId: string; onBack: () => void }) {
  const profile = getLoanProfile(loanId)

  if (!profile) {
    return (
      <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`}>
        <BackBar onBack={onBack} label="Back to queue" />
        <div className={`${CARD} py-12 text-center text-[14px] font-medium text-[#00239C]`}>
          Loan {loanId} not found in the current queue.
        </div>
      </div>
    )
  }

  const dpdPill =
    profile.dpd === 0
      ? 'bg-[#000000]/15 text-[#cbd5e1] ring-1 ring-[#000000]/40'
      : profile.dpd <= 30
        ? 'bg-[#d97706]/15 text-[#fcd34d] ring-1 ring-[#d97706]/40'
        : 'bg-[#dc2626]/15 text-[#fca5a5] ring-1 ring-[#dc2626]/40'

  return (
    <div className={`mt-2 space-y-4 ${ZORD_SURFACE_CLASS}`} data-testid="loan-360-page">
      <BackBar onBack={onBack} label="Back to queue" />

      <ProfileHeroBand
        initials={profile.initials}
        title={profile.borrowerName}
        subtitle={`${profile.loanId} · ${formatInr(profile.amountInr)} · ${profile.region} · EMI ₹${profile.emiInr.toLocaleString('en-IN')} on the ${profile.emiDay}th`}
        pills={
          <>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${statusPillTone(profile.status)}`}>{profile.status}</span>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${dpdPill}`}>{profile.dpd} DPD</span>
          </>
        }
        actions={
          profile.nextAction !== '—' ? (
            <span className="inline-flex h-9 items-center rounded-xl border border-white/25 bg-white/10 px-3.5 text-[13px] font-semibold text-white">
              Next action: {profile.nextAction}
            </span>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className={CARD}>
            <p className={SECTION_LABEL}>Disbursal proof</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className={FIELD_LABEL}>UTR</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{profile.disbursal.utr}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={FIELD_LABEL}>Rail</dt>
                <dd className={FIELD_VALUE}>{profile.disbursal.rail}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={FIELD_LABEL}>Beneficiary</dt>
                <dd className={`text-right ${FIELD_VALUE} ${dmMono.className}`}>{profile.disbursal.bankLine}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={FIELD_LABEL}>Sent</dt>
                <dd className={FIELD_VALUE}>{profile.disbursal.sentAt}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={FIELD_LABEL}>Bank confirmed</dt>
                <dd className={`font-semibold ${profile.disbursal.confirmedAt ? 'text-[#000000]' : 'text-[#92400e]'}`}>
                  {profile.disbursal.confirmedAt ?? 'Awaiting confirmation'}
                </dd>
              </div>
            </dl>
          </section>

          <section className={CARD}>
            <p className={SECTION_LABEL}>EMI history</p>
            <p className={`mt-1 ${ZORD_SURFACE_MUTED}`}>Repayment via {profile.rail} — presentation on the {profile.emiDay}th.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.emiHistory.map((entry) => (
                <div key={entry.month} className={`min-w-[72px] rounded-xl border px-3 py-2 text-center ${emiChipTone(entry.status)}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em]">{entry.month}</p>
                  <p className="text-[12px] font-semibold">{entry.status}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={CARD}>
            <p className={SECTION_LABEL}>Linked accounts</p>
            <ul className="mt-3 space-y-2">
              {profile.linkedAccounts.map((account) => (
                <li
                  key={account.label}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium ${
                    account.risky ? 'border-[#fecaca] bg-[#fef2f2] text-[#7f1d1d]' : 'border-slate-200 bg-slate-50 text-[#00239C]'
                  }`}
                >
                  <span className={`font-medium ${dmMono.className}`}>{account.label}</span>
                  <span className={`text-[12px] font-semibold ${account.risky ? 'text-[#b91c1c]' : 'text-[#00239C]'}`}>{account.note}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className={CARD}>
            <p className={SECTION_LABEL}>Risk event timeline</p>
            <ul className="mt-3 space-y-2.5">
              {profile.riskEvents.map((event, idx) => (
                <li key={`${event.time}-${idx}`} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-12 shrink-0 text-[12px] font-medium text-[#00239C] ${dmMono.className}`}>{event.time}</span>
                  {severityDot(event.severity)}
                  <p className={`text-[13px] font-semibold ${HOME_TITLE_BLACK}`}>{event.label}</p>
                </li>
              ))}
            </ul>
          </section>

          {profile.riskSignal !== 'None' ? (
            <section className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#b91c1c]">Active risk signal</p>
              <p className="mt-1.5 text-[14px] font-semibold text-[#7f1d1d]">{profile.riskSignal}</p>
              {profile.nextAction !== '—' ? (
                <p className="mt-1 text-[13px] font-medium text-[#991b1b]">Recommended: {profile.nextAction}</p>
              ) : null}
            </section>
          ) : null}

          <section className={CARD}>
            <p className={SECTION_LABEL}>Loan summary</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Disbursed</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>{formatInr(profile.amountInr)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>EMI</dt>
                <dd className={`${FIELD_VALUE} ${dmMono.className}`}>₹{profile.emiInr.toLocaleString('en-IN')}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>Region</dt>
                <dd className={FIELD_VALUE}>{profile.region}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className={FIELD_LABEL}>DPD</dt>
                <dd className={`font-semibold ${profile.dpd === 0 ? 'text-[#000000]' : profile.dpd <= 30 ? 'text-[#92400e]' : 'text-[#b91c1c]'} ${dmMono.className}`}>
                  {profile.dpd} days
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
