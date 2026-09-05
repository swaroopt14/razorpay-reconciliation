'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'

type Action = {
  id: string
  title: string
  subtitle: string
  href?: string
  onClick?: () => void
  accent: string
}

type Props = {
  batchId: string
  firstPackId?: string
}

const ICONS: Record<string, ReactNode> = {
  export: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  verify: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 12l2 2 4-4M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    </svg>
  ),
  batch: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 4v4M16 4v4" />
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
}

export function EvidenceQuickActions({ batchId, firstPackId }: Props) {
  const pathname = usePathname()

  const actions: Action[] = [
    {
      id: 'export',
      title: 'Export Pack',
      subtitle: 'Download proof',
      href: firstPackId
        ? `/payout-command-view/evidence-pack/${encodeURIComponent(firstPackId)}?tab=export`
        : undefined,
      accent: '#4a6fe6',
    },
    {
      id: 'verify',
      title: 'Verify Hash',
      subtitle: 'Check integrity',
      href: firstPackId
        ? `/payout-command-view/evidence-pack/${encodeURIComponent(firstPackId)}`
        : undefined,
      accent: '#103a9e',
    },
    {
      id: 'batch',
      title: 'Open Batch',
      subtitle: 'Intent journal',
      href: batchId ? `${pathname}?dock=grid&batch_id=${encodeURIComponent(batchId)}` : undefined,
      accent: '#000000',
    },
    {
      id: 'grid',
      title: 'Review Grid',
      subtitle: 'Operations view',
      href: `${pathname}?dock=grid`,
      accent: '#00239C',
    },
  ]

  return (
    <section className={EVIDENCE_CARD}>
      <EvidenceSectionHeader title="Quick actions" subtitle="Jump to export, verification, or related workspaces" />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        {actions.map((action) => {
          const inner = (
            <>
              <div
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-md"
                style={{ background: action.accent }}
              >
                {ICONS[action.id]}
              </div>
              <p className="mt-3 text-[13px] font-semibold text-slate-900">{action.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{action.subtitle}</p>
            </>
          )

          const className =
            'group flex flex-col items-center rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center transition hover:border-slate-200 hover:bg-white hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]'

          if (action.href) {
            return (
              <Link key={action.id} href={action.href} className={className}>
                {inner}
              </Link>
            )
          }

          return (
            <button
              key={action.id}
              type="button"
              disabled={!action.onClick && !action.href}
              onClick={action.onClick}
              className={`${className} disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </section>
  )
}
