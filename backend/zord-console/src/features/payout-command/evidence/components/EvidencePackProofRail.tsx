'use client'

import { useCallback, useEffect, useState } from 'react'
import { evidenceCopy } from '../copy/evidenceCopy'
import { getEvidencePackTimeline } from '@/services/payout-command/prod-api/getEvidencePackTimeline'
import type { EvidenceTimelineEntry } from '@/services/payout-command/prod-api/evidenceTypes'
import { Glyph } from '../../shared'

function formatTimelineTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function shortNodeId(id: string): string {
  const t = id.trim()
  if (t.length <= 14) return t
  return `${t.slice(0, 8)}…${t.slice(-6)}`
}

function TimelineRow({ entry, index }: { entry: EvidenceTimelineEntry; index: number }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(entry.node_id).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }, [entry.node_id])

  return (
    <li className="relative pb-5 last:pb-0">
      <span
        className="absolute -left-[21px] top-1.5 flex h-2.5 w-2.5 rounded-full border-2 border-white bg-black ring-1 ring-black/30"
        aria-hidden
      />
      <p className="text-[11px] font-semibold tabular-nums text-slate-400">{formatTimelineTime(entry.timestamp)}</p>
      <p className="mt-0.5 text-[13px] font-medium leading-snug text-slate-900">{entry.event}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="font-mono text-[10.5px] text-slate-500" title={entry.node_id}>
          {shortNodeId(entry.node_id)}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-0.5 rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50"
        >
          <Glyph name={copied ? 'check' : 'copy'} className="h-2.5 w-2.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="sr-only">Step {index + 1}</span>
    </li>
  )
}

export function EvidencePackProofRail({ packId }: { packId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<EvidenceTimelineEntry[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void getEvidencePackTimeline(packId).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) {
        setError(err)
        setEntries([])
      } else {
        setEntries(data?.timeline ?? [])
        setError(null)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [packId])

  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {evidenceCopy.graph.timelineTitle}
      </h2>
      {loading ? (
        <p className="mt-4 text-[13px] text-slate-500">Loading timeline…</p>
      ) : error ? (
        <p className="mt-4 text-[13px] text-amber-800">{error}</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">{evidenceCopy.graph.timelineEmpty}</p>
      ) : (
        <ol className="relative mt-4 space-y-0 border-l border-slate-200 pl-5">
          {entries.map((entry, i) => (
            <TimelineRow key={`${entry.node_id}-${entry.timestamp}`} entry={entry} index={i} />
          ))}
        </ol>
      )}
    </section>
  )
}
