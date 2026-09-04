'use client'

/**
  * Compact sample links (legacy intake panel). Prefer BatchGetStartedCard on Batch Command Center.
  */
export function SampleFileDownloads({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'border border-[#E2E8F0] bg-[#F8FAFC] p-3'
          : 'mt-4 border border-[#E2E8F0] bg-[#F8FAFC] p-3'
      }
    >
      <p className="text-[12px] font-semibold text-[#0B1324]">Sample files</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <li>
          <a
            href="/samples/demo_intents_20.csv"
            download
            className="text-[12px] font-semibold text-[#2563EB] hover:underline"
          >
            Obligation file (valid)
          </a>
        </li>
        <li>
          <a
            href="/samples/demo_intents_with_issues.csv"
            download
            className="text-[12px] font-semibold text-[#2563EB] hover:underline"
          >
            Obligation file (with issues)
          </a>
        </li>
        <li>
          <a
            href="/samples/demo_settlement_exact.csv"
            download
            className="text-[12px] font-semibold text-[#2563EB] hover:underline"
          >
            Settlement file
          </a>
        </li>
      </ul>
    </div>
  )
}
