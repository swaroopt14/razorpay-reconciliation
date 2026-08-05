'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MerkleGraphSurface } from '../../surfaces/MerkleGraphSurface'
import { EvidencePackVerifyCard } from '../../evidence/components/EvidencePackVerifyCard'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { EvidencePackSummaryTab } from './EvidencePackSummaryTab'
import { EvidencePackTimelineTab } from './EvidencePackTimelineTab'
import { EvidencePackItemsTab } from './EvidencePackItemsTab'
import { EvidencePackExportTab } from './EvidencePackExportTab'
import { IntentProofSidebar } from './IntentProofSidebar'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import { isBatchEvidencePack } from '@/services/payout-command/prod-api/resolveBatchEvidencePack'
import type { EvidencePackFull, EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'

const INTENT_SUBTABS = ['summary', 'timeline', 'items', 'graph', 'export'] as const
type IntentSubtab = (typeof INTENT_SUBTABS)[number]
type HubScope = 'batch' | 'intent'

const DEFAULT_INTENT_SUBTAB: IntentSubtab = 'graph'

function parseScope(raw: string | null): HubScope {
  return raw === 'intent' ? 'intent' : 'batch'
}

function parseSubtab(raw: string | null): IntentSubtab {
  const t = (raw || DEFAULT_INTENT_SUBTAB).toLowerCase()
  if (INTENT_SUBTABS.includes(t as IntentSubtab)) return t as IntentSubtab
  return DEFAULT_INTENT_SUBTAB
}

function parsePage(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

type BatchEvidenceHubProps = {
  batchPackId: string
  batchId: string
}

function IntentTabContent({
  subtab,
  activeIntentPackId,
  intentPack,
  intentPackLoading,
  batchId,
}: {
  subtab: IntentSubtab
  activeIntentPackId: string
  intentPack: EvidencePackFull | null
  intentPackLoading: boolean
  batchId: string
}) {
  if (!activeIntentPackId) {
    return (
      <p className="py-16 text-center text-[14px] text-slate-500">{evidenceCopy.hub.intentSelectPayment}</p>
    )
  }

  if (subtab === 'graph') {
    return (
      <div className="flex min-h-[520px] flex-col bg-[#fafafa]">
        <div className="border-b border-[#E5E5E5] bg-white px-4 py-3 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {evidenceCopy.hub.intentHeroTitle}
          </p>
          <p className="mt-1 font-mono text-[12px] text-slate-600">{activeIntentPackId}</p>
        </div>
        <div className="border-b border-[#E5E5E5] bg-white px-4 py-3 sm:px-5">
          <EvidencePackVerifyCard packId={activeIntentPackId} />
        </div>
        <div className="min-h-[420px] flex-1 bg-white p-3 sm:p-4">
          <MerkleGraphSurface
            initialPackId={activeIntentPackId}
            embedMode
            controlledBatchId={batchId || undefined}
            controlledPackId={activeIntentPackId}
            intentOptionsSource="table"
            hideScopePickers
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-5">
      {subtab === 'summary' ? (
        <EvidencePackSummaryTab pack={intentPack} batchId={batchId} loading={intentPackLoading} />
      ) : subtab === 'timeline' ? (
        <EvidencePackTimelineTab pack={intentPack} packId={activeIntentPackId} loading={intentPackLoading} />
      ) : subtab === 'items' ? (
        <EvidencePackItemsTab pack={intentPack} loading={intentPackLoading} />
      ) : (
        <EvidencePackExportTab pack={intentPack} />
      )}
    </div>
  )
}

export function BatchEvidenceHub({ batchPackId, batchId }: BatchEvidenceHubProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bid = apiTrimmedString(batchId)

  const scope = parseScope(searchParams.get('scope'))
  const subtab = parseSubtab(searchParams.get('subtab'))
  const intentPackFromUrl = apiTrimmedString(searchParams.get('intent_pack'))
  const intentPage = parsePage(searchParams.get('intent_page'))
  const intentQuery = searchParams.get('intent_q') ?? ''

  const [batchPacks, setBatchPacks] = useState<EvidencePackSummaryRow[]>([])
  const [intentPacks, setIntentPacks] = useState<EvidencePackSummaryRow[]>([])
  const [packLoading, setPackLoading] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [activeIntentPackId, setActiveIntentPackId] = useState(intentPackFromUrl || '')
  const [intentPack, setIntentPack] = useState<EvidencePackFull | null>(null)
  const [intentPackLoading, setIntentPackLoading] = useState(false)

  const replaceHubParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'graph')
      if (bid) params.set('batch_id', bid)
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') params.delete(key)
        else params.set(key, value)
      }
      router.replace(
        `/payout-command-view/evidence-pack/${encodeURIComponent(batchPackId)}?${params.toString()}`,
        { scroll: false },
      )
    },
    [batchPackId, bid, router, searchParams],
  )

  useEffect(() => {
    if (!bid) {
      setBatchPacks([])
      setIntentPacks([])
      setPackLoading(false)
      setPackError(null)
      return
    }

    let cancelled = false
    setPackLoading(true)
    setPackError(null)
    void listEvidencePacksForBatch(bid).then(({ packs: rows, errors }) => {
      if (cancelled) return
      if (!rows.length) {
        const detail = errors.length ? ` ${errors.join(' · ')}` : ''
        setPackError(`No evidence packs available for batch ${bid}.${detail}`)
        setBatchPacks([])
        setIntentPacks([])
        setPackLoading(false)
        return
      }

      const batches = rows.filter(isBatchEvidencePack)
      const intents = rows.filter((row) => !isBatchEvidencePack(row))
      setBatchPacks(batches)
      setIntentPacks(intents)

      const preferredIntent =
        intentPackFromUrl && intents.some((r) => apiTrimmedString(r.evidence_pack_id) === intentPackFromUrl)
          ? intentPackFromUrl
          : apiTrimmedString(intents[0]?.evidence_pack_id)
      setActiveIntentPackId(preferredIntent)
      setPackLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [bid, intentPackFromUrl])

  useEffect(() => {
    if (scope !== 'intent' || !activeIntentPackId) {
      setIntentPack(null)
      setIntentPackLoading(false)
      return
    }
    if (subtab === 'graph') {
      setIntentPackLoading(false)
      return
    }

    let cancelled = false
    setIntentPackLoading(true)
    void getEvidencePackFull(activeIntentPackId).then((full) => {
      if (cancelled) return
      setIntentPack(full)
      setIntentPackLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [scope, activeIntentPackId, subtab])

  const batchViewPackId = useMemo(() => {
    const fromList = apiTrimmedString(batchPacks[0]?.evidence_pack_id)
    return fromList || batchPackId
  }, [batchPacks, batchPackId])

  const subtabHref = (t: IntentSubtab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'graph')
    params.set('scope', 'intent')
    if (bid) params.set('batch_id', bid)
    if (activeIntentPackId) params.set('intent_pack', activeIntentPackId)
    params.set('subtab', t)
    if (intentPage > 1) params.set('intent_page', String(intentPage))
    if (intentQuery.trim()) params.set('intent_q', intentQuery.trim())
    return `/payout-command-view/evidence-pack/${encodeURIComponent(batchPackId)}?${params.toString()}`
  }

  const subtabLabels: Record<IntentSubtab, string> = {
    summary: evidenceCopy.packDetail.tabs.summary,
    timeline: evidenceCopy.packDetail.tabs.timeline,
    items: evidenceCopy.packDetail.tabs.items,
    graph: evidenceCopy.packDetail.tabs.graph,
    export: evidenceCopy.packDetail.tabs.export,
  }

  const currentSubtab = subtab || DEFAULT_INTENT_SUBTAB

  const handleScopeChange = (next: HubScope) => {
    if (next === 'batch') {
      replaceHubParams({ scope: 'batch', subtab: null, intent_pack: null, intent_page: null, intent_q: null })
      return
    }
    replaceHubParams({
      scope: 'intent',
      subtab: currentSubtab || DEFAULT_INTENT_SUBTAB,
      intent_pack: activeIntentPackId || apiTrimmedString(intentPacks[0]?.evidence_pack_id) || null,
    })
  }

  const handleIntentSelect = (packId: string) => {
    setActiveIntentPackId(packId)
    replaceHubParams({
      scope: 'intent',
      intent_pack: packId,
      subtab: currentSubtab,
      intent_page: String(intentPage),
      intent_q: intentQuery.trim() || null,
    })
  }

  const handleSearchChange = (q: string) => {
    replaceHubParams({
      scope: 'intent',
      intent_q: q.trim() || null,
      intent_page: '1',
      intent_pack: activeIntentPackId || null,
      subtab: currentSubtab,
    })
  }

  const handlePageChange = (page: number) => {
    replaceHubParams({
      scope: 'intent',
      intent_page: page > 1 ? String(page) : null,
      intent_pack: activeIntentPackId || null,
      subtab: currentSubtab,
      intent_q: intentQuery.trim() || null,
    })
  }

  return (
    <div className="space-y-4">
      {bid ? (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[#E5E5E5] bg-[#fafafa] px-4 py-3 text-[13px]">
          <span>
            <span className="font-semibold text-slate-500">Batch </span>
            <span className="font-mono font-semibold text-slate-900">{bid}</span>
          </span>
          <span className="text-slate-500">
            {intentPacks.length} payment proof{intentPacks.length === 1 ? '' : 's'} in this batch
          </span>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-3">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-1">
          <button
            type="button"
            onClick={() => handleScopeChange('batch')}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
              scope === 'batch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {evidenceCopy.hub.batchGraph} ({batchPacks.length || 1})
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange('intent')}
            disabled={packLoading || intentPacks.length === 0}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              scope === 'intent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {evidenceCopy.hub.intentProofs} ({intentPacks.length})
          </button>
        </div>
        {packError ? <p className="mt-2 text-[12px] font-medium text-amber-700">{packError}</p> : null}
      </div>

      {scope === 'batch' ? (
        <div className="space-y-4">
          <p className="text-[14px] text-[#6f716d]">{evidenceCopy.graph.batchSubtitle}</p>
          <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
            <EvidencePackVerifyCard packId={batchViewPackId} />
            <div className="min-w-0">
              <MerkleGraphSurface
                initialPackId={batchPackId}
                embedMode
                controlledBatchId={bid || undefined}
                controlledPackId={batchViewPackId}
                intentOptionsSource="table"
                hideScopePickers
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[560px] flex-col gap-0 overflow-hidden rounded-xl border border-[#E5E5E5] bg-white lg:flex-row lg:items-stretch">
          <IntentProofSidebar
            intentPacks={intentPacks}
            activePackId={activeIntentPackId}
            onSelect={handleIntentSelect}
            searchQuery={intentQuery}
            onSearchChange={handleSearchChange}
            page={intentPage}
            onPageChange={handlePageChange}
          />

          <div className="flex min-w-0 flex-1 flex-col border-[#E5E5E5] lg:border-l">
            <nav
              className="flex flex-wrap gap-1 border-b border-[#E5E5E5] bg-[#f8f8f6] p-2"
              aria-label="Payment proof details"
            >
              {INTENT_SUBTABS.map((t) => (
                <Link
                  key={t}
                  href={subtabHref(t)}
                  scroll={false}
                  className={`rounded-[0.6rem] px-3 py-1.5 text-[13px] font-semibold transition ${
                    currentSubtab === t
                      ? 'bg-white text-[#111111] shadow-sm ring-1 ring-[#E5E5E5]'
                      : 'text-[#6f716d] hover:bg-white/80 hover:text-[#111111]'
                  }`}
                >
                  {subtabLabels[t]}
                </Link>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <IntentTabContent
                subtab={currentSubtab}
                activeIntentPackId={activeIntentPackId}
                intentPack={intentPack}
                intentPackLoading={intentPackLoading}
                batchId={bid}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
