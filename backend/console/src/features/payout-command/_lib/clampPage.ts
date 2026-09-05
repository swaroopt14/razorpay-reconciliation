/** Keep 1-based page index within [1, totalPages] (totalPages is at least 1). */
export function clampPage(page: number, totalPages: number): number {
  const max = Math.max(1, totalPages)
  return Math.min(Math.max(1, page), max)
}

/** Keep 0-based page index within [0, totalPages - 1]. */
export function clampZeroBasedPage(page: number, totalPages: number): number {
  const maxIndex = Math.max(0, totalPages - 1)
  return Math.min(Math.max(0, page), maxIndex)
}
