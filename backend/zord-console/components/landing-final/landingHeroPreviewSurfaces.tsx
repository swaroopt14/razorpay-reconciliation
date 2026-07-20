'use client'

import { useMemo, useState } from 'react'

import type { LandingHeroPreviewPageMock } from '@/components/landing-final/landingHeroMockData'
import {
  PREVIEW_AMBIGUITY_KPI,
  PREVIEW_BATCHES,
  PREVIEW_EVIDENCE_KPI_CARDS,
  PREVIEW_JOURNAL_ROWS,
  PREVIEW_LEAKAGE_KPI,
  PREVIEW_LEAKAGE_PCT_CACHE,
  PREVIEW_LEAKAGE_VM,
  PREVIEW_SETTLEMENT_ROWS,
  PREVIEW_SUPPORT_TICKETS,
} from '@/components/landing-final/landingHeroPreviewFixtures'
import { buildMockTrendSeries } from '@/components/landing-final/landingHeroMockData'
import { MatchingConfidenceKpiStrip } from '@/features/payout-command/ambiguity/components/MatchingConfidenceKpiStrip'
import { BatchesNeedingReviewTable } from '@/features/payout-command/ambiguity/components/BatchesNeedingReviewTable'
import { SignalClarityBar } from '@/features/payout-command/ambiguity/components/SignalClarityBar'
import { PAYMENT_COMMAND_CENTER } from '@/features/payout-command/command-center/paymentCommandCopy'
import { PaymentTrendPanel } from '@/features/payout-command/command-center/PaymentTrendPanel'
import { JournalIntelligenceKpiHero } from '@/features/payout-command/command-center/JournalIntelligenceKpiHero'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_TITLE_BLACK,
} from '@/features/payout-command/command-center/homeCommandCenterTokens'
import { EvidenceHeroBanner } from '@/features/payout-command/evidence/components/EvidenceHeroBanner'
import { EvidenceKpiStrip } from '@/features/payout-command/evidence/components/EvidenceKpiStrip'
import { LeakageKpiStrip } from '@/features/payout-command/leakage/components/LeakageKpiStrip'
import { LeakageBatchWatchlistTable } from '@/features/payout-command/leakage/components/LeakageBatchWatchlistTable'
import { PortfolioHeader } from '@/features/payout-command/leakage-portfolio/components/PortfolioHeader'
import { formatKpiMoneyMinor } from '@/features/payout-command/shared/formatApiKpiFields'
import { BorrowerVerificationSurface } from '@/features/payout-command/surfaces/BorrowerVerificationSurface'
import { PostDisbursalMonitoringSurface } from '@/features/payout-command/surfaces/PostDisbursalMonitoringSurface'
import type { AskZordState } from '@/features/payout-command/hooks/useAskZordState'
import { AskZordWorkspaceLayout } from '@/features/payout-command/workspace/AskZordWorkspaceLayout'
import { BatchProgressPanel } from '@/features/payout-command/batch-command-center/_components/BatchProgressPanel'
import { BatchWorkspaceBar } from '@/features/payout-command/batch-command-center/_components/BatchWorkspaceBar'
import { BATCH_REVIEW_COPY } from '@/features/payout-command/batch-command-center/copy/batchCommandCenterCopy'
import { PORTAL_CARD } from '@/features/payout-command/batch-command-center/_components/portal/batchPortalTokens'
import {
  derivePaymentProofTimeline,
  paymentProofProgressPct,
  type BatchSummary,
} from '@/services/payout-command/batch-model'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import type { FinalityStatus } from '@/services/payout-command/prod-api/intelligenceTypes'

type PreviewMetric = 'intended' | 'confirmed'
type PreviewYear = '2026' | '2027' | '2028'

function createLandingAskZordState(): AskZordState {
  const noop = () => undefined
  return {
    isOpen: true,
    open: noop,
    close: noop,
    toggle: noop,
    input: '',
    setInput: noop,
    status: 'idle',
    response: null,
    lastUserPrompt: null,
    archivedTurns: [],
    threads: [
      {
        id: 'preview-thread-1',
        title: 'Unmatched Cashfree value',
        updatedAt: Date.now() - 120_000,
        turns: [],
      },
      {
        id: 'preview-thread-2',
        title: 'Proof readiness gaps',
        updatedAt: Date.now() - 860_000,
        turns: [],
      },
    ],
    activeThreadId: null,
    startNewThread: noop,
    selectedContext: null,
    clearSelectedContext: noop,
    selectThread: noop,
    run: noop,
    dismissResponse: noop,
  }
}

function PreviewExposureCard() {
  const bars = [38, 52, 44, 68, 58, 72, 48, 64, 42, 56, 50, 76, 62, 82]
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Risk-adjusted leakage exposure</p>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL}`}>
            Mock exposure trend by unmatched, short-settled, and reversed records.
          </p>
        </div>
        <p className="text-[1.5rem] font-bold tabular-nums text-neutral-950">
          {formatKpiMoneyMinor(PREVIEW_LEAKAGE_VM.riskAdjustedMinor)}
        </p>
      </div>
      <div className="mt-6 flex h-36 items-end gap-2">
        {bars.map((height, index) => (
          <span key={index} className="flex-1 rounded-t bg-[#4a6fe6]/85" style={{ height: `${height}%` }} />
        ))}
      </div>
    </article>
  )
}

export function HomePreviewSurface(props: {
  metric: PreviewMetric
  setMetric: (metric: PreviewMetric) => void
  profile: LandingHeroPreviewPageMock
  selectedMetric: { value: string; sub: string }
  period: DisbursementTrendRange
  setPeriod: (period: DisbursementTrendRange) => void
  year: PreviewYear
  setYear: (year: PreviewYear) => void
  chartSeries: ReturnType<typeof buildMockTrendSeries>
}) {
  return (
    <div className="mt-0 w-full min-w-0">
      <div className="px-2 pt-2 text-center sm:px-4">
        <div className="flex flex-col items-center justify-center">
          <div className="mx-auto mb-4 flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
            {(['intended', 'confirmed'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => props.setMetric(key)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                  props.metric === key
                    ? 'bg-white text-[#000000] shadow-sm ring-1 ring-black/5'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {key === 'intended' ? 'Intended' : 'Bank-Confirmed'}
              </button>
            ))}
          </div>
          <div className="min-h-[96px] text-center">
            <div className="text-[2.5rem] font-extrabold leading-none tabular-nums text-[#000000] sm:text-[3.25rem]">
              {props.selectedMetric.value}
            </div>
            <div className="mt-2 text-[16px] font-bold text-[#000000]">{props.profile.metrics[props.metric].label}</div>
            <p className={`mt-2 max-w-sm ${HOME_BODY_IMPERIAL_CENTERED}`}>{props.selectedMetric.sub}</p>
            <p className={`mt-3 ${HOME_BODY_IMPERIAL_CENTERED}`}>{PAYMENT_COMMAND_CENTER.intendedHelper}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex w-full min-h-[48px] items-stretch border-y border-[#e8e8e5] bg-white">
        <div
          className={`flex w-1/2 min-w-0 items-center border-r border-[#ecece9] px-3 py-3 text-left text-[13px] font-medium sm:px-4 ${HOME_TITLE_BLACK}`}
        >
          <span className="truncate">Month · January {props.year}</span>
        </div>
        <div className="flex w-1/2 min-w-0 items-center justify-end gap-2 px-3 py-3 sm:px-4">
          {(['2026', '2027', '2028'] as const).map((optionYear) => (
            <button
              key={optionYear}
              type="button"
              onClick={() => props.setYear(optionYear)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                optionYear === props.year
                  ? 'bg-[#000000] text-white shadow-sm ring-1 ring-black/35'
                  : `border border-[#E5E5E5] bg-white hover:bg-[#f5f5f5] ${HOME_TITLE_BLACK}`
              }`}
            >
              {optionYear}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-4 w-full border-b border-[#e5e5e5] bg-white px-2 py-4 sm:px-3">
        <div className="min-w-0">
          <h2 className={`text-[16px] font-semibold leading-snug tracking-[-0.02em] sm:text-[18px] ${HOME_TITLE_BLACK}`}>
            {PAYMENT_COMMAND_CENTER.chartTitle}
          </h2>
          <p className={`mt-1 text-[12px] ${HOME_BODY_IMPERIAL}`}>{PAYMENT_COMMAND_CENTER.chartSubtitle}</p>
        </div>
        <div className="relative z-[1] mt-3 min-w-0 overflow-hidden" style={{ height: '14rem' }}>
          <div style={{ transform: 'scale(0.58)', transformOrigin: 'top left', width: '172%' }}>
            <PaymentTrendPanel
              className="w-full"
              series={props.chartSeries}
              loading={false}
              period={props.period}
              onPeriodChange={props.setPeriod}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AskPreviewSurface() {
  const askZord = useMemo(() => createLandingAskZordState(), [])
  return (
    <div className="-mx-1 overflow-hidden sm:-mx-2" style={{ maxHeight: '28rem' }}>
      <div
        className="origin-top-left scale-[0.78] [&_[data-testid=ask-zord-workspace]]:!min-h-[34rem]"
        style={{ width: '128.2%' }}
      >
        <AskZordWorkspaceLayout askZord={askZord} />
      </div>
    </div>
  )
}

export function LeakagePreviewSurface() {
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>('BATCH-1042')

  return (
    <div className="min-h-0 space-y-4 rounded-2xl bg-[#f4f4f1] p-3 sm:p-4">
      <PortfolioHeader
        batches={PREVIEW_BATCHES}
        selectedBatchId={selectedBatchId}
        onSelectBatch={setSelectedBatchId}
        hiddenWidgetCount={0}
        onRestoreHiddenWidgets={() => undefined}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <LeakageKpiStrip data={PREVIEW_LEAKAGE_VM} />
        </div>
        <div className="lg:col-span-2">
          <PreviewExposureCard />
        </div>
      </div>
      <LeakageBatchWatchlistTable
        batches={PREVIEW_BATCHES}
        selectedBatchId={selectedBatchId}
        onSelectBatch={setSelectedBatchId}
        leakagePctCache={PREVIEW_LEAKAGE_PCT_CACHE}
      />
    </div>
  )
}

export function AmbiguityPreviewSurface() {
  const [finalityFilter, setFinalityFilter] = useState<'' | FinalityStatus>('')
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>('BATCH-1042')

  return (
    <div className="space-y-4 rounded-2xl bg-[#f4f4f1] p-3 sm:p-4">
      <MatchingConfidenceKpiStrip amb={PREVIEW_AMBIGUITY_KPI} scopeHint="Preview workspace snapshot" />
      <SignalClarityBar amb={PREVIEW_AMBIGUITY_KPI} leakage={PREVIEW_LEAKAGE_KPI} />
      <BatchesNeedingReviewTable
        batches={PREVIEW_BATCHES}
        loading={false}
        finalityFilter={finalityFilter}
        onFilterChange={setFinalityFilter}
        highlightedBatchId={selectedBatchId}
        onRowSelect={setSelectedBatchId}
      />
    </div>
  )
}

export function VerificationPreviewSurface() {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ maxHeight: '30rem' }}>
      <div className="origin-top-left scale-[0.68]" style={{ width: '147%' }}>
        <BorrowerVerificationSurface />
      </div>
    </div>
  )
}

export function MonitoringPreviewSurface() {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ maxHeight: '30rem' }}>
      <div className="origin-top-left scale-[0.68]" style={{ width: '147%' }}>
        <PostDisbursalMonitoringSurface />
      </div>
    </div>
  )
}

function JournalLikePreview({
  mode,
}: {
  mode: 'intent' | 'settlement'
}) {
  const rows = mode === 'intent' ? PREVIEW_JOURNAL_ROWS : PREVIEW_SETTLEMENT_ROWS
  const title = mode === 'intent' ? 'Intent Journal' : 'Settlement Journal'
  const value = mode === 'intent' ? '₹62.1 L' : '₹34.4 L'
  const buckets =
    mode === 'intent'
      ? [
          { label: 'Instructions', value: '1,248', sub: 'Payment instructions in scope' },
          { label: 'Needs review', value: '86', sub: 'Manual-review queue' },
          { label: 'Readiness', value: '91%', sub: 'Batch aggregate confidence' },
          { label: 'Confirmed', value: '1,102', sub: 'Bank-confirmed intents' },
        ]
      : [
          { label: 'Observations', value: '986', sub: 'Settlement records observed' },
          { label: 'Matched', value: '912', sub: 'Linked to payment intents' },
          { label: 'Unlinked', value: '48', sub: 'Need match review' },
          { label: 'Parse errors', value: '6', sub: 'Failed settlement parses' },
        ]

  return (
    <div className="grid gap-3 rounded-2xl bg-[#f1f5f9] p-3 lg:grid-cols-[0.72fr_1.28fr]">
      <aside className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Batches</p>
        <div className="mt-3 space-y-2">
          {PREVIEW_BATCHES.map((batch, index) => (
            <div
              key={batch.batch_id}
              className={`rounded-xl border px-3 py-2 ${
                index === 0 ? 'border-neutral-900 bg-neutral-950 text-white' : 'border-slate-200 bg-white'
              }`}
            >
              <p className={`text-[12px] font-semibold ${index === 0 ? 'text-white' : HOME_TITLE_BLACK}`}>
                {batch.batch_id}
              </p>
              <p className={`mt-0.5 text-[11px] ${index === 0 ? 'text-white/70' : 'text-slate-500'}`}>
                {batch.source_reference}
              </p>
            </div>
          ))}
        </div>
      </aside>
      <div className="space-y-3">
        <JournalIntelligenceKpiHero
          eyebrow={title}
          value={value}
          deltaPill={mode === 'intent' ? '91% ready' : '92% matched'}
          subcopy={mode === 'intent' ? 'Sum of payment instruction amounts' : 'Observed settlement value'}
          buckets={buckets}
          testId={`landing-${mode}-journal-hero`}
        />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-4 gap-2 border-b border-slate-100 px-3 py-2.5 text-[11px] last:border-b-0"
            >
              <span className={`font-semibold ${HOME_TITLE_BLACK}`}>{row.id}</span>
              <span className="text-slate-500">{row.partner}</span>
              <span className={row.status === 'Review' || row.status === 'Unlinked' ? 'font-semibold text-orange-600' : 'text-slate-500'}>
                {row.status}
              </span>
              <span className={`text-right font-semibold ${HOME_TITLE_BLACK}`}>{row.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function IntentJournalPreviewSurface() {
  return <JournalLikePreview mode="intent" />
}

export function SettlementJournalPreviewSurface() {
  return <JournalLikePreview mode="settlement" />
}

export function EvidencePreviewSurface() {
  const [search, setSearch] = useState('')
  const [batchId, setBatchId] = useState('BATCH-1042')

  return (
    <div className="space-y-3 rounded-2xl bg-[#f4f4f1] p-3 sm:p-4">
      <EvidenceHeroBanner
        search={search}
        onSearchChange={setSearch}
        batchId={batchId}
        onBatchChange={setBatchId}
        batchOptions={PREVIEW_BATCHES}
      />
      <EvidenceKpiStrip cards={PREVIEW_EVIDENCE_KPI_CARDS} defensibilityTier="B" />
      <div className="grid gap-3 lg:grid-cols-3">
        {['Finance close', 'Audit pack', 'Dispute proof'].map((title, index) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Evidence Pack</p>
            <h4 className={`mt-2 text-sm font-bold ${HOME_TITLE_BLACK}`}>{title}</h4>
            <div className="mt-4 h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-black" style={{ width: `${[88, 76, 92][index]}%` }} />
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{[88, 76, 92][index]}% proof ready</p>
          </article>
        ))}
      </div>
    </div>
  )
}

export function SupportPreviewSurface() {
  return (
    <div className="space-y-3 rounded-2xl bg-[#f4f4f1] p-3 sm:p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">My account</p>
        <h4 className={`mt-1 text-lg font-bold ${HOME_TITLE_BLACK}`}>Zord Support</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Profile', 'Credits', 'Processing', 'Team', 'Zord Support'].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                index === 4 ? 'bg-neutral-950 text-white' : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {PREVIEW_SUPPORT_TICKETS.map((ticket) => (
          <div
            key={ticket.id}
            className="grid grid-cols-4 gap-2 border-b border-slate-100 px-3 py-2.5 text-[11px] last:border-b-0"
          >
            <span className={`font-semibold ${HOME_TITLE_BLACK}`}>{ticket.id}</span>
            <span className="text-slate-500">{ticket.subject}</span>
            <span className={ticket.priority === 'High' ? 'font-semibold text-orange-600' : 'text-slate-500'}>
              {ticket.priority}
            </span>
            <span className="text-slate-500">{ticket.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const PREVIEW_BATCH_SUMMARY: BatchSummary = {
  totalRows: 420,
  processed: 396,
  success: 368,
  failed: 12,
  pending: 40,
}

/** Landing-only Batch Command Center, same product view as /batch-command-center with mock data. */
export function BatchCommandCenterPreviewSurface({ onBack }: { onBack?: () => void }) {
  const summary = PREVIEW_BATCH_SUMMARY
  const pipelineSteps = useMemo(
    () =>
      derivePaymentProofTimeline(summary, {
        intakeStep: 'settlement_uploading',
        intentFileName: 'payments-july.csv',
        intentIngestOk: true,
        settlementFileName: 'hdfc-statement.csv',
        settlementIngestOk: false,
        uploadedFileName: 'payments-july.csv',
        uploadState: 'ready',
      }),
    [],
  )
  const progressPct = useMemo(() => paymentProofProgressPct(pipelineSteps), [pipelineSteps])

  return (
    <div
      className="payout-command-console text-[13px] font-normal leading-relaxed text-[#1A1A1A] antialiased"
      data-testid="landing-batch-command-center-preview"
    >
      <div className="w-full space-y-4 p-1 sm:p-2">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#0f172a]">{BATCH_REVIEW_COPY.pageTitle}</h1>
            <p className="mt-1 text-[14px] text-[#64748b]">{BATCH_REVIEW_COPY.pageSubtitle}</p>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a] hover:bg-slate-50"
            >
              ← Back to Command Center
            </button>
          ) : null}
        </header>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3">
          <button type="button" className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a]">
            {BATCH_REVIEW_COPY.toolbar.uploadPaymentFile}
          </button>
          <button type="button" className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a]">
            {BATCH_REVIEW_COPY.toolbar.uploadSettlementFile}
          </button>
          <button type="button" className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#0f172a]">
            {BATCH_REVIEW_COPY.toolbar.createPaymentManually}
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-[13px] font-medium text-[#0f172a]">
              {BATCH_REVIEW_COPY.toolbar.intentJournal}
            </button>
            <button type="button" className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-[13px] font-medium text-[#0f172a]">
              {BATCH_REVIEW_COPY.toolbar.settlementJournal}
            </button>
            <button type="button" className="h-9 rounded-lg bg-[#2563eb] px-4 text-[13px] font-medium text-white">
              {BATCH_REVIEW_COPY.toolbar.share}
            </button>
          </div>
        </div>

        <BatchWorkspaceBar
          tenantId="preview-workspace"
          tenantReady
          isSandbox={false}
          companyName="Jacme Company"
          activeBatchId="BATCH-1042"
          onSelectBatch={() => undefined}
          onRefresh={() => undefined}
        />

        <section className={`${PORTAL_CARD} space-y-4 p-4 sm:p-5`}>
          <div>
            <h2 className="text-[15px] font-bold text-[#0f172a]">{BATCH_REVIEW_COPY.intake.title}</h2>
            <p className="mt-1 text-[13px] text-[#64748b]">{BATCH_REVIEW_COPY.intake.helper}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center">
              <p className="text-[13px] font-semibold text-[#0f172a]">{BATCH_REVIEW_COPY.intake.step1Title}</p>
              <p className="mt-1 text-[12px] text-[#64748b]">payments-july.csv · uploaded</p>
            </div>
            <div className="rounded-xl border border-dashed border-[#93c5fd] bg-[#eff6ff] px-4 py-6 text-center">
              <p className="text-[13px] font-semibold text-[#0f172a]">{BATCH_REVIEW_COPY.intake.step2Title}</p>
              <p className="mt-1 text-[12px] text-[#64748b]">hdfc-statement.csv · mapping in progress</p>
            </div>
          </div>
        </section>

        <BatchProgressPanel steps={pipelineSteps} progressPct={progressPct} busy />
      </div>
    </div>
  )
}
