'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { getEvidenceBatchLineageGraph } from '@/services/payout-command/prod-api/getEvidenceBatchLineageGraph'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import {
  evidencePackFullFromBatchLineage,
  isBatchEvidencePack,
} from '@/services/payout-command/prod-api/resolveBatchEvidencePack'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { EvidencePackSummaryTab } from './EvidencePackSummaryTab'
import { EvidencePackTimelineTab } from './EvidencePackTimelineTab'
import { EvidencePackItemsTab } from './EvidencePackItemsTab'
import { EvidencePackGraphTab } from './EvidencePackGraphTab'
import { EvidencePackExportTab } from './EvidencePackExportTab'
import { BatchEvidenceHub } from './BatchEvidenceHub'

const ALL_TABS = ['summary', 'timeline', 'items', 'graph', 'export'] as const
const BATCH_TABS = ['graph', 'export'] as const
type DetailTab = (typeof ALL_TABS)[number]
type BatchDetailTab = (typeof BATCH_TABS)[number]

function parseTab(raw: string | null, isBatch: boolean): DetailTab {
  if (isBatch) {
    const fallback: BatchDetailTab = 'graph'
    const t = (raw || fallback).toLowerCase()
    if (BATCH_TABS.includes(t as BatchDetailTab)) return t as BatchDetailTab
    return fallback
  }
  const fallback: DetailTab = 'summary'
  const t = (raw || fallback).toLowerCase()
  if (ALL_TABS.includes(t as DetailTab)) return t as DetailTab
  return fallback
}

function isBatchEvidencePackFull(pack: EvidencePackFull): boolean {
  return isBatchEvidencePack({
    evidence_pack_id: pack.evidence_pack_id,
    tenant_id: pack.tenant_id,
    intent_id: pack.intent_id,
    mode: pack.mode,
    pack_status: pack.pack_status,
    merkle_root: pack.merkle_root,
    ruleset_version: pack.ruleset_version,
    created_at: pack.created_at,
  })
}

type EvidencePackDetailClientProps = {
  packId: string
}

export function EvidencePackDetailClient({ packId }: EvidencePackDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const batchId = searchParams.get('batch_id')?.trim() ?? ''
  const redirectPending = useRef(false)
  const [pack, setPack] = useState<EvidencePackFull | null>(null)
  const [loading, setLoading] = useState(true)

  const isBatch = pack ? isBatchEvidencePackFull(pack) : false
  const tab = parseTab(searchParams.get('tab'), isBatch)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const bid = apiTrimmedString(batchId)
      let full = await getEvidencePackFull(packId)

      if (!full && bid) {
        const { packs } = await listEvidencePacksForBatch(bid)
        if (cancelled) return
        const summary = packs.find((row) => apiTrimmedString(row.evidence_pack_id) === apiTrimmedString(packId))
        if (summary && isBatchEvidencePack(summary)) {
          const lineage = await getEvidenceBatchLineageGraph(bid)
          if (lineage.data) {
            full = evidencePackFullFromBatchLineage(bid, lineage.data, summary, packId)
          }
        } else {
          const lineage = await getEvidenceBatchLineageGraph(bid)
          if (
            lineage.data &&
            apiTrimmedString(lineage.data.evidence_pack_id) === apiTrimmedString(packId)
          ) {
            full = evidencePackFullFromBatchLineage(bid, lineage.data, summary ?? null, packId)
          }
        }
      }

      if (cancelled) return
      setPack(full)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [packId, batchId])

  useEffect(() => {
    if (loading || !pack || redirectPending.current) return
    if (isBatchEvidencePackFull(pack)) {
      if (tab !== 'graph' && tab !== 'export') {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', 'graph')
        router.replace(`/payout-command-view/evidence-pack/${encodeURIComponent(packId)}?${params.toString()}`, {
          scroll: false,
        })
      }
      return
    }

    const bid = apiTrimmedString(batchId) || apiTrimmedString(pack.batch_id)
    if (!bid) return

    redirectPending.current = true
    void listEvidencePacksForBatch(bid).then(({ packs }) => {
      const batchPack = packs.find(isBatchEvidencePack)
      const batchPackId = apiTrimmedString(batchPack?.evidence_pack_id)
      if (!batchPackId) {
        redirectPending.current = false
        return
      }

      const params = new URLSearchParams()
      params.set('tab', 'graph')
      params.set('batch_id', bid)
      params.set('scope', 'intent')
      params.set('intent_pack', packId)
      const subtab = searchParams.get('tab')
      if (subtab && subtab !== 'graph') params.set('subtab', subtab)
      else params.set('subtab', 'summary')

      router.replace(
        `/payout-command-view/evidence-pack/${encodeURIComponent(batchPackId)}?${params.toString()}`,
      )
    })
  }, [loading, pack, packId, batchId, tab, router, searchParams])

  const visibleTabs = isBatch ? BATCH_TABS : ALL_TABS

  const tabHref = (t: DetailTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', t)
    if (batchId) params.set('batch_id', batchId)
    if (isBatch && t === 'graph') {
      // preserve hub params when switching back to graph from export
    } else if (isBatch) {
      params.delete('scope')
      params.delete('subtab')
      params.delete('intent_pack')
      params.delete('intent_page')
      params.delete('intent_q')
    }
    return `/payout-command-view/evidence-pack/${encodeURIComponent(packId)}?${params.toString()}`
  }

  const tabLabels: Record<DetailTab, string> = {
    summary: evidenceCopy.packDetail.tabs.summary,
    timeline: evidenceCopy.packDetail.tabs.timeline,
    items: evidenceCopy.packDetail.tabs.items,
    graph: evidenceCopy.packDetail.tabs.graph,
    export: evidenceCopy.packDetail.tabs.export,
  }

  const subtitle = useMemo(() => {
    if (isBatch) return evidenceCopy.hub.batchSubtitle
    return evidenceCopy.graph.subtitle
  }, [isBatch])

  if (!loading && pack && !isBatch && redirectPending.current) {
    return (
      <main
        className="payout-command-console min-h-screen bg-[#f5f5f5] text-[15px] leading-[1.55] antialiased"
        style={{ fontFamily: DASHBOARD_FONT_STACK }}
      >
        <div className="mx-auto max-w-[1400px] px-3 py-10 sm:px-4 lg:px-5">
          <p className="text-center text-[14px] text-[#6f716d]">Opening batch evidence hub…</p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="payout-command-console min-h-screen bg-[#f5f5f5] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 px-3 py-5 sm:px-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={`/payout-command-view/today?dock=proof${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`}
              className="text-[13px] font-medium text-[#6f716d] hover:text-[#111111]"
            >
              ← Evidence & Dispute Resolution
            </Link>
            <h1 className="mt-2 font-mono text-[20px] font-semibold text-[#111111]">{packId}</h1>
            <p className="mt-1 text-[14px] text-[#6f716d]">{subtitle}</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 rounded-[0.85rem] border border-[#E5E5E5] bg-[#f8f8f6] p-1">
          {visibleTabs.map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              scroll={false}
              className={`rounded-[0.65rem] px-4 py-2 text-[14px] font-semibold transition ${
                tab === t ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6f716d] hover:text-[#111111]'
              }`}
            >
              {tabLabels[t]}
            </Link>
          ))}
        </nav>

        <div className="rounded-[16px] border border-[#E5E5E5] bg-white p-5 sm:p-6">
          {isBatch && tab === 'graph' ? (
            <BatchEvidenceHub batchPackId={packId} batchId={batchId} />
          ) : null}
          {isBatch && tab === 'export' ? <EvidencePackExportTab pack={pack} /> : null}
          {!isBatch && tab === 'summary' ? (
            <EvidencePackSummaryTab pack={pack} batchId={batchId} loading={loading} />
          ) : null}
          {!isBatch && tab === 'timeline' ? (
            <EvidencePackTimelineTab pack={pack} packId={packId} loading={loading} />
          ) : null}
          {!isBatch && tab === 'items' ? <EvidencePackItemsTab pack={pack} loading={loading} /> : null}
          {!isBatch && tab === 'graph' ? (
            <EvidencePackGraphTab packId={packId} batchId={batchId} intentId={pack?.intent_id} />
          ) : null}
          {!isBatch && tab === 'export' ? <EvidencePackExportTab pack={pack} /> : null}
        </div>
      </div>
    </main>
  )
}
