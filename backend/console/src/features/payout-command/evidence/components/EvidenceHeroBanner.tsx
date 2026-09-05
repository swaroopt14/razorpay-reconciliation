'use client'

type Props = {
  search: string
  onSearchChange: (q: string) => void
  batchId: string
  onBatchChange: (id: string) => void
  batchOptions: { batch_id: string }[]
}

export function EvidenceHeroBanner({
  search,
  onSearchChange,
  batchId,
  onBatchChange,
  batchOptions,
}: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-r from-[#f8f8f6] via-white to-[#eef2f7] px-4 py-3.5 shadow-sm ring-1 ring-black/[0.04] sm:px-5">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.2) 0%, transparent 70%)' }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-md">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search packs, payment ref, intent…"
            className="h-10 w-full rounded-xl border border-slate-200/90 bg-white pl-10 pr-4 text-[13px] text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#103a9e]/40 focus:outline-none focus:ring-2 focus:ring-[#4a6fe6]/20"
          />
        </div>
        <label className="relative shrink-0">
          <span className="sr-only">Batch</span>
          <select
            value={batchId}
            onChange={(e) => onBatchChange(e.target.value)}
            className="h-10 min-w-[10rem] max-w-[240px] appearance-none rounded-xl border border-slate-200/90 bg-white py-0 pl-3.5 pr-9 text-[13px] font-semibold text-slate-800 shadow-sm focus:border-[#103a9e]/40 focus:outline-none focus:ring-2 focus:ring-[#4a6fe6]/20"
          >
            <option value="">All batches</option>
            {batchOptions.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.batch_id.length > 28 ? `${b.batch_id.slice(0, 28)}…` : b.batch_id}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            ▾
          </span>
        </label>
      </div>
    </section>
  )
}
