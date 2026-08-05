'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react'
import {
    COVERAGE_LADDER,
    DEMO_PROOF_PACKS,
    PROOF_CENTER_HEADER,
    buildProofBatches,
    getProofPack,
    packsForBatch,
    proofCenterStats,
    type CoverageLevel,
    type ProofBatch,
    type ProofPack,
} from '@/services/payout-command/demo/proofCenterDemo'
import {
    useBatchDispatched,
    useDemoBatchReady,
} from '@/services/payout-command/demo/demoBatchReadiness'
import {
    downloadDisputePack,
    downloadProofPackJson,
    downloadProofPackPdf,
} from '@/services/payout-command/demo/proofPackExport'
import { withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { LifecycleSummaryStrip } from '../shared/LifecycleSummaryStrip'
import { ProofGraphPanel } from './ProofGraphPanel'

type TabId = 'summary' | 'timeline' | 'evidence' | 'graph' | 'verify' | 'export'

const TABS: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'graph', label: 'Graph' },
    { id: 'verify', label: 'Verify' },
    { id: 'export', label: 'Export' },
]

/** Square status chips - black only, equal footprint. */
const CHIP_SOLID_BLACK = 'bg-[#0B1324] text-white'

function integrityStyle(_s: ProofPack['integrity']) {
    return CHIP_SOLID_BLACK
}

function outcomeStyle(_s: ProofPack['businessOutcome']) {
    return CHIP_SOLID_BLACK
}

function coverageStyle(_rank: number) {
    return CHIP_SOLID_BLACK
}

function governanceStyle(_s: ProofPack['governance']) {
    return CHIP_SOLID_BLACK
}

const STATUS_CHIP_VALUE_CLASS =
  'mt-1 inline-flex w-fit max-w-full items-center rounded-md px-2.5 py-1 text-[12px] font-semibold leading-tight'

function StatusChip({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex min-h-[4.25rem] flex-col border border-[#E5E7EB] bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium text-[#6B6B6B]">{label}</p>
      <span className={`${STATUS_CHIP_VALUE_CLASS} ${className}`} title={value}>
        {value}
      </span>
    </div>
  )
}

function CoverageLadder({ current }: { current: CoverageLevel }) {
    const currentRank = COVERAGE_LADDER.find((c) => c.level === current)?.rank ?? 0
    return (
        <ol className="space-y-2">
            {COVERAGE_LADDER.map((c) => {
                const reached = c.rank <= currentRank
                return (
                    <li
                        key={c.level}
                        className={`flex items-start gap-3 border px-3 py-2.5 ${
                            reached ? 'border-[#E5E7EB] bg-white' : 'border-dashed border-[#E5E7EB] bg-[#FAFBFC] opacity-70'
                        }`}
                    >
                        <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                reached ? 'bg-[#0B1324] text-white' : 'border border-[#CBD5E1] bg-white text-[#94A3B8]'
                            }`}
                        >
                            {c.rank}
                        </span>
                        <div>
                            <p className="text-[13px] font-semibold text-[#1A1A1A]">{c.level}</p>
                            <p className="text-[12px] text-[#6B6B6B]">{c.blurb}</p>
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}

/**
  * Spec 7.14 - Proof Center.
  * Batch selection → payout packs → pack detail. Coverage levels, not Proof Score.
  */
function tabFromSearch(raw: string | null): TabId {
    if (raw && TABS.some((t) => t.id === raw)) return raw as TabId
    return 'summary'
}

function BatchSelectionList({
    batches,
    onOpen,
}: {
    batches: ProofBatch[]
    onOpen: (batchId: string) => void
}) {
    return (
        <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                        {['Batch', 'Batch ref', 'Packs', 'P5 complete', 'Integrity verified', 'Exceptions', ''].map(
                            (h) => (
                                <th
                                    key={h || 'act'}
                                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6B6B6B]"
                                >
                                    {h}
                                </th>
                            ),
                        )}
                    </tr>
                </thead>
                <tbody>
                    {batches.map((b) => (
                        <tr key={b.batchId} className="border-b border-[#F0F0F0] last:border-0">
                            <td className="px-4 py-3 font-semibold text-[#1A1A1A]">{b.label}</td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[#475569]">{b.batchId}</td>
                            <td className="px-4 py-3 tabular-nums text-[#1A1A1A]">{b.packCount}</td>
                            <td className="px-4 py-3 tabular-nums text-[#1A1A1A]">{b.p5Count}</td>
                            <td className="px-4 py-3 tabular-nums text-[#1A1A1A]">{b.verifiedCount}</td>
                            <td className="px-4 py-3 tabular-nums text-[#475569]">{b.exceptionCount}</td>
                            <td className="px-4 py-3">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(b.batchId)}
                                        className="inline-flex h-7 items-center bg-[#0B1324] px-2.5 text-[11px] font-semibold text-white hover:opacity-90"
                                    >
                                        Open batch
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export function ProofCenterSurface({ initialPackId }: { initialPackId?: string }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { ready, readiness } = useDemoBatchReady()
    const batchDispatched = useBatchDispatched()
    /** Deep link `/proof/:id` opens pack detail; `/proof` always lands on batch selection. */
    const [selectedId, setSelectedId] = useState<string | null>(() => initialPackId ?? null)
    const [openBatchId, setOpenBatchId] = useState<string | null>(() => {
        if (initialPackId) return getProofPack(initialPackId)?.batchId ?? null
        return null
    })
    const [tab, setTab] = useState<TabId>(() => tabFromSearch(searchParams.get('tab')))
    const [verifyResult, setVerifyResult] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)

    useEffect(() => {
        if (initialPackId) {
            setSelectedId(initialPackId)
            setOpenBatchId(getProofPack(initialPackId)?.batchId ?? null)
        } else {
            // `/proof` route: never auto-open a pack; stay on batch selection (or batch packs if ?batch_id=).
            setSelectedId(null)
            const batchFromQuery = searchParams.get('batch_id') || searchParams.get('client_batch_id')
            if (batchFromQuery && DEMO_PROOF_PACKS.some((p) => p.batchId === batchFromQuery)) {
                setOpenBatchId(batchFromQuery)
            } else {
                setOpenBatchId(null)
            }
        }
        setTab(tabFromSearch(searchParams.get('tab')))
    }, [initialPackId, searchParams])

    const packs = DEMO_PROOF_PACKS
    const batches = useMemo(() => buildProofBatches(packs), [packs])
    const batchPacks = useMemo(
        () => (openBatchId ? packsForBatch(packs, openBatchId) : []),
        [packs, openBatchId],
    )
    const activeBatch = openBatchId ? (batches.find((b) => b.batchId === openBatchId) ?? null) : null
    const stats = useMemo(
        () => proofCenterStats(activeBatch ? batchPacks : packs),
        [activeBatch, batchPacks, packs],
    )
    const selected = selectedId ? getProofPack(selectedId) ?? null : null

    function openBatch(batchId: string) {
        setOpenBatchId(batchId)
        setSelectedId(null)
        setVerifyResult(null)
        router.replace(`/proof?demo=sandbox&batch_id=${encodeURIComponent(batchId)}`, { scroll: false })
    }

    function openPack(id: string, nextTab: TabId = 'summary') {
        const pack = getProofPack(id)
        if (pack) setOpenBatchId(pack.batchId)
        setSelectedId(id)
        setTab(nextTab)
        setVerifyResult(null)
        router.replace(`/proof/${id}?demo=sandbox&tab=${nextTab}`, { scroll: false })
    }

    function backToBatchPacks() {
        setSelectedId(null)
        setVerifyResult(null)
        if (openBatchId) {
            router.replace(`/proof?demo=sandbox&batch_id=${encodeURIComponent(openBatchId)}`, { scroll: false })
        } else {
            router.replace('/proof?demo=sandbox', { scroll: false })
        }
    }

    function backToBatches() {
        setSelectedId(null)
        setOpenBatchId(null)
        setVerifyResult(null)
        router.replace('/proof?demo=sandbox', { scroll: false })
    }

    function runVerify(pack: ProofPack) {
        if (pack.integrity === 'Pending' || pack.packHash === '-') {
            setVerifyResult(
                'Cannot verify - pack incomplete. Capture and seal required artefacts before integrity verification.',
            )
            return
        }
        setVerifyResult(
            `Integrity verified against this evidence pack · ${pack.packHash} · merkle ${pack.merkleRoot}. Re-run anytime for the same digest. This does not independently attest upstream bank/ERP truthfulness.`,
        )
    }

    function downloadPack(pack: ProofPack, format: 'json' | 'pdf' | 'dispute') {
        try {
            if (format === 'pdf') {
                downloadProofPackPdf(pack)
                setToast('Downloaded evidence pack PDF - same contract and outcome as on screen')
            } else if (format === 'dispute') {
                downloadDisputePack(pack)
                setToast('Downloaded dispute pack PDF - cites contract, outcome, and evidence checklist')
            } else {
                downloadProofPackJson(pack)
                setToast('Downloaded evidence pack JSON - same contract and outcome as on screen')
            }
        } catch {
            setToast('Export failed - try again or use Export JSON')
        }
        window.setTimeout(() => setToast(null), 2800)
    }

    if (!ready) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
                <div className="mx-auto w-full max-w-[1120px] space-y-5 px-5 py-6 sm:px-6 lg:px-8">
                    <PageExplainerBanner page="proof" />
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                            {PROOF_CENTER_HEADER.title}
                        </h1>
                        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
                            {PROOF_CENTER_HEADER.subtitle}
                        </p>
                    </div>
                    <AwaitingUploadsEmptyState title="No evidence packs yet" readiness={readiness} />
                </div>
            </div>
        )
    }

    /* Proof follows the flow - evidence packs populate only after the batch is dispatched. */
    if (!batchDispatched) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
                <div className="mx-auto w-full max-w-[1120px] space-y-5 px-5 py-6 sm:px-6 lg:px-8">
                    <PageExplainerBanner page="proof" />
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                            {PROOF_CENTER_HEADER.title}
                        </h1>
                        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
                            {PROOF_CENTER_HEADER.subtitle}
                        </p>
                    </div>
                    <div className="mx-auto max-w-[560px] border border-[#E5E7EB] bg-white px-6 py-10 text-center">
                        <p className="text-[15px] font-semibold text-[#0B1324]">No evidence packs yet</p>
                        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#6B6B6B]">
                            Evidence packs are assembled after dispatch, once outcome signals arrive.
                            Dispatch the batch from the Intent Journal to complete the flow.
                        </p>
                        <Link
                            href={withDemoBatchScope('/payouts/intents')}
                            className="mt-4 inline-flex h-9 items-center bg-[#2E5BFF] px-4 text-[13px] font-semibold text-white hover:bg-[#2448D4]"
                        >
                            Go to Intent Journal
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    /* ── Batch selection ── */
    if (!selected && !activeBatch) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
                <div className="mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-6 lg:px-8">
                    <PageExplainerBanner page="proof" />
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                            {PROOF_CENTER_HEADER.title}
                        </h1>
                        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
                            Select a batch to open evidence packs for each payout.
                        </p>
                    </div>
                    <div className="mt-5 space-y-5">
                        <LifecycleSummaryStrip
                            heroLabel="Evidence packs"
                            heroValue={String(stats.total)}
                            heroHint={`across ${batches.length} batch${batches.length === 1 ? '' : 'es'} · coverage ladder P0–P5, not a Proof Score`}
                            cells={[
                                {
                                    label: 'Integrity verified',
                                    value: String(stats.verified),
                                    hint: 'Pack hash / signature check passed',
                                },
                                {
                                    label: 'P5 business complete',
                                    value: String(stats.p5),
                                    hint: 'Proof-ready payouts at full coverage',
                                },
                                {
                                    label: 'Exception outcomes',
                                    value: String(stats.exceptionOutcome),
                                    hint: 'Short, returned, reversed, unresolved, or blocked',
                                },
                                {
                                    label: 'Batches',
                                    value: String(batches.length),
                                    hint: 'Open a batch for payout packs',
                                },
                            ]}
                        />
                        <BatchSelectionList batches={batches} onOpen={openBatch} />
                    </div>
                    <p className="mt-3 text-[11px] text-[#8C8C8C]">
                        Evidence coverage is a ladder (P0-P5), not a Proof Score. Integrity can verify while business
                        outcome is an exception.
                    </p>
                </div>
                {toast ? (
                    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1A1A1A] px-4 py-2 text-[13px] font-medium text-white shadow-lg">
                        {toast}
                    </div>
                ) : null}
            </div>
        )
    }

    /* ── Packs for selected batch ── */
    if (!selected && activeBatch) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
                <div className="mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-6 lg:px-8">
                    <PageExplainerBanner page="proof" />
                    <button
                        type="button"
                        onClick={backToBatches}
                        className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2E5BFF] hover:underline"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                        All batches
                    </button>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B6B6B]">
                                Proof · {activeBatch.label}
                            </p>
                            <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                                {activeBatch.label}
                            </h1>
                            <p className="mt-1 font-mono text-[12px] text-[#94A3B8]">{activeBatch.batchId}</p>
                            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6B6B6B]">
                                Evidence packs for payouts in this batch - open one for coverage, verify, and export.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[12px] text-[#6B6B6B]">
                            <span>
                                <span className="font-semibold text-[#1A1A1A]">{stats.total}</span> packs
                            </span>
                            <span>
                                <span className="font-semibold text-[#0B1324]">{stats.verified}</span> integrity verified
                            </span>
                            <span>
                                <span className="font-semibold text-[#1A1A1A]">{stats.p5}</span> P5 complete
                            </span>
                        </div>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                                <thead>
                                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                                        {[
                                            'Payment ref',
                                            'Batch ref',
                                            'Contract',
                                            'Outcome',
                                            'Integrity',
                                            'Coverage',
                                            'Generated at',
                                            '',
                                        ].map((h) => (
                                            <th
                                                key={h || 'act'}
                                                className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6B6B6B]"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchPacks.map((p) => (
                                        <tr
                                            key={p.id}
                                            className="cursor-pointer border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFBFC]"
                                            onClick={() => openPack(p.id)}
                                        >
                                            <td className="px-4 py-3">
                                                <p className="font-semibold tabular-nums text-[#1A1A1A]">{p.paymentRef}</p>
                                                <p className="text-[11px] text-[#6B6B6B]">
                                                    {p.payeeLabel} · {p.amountLabel}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-[11px] text-[#475569]">{p.batchId}</td>
                                            <td className="px-4 py-3 font-mono text-[12px] text-[#2E5BFF]">{p.contractId}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex h-7 min-w-[5.5rem] items-center justify-center px-2 text-[11px] font-semibold ${outcomeStyle(p.businessOutcome)}`}
                                                >
                                                    {p.businessOutcome}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex h-7 min-w-[5.5rem] items-center justify-center px-2 text-[11px] font-semibold ${integrityStyle(p.integrity)}`}
                                                >
                                                    {p.integrity}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2 text-center text-[11px] font-semibold leading-tight ${coverageStyle(p.coverageRank)}`}
                                                >
                                                    {p.coverage}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-[12px] text-[#6B6B6B]">{p.generatedAt}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    className="text-[12px] font-semibold text-[#2E5BFF] hover:underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openPack(p.id, 'verify')
                                                    }}
                                                >
                                                    Verify
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="mt-3 text-[11px] text-[#8C8C8C]">
                        Evidence coverage is a ladder (P0-P5), not a Proof Score. Integrity can verify while business
                        outcome is an exception.
                    </p>
                </div>
                {toast ? (
                    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1A1A1A] px-4 py-2 text-[13px] font-medium text-white shadow-lg">
                        {toast}
                    </div>
                ) : null}
            </div>
        )
    }

    if (!selected) {
        return null
    }

    /* ── Detail ── */
    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#F4F6F9]">
            <div
                className={`mx-auto w-full px-5 py-6 sm:px-6 lg:px-8 ${
                    tab === 'graph' ? 'max-w-[1280px]' : 'max-w-[1120px]'
                }`}
            >
                <button
                    type="button"
                    onClick={backToBatchPacks}
                    className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6B6B6B] hover:text-[#1A1A1A]"
                >
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                    Batch packs
                </button>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2.5 text-center text-[11px] font-semibold leading-tight ${coverageStyle(selected.coverageRank)}`}
                            >
                                {selected.coverage}
                            </span>
                            <span
                                className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2.5 text-[11px] font-semibold ${integrityStyle(selected.integrity)}`}
                            >
                                Integrity · {selected.integrity}
                            </span>
                            <span
                                className={`inline-flex h-7 min-w-[7.5rem] items-center justify-center px-2.5 text-[11px] font-semibold ${outcomeStyle(selected.businessOutcome)}`}
                            >
                                Outcome · {selected.businessOutcome}
                            </span>
                        </div>
                        <h1 className="mt-2 font-mono text-[22px] font-semibold tracking-tight text-[#1A1A1A]">
                            {selected.id}
                        </h1>
                        <p className="mt-1 text-[13px] text-[#6B6B6B]">
                            {selected.paymentRef} · {selected.contractId} · {selected.batchLabel} · {selected.amountLabel}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setTab('verify')
                            runVerify(selected)
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                    >
                        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                        Verify proof integrity
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-1 border-b border-[#E5E7EB]">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                                setTab(t.id)
                                router.replace(`/proof/${selected.id}?demo=sandbox&tab=${t.id}`, { scroll: false })
                            }}
                            className={`h-9 px-3 text-[13px] font-semibold ${
                                tab === t.id
                                    ? 'border-b-2 border-[#2E5BFF] text-[#2E5BFF]'
                                    : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="mt-5">
                    {tab === 'summary' ? (
                        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <StatusChip
                                        label="Integrity"
                                        value={selected.integrity}
                                        className={integrityStyle(selected.integrity)}
                                    />
                                    <StatusChip
                                        label="Governance"
                                        value={selected.governance}
                                        className={governanceStyle(selected.governance)}
                                    />
                                    <StatusChip
                                        label="Business outcome"
                                        value={selected.businessOutcome}
                                        className={outcomeStyle(selected.businessOutcome)}
                                    />
                                    <StatusChip
                                        label="Evidence coverage"
                                        value={selected.coverage}
                                        className={coverageStyle(selected.coverageRank)}
                                    />
                                </div>
                                <p className="border-l-4 border-[#2E5BFF] bg-white px-4 py-3 text-[13px] leading-relaxed text-[#1A1A1A]">
                                    {selected.verifyScopeNote}
                                </p>
                                {selected.missingItems.length > 0 ? (
                                    <div className="border border-[#E5E7EB] bg-white px-4 py-3">
                                        <p className="text-[14px] font-semibold text-[#1A1A1A]">Missing evidence</p>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[#6B6B6B]">
                                            {selected.missingItems.map((m) => (
                                                <li key={m}>{m}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3 text-[13px] text-[#0B1324]">
                                        No missing evidence items for this coverage level.
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Link
                                        href={selected.contractHref}
                                        className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#2E5BFF] hover:bg-[#F8FAFC]"
                                    >
                                        Open Action Contract
                                    </Link>
                                    <Link
                                        href={selected.traceHref}
                                        className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#2E5BFF] hover:bg-[#F8FAFC]"
                                    >
                                        Open Trace
                                    </Link>
                                    <Link
                                        href={selected.outcomeHref}
                                        className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
                                    >
                                        Outcome Review
                                    </Link>
                                </div>
                            </div>
                            <div className="border border-[#E5E7EB] bg-white px-4 py-4">
                                <p className="text-[14px] font-semibold text-[#1A1A1A]">Evidence coverage ladder</p>
                                <p className="mt-0.5 text-[12px] text-[#6B6B6B]">Not a single Proof Score</p>
                                <div className="mt-3">
                                    <CoverageLadder current={selected.coverage} />
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {tab === 'timeline' ? (
                        <div className="border border-[#E5E7EB] bg-white">
                            <ol className="divide-y divide-[#F0F0F0]">
                                {selected.timeline.map((ev, i) => (
                                    <li key={`${ev.at}-${i}`} className="flex gap-4 px-4 py-3.5">
                                        <span className="w-28 shrink-0 text-[12px] font-medium text-[#8C8C8C]">{ev.at}</span>
                                        <div>
                                            <p className="text-[13px] font-semibold text-[#1A1A1A]">{ev.label}</p>
                                            <p className="mt-0.5 text-[12px] text-[#6B6B6B]">{ev.detail}</p>
                                        </div>
                                        <span
                                            className={`ml-auto self-start rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                                ev.status === 'ok'
                                                    ? 'bg-[#F1F5F9] text-[#0B1324]'
                                                    : ev.status === 'warn'
                                                        ? 'bg-[#F1F5F9] text-[#0B1324]'
                                                        : 'bg-[#F1F5F9] text-[#64748B]'
                                            }`}
                                        >
                                            {ev.status}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : null}

                    {tab === 'evidence' ? (
                        <div className="overflow-hidden border border-[#E5E7EB] bg-white">
                            <table className="w-full border-collapse text-left text-[13px]">
                                <thead>
                                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFC]">
                                        {['Evidence item', 'Status', 'Hash', 'Note', ''].map((h) => (
                                            <th
                                                key={h || 'a'}
                                                className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6B6B6B]"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {selected.evidence.map((item) => (
                                        <tr key={item.id} className="border-b border-[#F0F0F0] last:border-0">
                                            <td className="px-4 py-3 font-medium text-[#1A1A1A]">{item.kind}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                                        item.available
                                                            ? 'bg-[#F1F5F9] text-[#0B1324]'
                                                            : 'bg-[#F1F5F9] text-[#64748B]'
                                                    }`}
                                                >
                                                    {item.available ? 'Available' : 'Missing'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-[11px] text-[#6B6B6B]">
                                                {item.hash ?? '-'}
                                            </td>
                                            <td className="px-4 py-3 text-[12px] text-[#6B6B6B]">{item.note}</td>
                                            <td className="px-4 py-3 text-right">
                                                {item.href ? (
                                                    <Link href={item.href} className="text-[12px] font-semibold text-[#2E5BFF] hover:underline">
                                                        Open
                                                    </Link>
                                                ) : item.available ? (
                                                    <button
                                                        type="button"
                                                        className="text-[12px] font-semibold text-[#2E5BFF] hover:underline"
                                                        onClick={() =>
                                                            setToast(`Opened ${item.kind} (sandbox preview)`)
                                                        }
                                                    >
                                                        Open
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}

                    {tab === 'graph' ? (
                        <ProofGraphPanel
                            pack={selected}
                            onToast={(msg) => {
                                setToast(msg)
                                window.setTimeout(() => setToast(null), 2800)
                            }}
                        />
                    ) : null}

                    {tab === 'verify' ? (
                        <div className="space-y-4">
                            <div className="border border-[#E5E7EB] bg-white px-5 py-5">
                                <p className="text-[14px] font-semibold text-[#1A1A1A]">Verify proof integrity</p>
                                <p className="mt-1 text-[13px] text-[#6B6B6B]">
                                    Recomputes digest against artefacts in this pack. Scope is pack-bound - not a claim that
                                    hashing alone proves source truthfulness.
                                </p>
                                <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-[13px]">
                                    <div>
                                        <dt className="text-[11px] font-medium text-[#6B6B6B]">Pack hash</dt>
                                        <dd className="mt-0.5 font-mono text-[#1A1A1A]">{selected.packHash}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-medium text-[#6B6B6B]">Merkle root / proof bundle hash</dt>
                                        <dd className="mt-0.5 font-mono text-[#1A1A1A]">{selected.merkleRoot}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-medium text-[#6B6B6B]">Signature</dt>
                                        <dd className="mt-0.5 font-mono text-[#1A1A1A]">{selected.signature}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-medium text-[#6B6B6B]">Current integrity</dt>
                                        <dd className="mt-0.5 font-semibold text-[#1A1A1A]">{selected.integrity}</dd>
                                    </div>
                                </dl>
                                <button
                                    type="button"
                                    onClick={() => runVerify(selected)}
                                    className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                                >
                                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                                    Verify proof integrity
                                </button>
                                {verifyResult ? (
                                    <p
                                        role="status"
                                        className="mt-4 border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2.5 text-[13px] leading-relaxed text-[#0B1324]"
                                    >
                                        {verifyResult}
                                    </p>
                                ) : null}
                            </div>
                            {selected.businessOutcome !== 'Exact' ? (
                                <p className="border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3 text-[13px] text-[#0B1324]">
                                    Business outcome is <strong>{selected.businessOutcome}</strong> even if integrity verifies.
                                    Open Outcome Review to resolve the exception.
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {tab === 'export' ? (
                        <div className="border border-[#E5E7EB] bg-white px-5 py-5">
                            <p className="text-[14px] font-semibold text-[#1A1A1A]">Export</p>
                            <p className="mt-1 text-[13px] text-[#6B6B6B]">
                                Exports reference the same contract ({selected.contractId}) and outcome (
                                {selected.businessOutcome}) as this pack.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => downloadPack(selected, 'json')}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                                >
                                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                                    Download evidence pack
                                </button>
                                <button
                                    type="button"
                                    onClick={() => downloadPack(selected, 'json')}
                                    className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                >
                                    Export JSON
                                </button>
                                <button
                                    type="button"
                                    onClick={() => downloadPack(selected, 'pdf')}
                                    className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                >
                                    Export PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => downloadPack(selected, 'dispute')}
                                    className="inline-flex h-9 items-center rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                >
                                    Create dispute pack
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {toast ? (
                <div
                    className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1A1A1A] px-4 py-2 text-[13px] font-medium text-white shadow-lg"
                    role="status"
                >
                    {toast}
                </div>
            ) : null}
        </div>
    )
}
