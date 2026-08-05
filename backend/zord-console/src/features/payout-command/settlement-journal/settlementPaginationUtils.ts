/** Compute inclusive pagination range labels from API pagination metadata. */
export function settlementObservationPageRange(opts: {
  page: number
  pageSize: number
  total: number | null
}): { start: number; end: number; total: number; totalPages: number } {
  const total = opts.total ?? 0
  if (total <= 0) {
    return { start: 0, end: 0, total: 0, totalPages: 1 }
  }
  const pageSize = Math.max(1, opts.pageSize)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, opts.page), totalPages)
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return { start, end, total, totalPages }
}
