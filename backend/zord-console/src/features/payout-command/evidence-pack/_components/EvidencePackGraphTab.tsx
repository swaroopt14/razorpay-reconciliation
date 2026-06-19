'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MerkleGraphSurface } from '../../surfaces/MerkleGraphSurface'
import { EvidencePackVerifyCard } from '../../evidence/components/EvidencePackVerifyCard'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import { isBatchEvidencePack } from '@/services/payout-command/prod-api/resolveBatchEvidencePack'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'

type EvidencePackGraphTabProps = {
  packId: string
  batchId?: string
  intentId?: string
}

type GraphScope = 'batch' | 'intent'

function isBatchPack(summary: EvidencePackSummaryRow): boolean {
  return isBatchEvidencePack(summary)
}

function optionLabel(summary: EvidencePackSummaryRow): string {
  const pack = apiTrimmedString(summary.evidence_pack_id)
  const mode = apiTrimmedString(summary.mode)
  const intent = apiTrimmedString(summary.intent_id)
  const ref = apiTrimmedString(summary.client_payout_ref) || apiTrimmedString(summary.client_reference)
  const head = pack.length > 20 ? `${pack.slice(0, 20)}…` : pack
  if (isBatchPack(summary)) return `${head} · ${mode || 'BATCH'}`
  const intentHead = (ref || intent).slice(0, 18)
  return `${intentHead}${intent.length > 18 ? '…' : ''} · ${head}`
}

export function EvidencePackGraphTab({ packId, batchId, intentId }: EvidencePackGraphTabProps) {
  const bid = apiTrimmedString(batchId)
  const [scope, setScope] = useState<GraphScope>('intent')
  const [batchPacks, setBatchPacks] = useState<EvidencePackSummaryRow[]>([])
  const [intentPacks, setIntentPacks] = useState<EvidencePackSummaryRow[]>([])
  const [packLoading, setPackLoading] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [selectedBatchPackId, setSelectedBatchPackId] = useState<string | null>(null)
  const [selectedIntentPackId, setSelectedIntentPackId] = useState<string>(packId)
  const [viewPackId, setViewPackId] = useState(packId)

  useEffect(() => {
    setSelectedIntentPackId(packId)
    setViewPackId(packId)
  }, [packId])

  useEffect(() => {
    if (!bid) {
      setBatchPacks([])
      setIntentPacks([])
      setPackLoading(false)
      setPackError(null)
      setScope('intent')
      setSelectedBatchPackId(null)
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
        setSelectedBatchPackId(null)
        setPackLoading(false)
        return
      }

      const batches = rows.filter(isBatchPack)
      const intents = rows.filter((row) => !isBatchPack(row))
      setBatchPacks(batches)
      setIntentPacks(intents)

      const opened = rows.find((row) => apiTrimmedString(row.evidence_pack_id) === apiTrimmedString(packId))
      const openedIsBatch = opened ? isBatchPack(opened) : false
      setScope(
        batches.length === 0
          ? 'intent'
          : openedIsBatch
            ? 'batch'
            : opened
              ? 'intent'
              : 'batch',
      )

      const nextBatchPack =
        (openedIsBatch ? apiTrimmedString(opened?.evidence_pack_id) : '') ||
        apiTrimmedString(batches[0]?.evidence_pack_id) ||
        null
      setSelectedBatchPackId(nextBatchPack)

      const nextIntentPack =
        (!openedIsBatch ? apiTrimmedString(opened?.evidence_pack_id) : '') ||
        apiTrimmedString(intents[0]?.evidence_pack_id) ||
        packId
      setSelectedIntentPackId(nextIntentPack)

      setPackLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [bid, packId])

  const activePackId = useMemo(() => {
    if (scope === 'batch') return selectedBatchPackId
    return selectedIntentPackId || packId
  }, [scope, selectedBatchPackId, selectedIntentPackId, packId])

  useEffect(() => {
    setViewPackId(activePackId || packId)
  }, [activePackId, packId])

  const handleActivePackIdChange = useCallback(
    (nextPackId: string) => {
      const next = apiTrimmedString(nextPackId)
      if (!next) return
      setViewPackId((prev) => (prev === next ? prev : next))
      if (scope === 'batch') {
        setSelectedBatchPackId((prev) => (prev === next ? prev : next))
      } else {
        setSelectedIntentPackId((prev) => (prev === next ? prev : next))
      }
    },
    [scope],
  )

  const batchUnavailable = scope === 'batch' && !activePackId

  return (
    <div className="space-y-4">
      {bid || intentId ? (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[#E5E5E5] bg-[#fafafa] px-4 py-3 text-[13px]">
          {bid ? (
            <span>
              <span className="font-semibold text-slate-500">Batch </span>
              <span className="font-mono font-semibold text-slate-900">{bid}</span>
            </span>
          ) : null}
          {intentId ? (
            <span>
              <span className="font-semibold text-slate-500">Opened from intent </span>
              <span className="font-mono font-semibold text-slate-900" title={intentId}>
                {intentId.length > 24 ? `${intentId.slice(0, 24)}…` : intentId}
              </span>
            </span>
          ) : null}
          <span className="text-slate-500">
            Use <strong className="text-slate-700">Intent · pack</strong> below to switch to another payment in this batch.
          </span>
        </div>
      ) : null}

      {bid ? (
        <div className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-1">
              <button
                type="button"
                onClick={() => setScope('batch')}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                  scope === 'batch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Batch graph ({batchPacks.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('intent')}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                  scope === 'intent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Intent graph ({intentPacks.length})
              </button>
            </div>

            {scope === 'intent' ? (
              <select
                value={selectedIntentPackId}
                onChange={(e) => setSelectedIntentPackId(e.target.value)}
                className="min-w-[16rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-900"
                disabled={packLoading || intentPacks.length === 0}
              >
                {intentPacks.length === 0 ? (
                  <option value="">No intent packs in this batch</option>
                ) : (
                  intentPacks.map((row) => {
                    const value = apiTrimmedString(row.evidence_pack_id)
                    return (
                      <option key={value} value={value}>
                        {optionLabel(row)}
                      </option>
                    )
                  })
                )}
              </select>
            ) : batchPacks.length > 1 ? (
              <select
                value={selectedBatchPackId ?? ''}
                onChange={(e) => setSelectedBatchPackId(e.target.value || null)}
                className="min-w-[16rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-900"
                disabled={packLoading}
              >
                {batchPacks.map((row) => {
                  const value = apiTrimmedString(row.evidence_pack_id)
                  return (
                    <option key={value} value={value}>
                      {optionLabel(row)}
                    </option>
                  )
                })}
              </select>
            ) : null}
          </div>
          {packError ? <p className="mt-2 text-[12px] font-medium text-amber-700">{packError}</p> : null}
        </div>
      ) : null}

      {batchUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Batch pack not available for this batch. Intent graph remains available.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          {!batchUnavailable ? <EvidencePackVerifyCard packId={viewPackId} /> : null}
        </div>
        <div className="min-w-0">
          {!batchUnavailable ? (
            <MerkleGraphSurface
              initialPackId={packId}
              embedMode
              controlledBatchId={bid || undefined}
              controlledPackId={viewPackId}
              intentOptionsSource="table"
              hideScopePickers
              onActivePackIdChange={handleActivePackIdChange}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
