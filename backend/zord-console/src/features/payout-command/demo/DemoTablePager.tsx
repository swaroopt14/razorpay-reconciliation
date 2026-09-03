'use client'

export const DEMO_TABLE_PAGE_SIZES = [20, 50, 100, 200] as const
export type DemoTablePageSize = (typeof DEMO_TABLE_PAGE_SIZES)[number]

type DemoTablePagerProps = {
  page: number
  pageSize: number
  total: number
  noun: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: DemoTablePageSize) => void
}

export function DemoTablePager({
  page,
  pageSize,
  total,
  noun,
  onPageChange,
  onPageSizeChange,
}: DemoTablePagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(safePage * pageSize, total)

  return (
    <div className="border-t border-[#E5E5E5] bg-[#F8FAFC] px-4 py-2.5 text-[13px] text-[#64748B]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Showing {from}–{to} of {total.toLocaleString('en-IN')} {noun}
        </span>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value) as DemoTablePageSize)
              onPageChange(1)
            }}
            className="rounded border border-[#E5E5E5] bg-white px-2 py-1 text-[13px] text-[#0B1324]"
          >
            {DEMO_TABLE_PAGE_SIZES.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="rounded border border-[#E5E5E5] bg-white px-2 py-1 text-[#0B1324] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="rounded border border-[#E5E5E5] bg-white px-2 py-1 text-[#0B1324] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
