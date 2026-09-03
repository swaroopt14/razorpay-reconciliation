'use client'

import { useState, type ReactNode } from 'react'
import { AwaitingUploadsEmptyState } from '@/features/payout-command/demo/AwaitingUploadsEmptyState'

export function copyText(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  void navigator.clipboard.writeText(value)
}

export function CopyChip({
  label,
  value,
  wide,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        copyText(value)
        setDone(true)
        window.setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#D8DEE9] bg-white px-2 py-1 text-left font-mono text-[11px] text-[#0B1324] hover:border-[#2E5BFF]"
      title={`Copy ${label}`}
    >
      <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
        {label}
      </span>
      <span className={wide ? 'break-all' : 'max-w-[180px] truncate'}>{value}</span>
      <span className="text-[#2E5BFF]">{done ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function ProtocolJsonPanel({ object, title = 'Protocol JSON' }: { object: unknown; title?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#D8DEE9] bg-[#0B1324]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">{title}</p>
        <button
          type="button"
          className="text-[11px] font-semibold text-[#93C5FD] hover:text-white"
          onClick={() => copyText(JSON.stringify(object, null, 2))}
        >
          Copy JSON
        </button>
      </div>
      <pre className="max-h-[480px] overflow-auto p-3 text-[11px] leading-relaxed text-[#E2E8F0]">
        {JSON.stringify(object, null, 2)}
      </pre>
    </div>
  )
}

export function EvidenceChip({
  kind,
  children,
}: {
  kind: 'agent' | 'deterministic' | 'verified' | 'inferred' | 'blocked'
  children: string
}) {
  const cls =
    kind === 'agent'
      ? 'bg-[#F3E8FF] text-[#6D4AFF]'
      : kind === 'deterministic'
        ? 'bg-[#E8EEFF] text-[#2E5BFF]'
        : kind === 'verified'
          ? 'bg-[#E7F6F0] text-[#138A63]'
          : kind === 'inferred'
            ? 'bg-[#F8F1E3] text-[#B7791F]'
            : 'bg-[#F8E8E7] text-[#C2413B]'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${cls}`}>
      {children}
    </span>
  )
}

export function ControlPlaneHeader({
  title,
  subtitle,
  chips,
}: {
  title: string
  subtitle: string
  chips?: ReactNode
}) {
  return (
    <header className="border-b border-[#D8DEE9] bg-white px-6 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
        Sandbox · Cross border · Zordnet Operations · Batch 001 · INR
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0B1324]">{title}</h1>
          <p className="mt-1 max-w-[640px] text-[13px] text-[#64748B]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">{chips}</div>
      </div>
    </header>
  )
}

function isUploadLockError(error: string) {
  return (
    error.includes('obligation_upload_required') ||
    error.includes('settlement_upload_required') ||
    error.includes('Upload an obligation') ||
    error.includes('Upload a settlement')
  )
}

export function PageState({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string | null
  children: ReactNode
}) {
  if (loading) {
    return <p className="px-6 py-10 text-[13px] text-[#64748B]">Loading protocol objects…</p>
  }
  if (error && isUploadLockError(error)) {
    return (
      <div className="p-6">
        <AwaitingUploadsEmptyState
          title="No payment obligations yet"
          require={error.includes('settlement') ? 'settlement' : 'intent'}
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="m-6 rounded-md border-l-4 border-[#CBD5E1] bg-[#F8FAFC] p-4">
        <p className="text-[13px] font-semibold text-[#0B1324]">Protocol source offline</p>
        <p className="mt-1 text-[12px] text-[#64748B]">
          The protocol source is not reachable. Start the smoke simulator on port 8099, or refresh after connecting.
        </p>
        <p className="mt-2 text-[11px] text-[#94A3B8] font-mono">{error}</p>
      </div>
    )
  }
  return <>{children}</>
}
