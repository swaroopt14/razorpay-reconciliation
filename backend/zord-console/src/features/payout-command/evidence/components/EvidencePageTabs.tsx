'use client'

import type { EvidencePageTab } from '../types/evidenceViewModels'

type EvidencePageTabsProps = {
  active: EvidencePageTab
  onChange: (tab: EvidencePageTab) => void
}

const TABS: { id: EvidencePageTab; label: string }[] = [
  { id: 'workspace', label: 'Proof Workspace' },
]

export function EvidencePageTabs({ active, onChange }: EvidencePageTabsProps) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-xl border border-slate-200/90 bg-slate-100/80 p-1 shadow-inner"
      role="tablist"
      aria-label="Evidence views"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold tracking-tight transition-all ${
              isActive
                ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
