/** Spec demo entry - rectangular IT infrastructure panel (navy + azure, no violet). */
export function ZordInfrastructureBanner() {
  return (
    <div className="relative overflow-hidden rounded-none bg-[#0B1324]" aria-hidden>
      {/* Full-bleed rectangular infrastructure visual */}
      <div className="relative aspect-[16/9] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/zord-it-infrastructure-banner.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1324] via-[#0B1324]/55 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1324]/70 via-transparent to-[#0B1324]/35" />
      </div>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-4 pt-10 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">
              System infrastructure
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-white">
              Payment Action Contract → Evidence Pack
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              ERP / File / API · Policy + Seal · Bank / PSP / Trace
            </p>
          </div>
          <span className="shrink-0 rounded-sm border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-semibold text-[#BFDBFE]">
            Non-custodial
          </span>
        </div>
      </div>
    </div>
  )
}
