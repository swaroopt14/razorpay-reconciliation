'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Sync leakage/ambiguity batch dropdown with ?dock=&batch_id= URL params. */
export function useIntelligenceBatchUrlSync(dock: 'leakage' | 'ambiguity') {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  return useCallback(
    (batchId: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('dock', dock)
      const trimmed = batchId?.trim()
      if (trimmed) params.set('batch_id', trimmed)
      else params.delete('batch_id')
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [dock, pathname, router, searchParams],
  )
}

export function useBatchSelectWithUrl(
  dock: 'leakage' | 'ambiguity',
  setSelectedBatchId: (id: string | undefined) => void,
) {
  const syncUrl = useIntelligenceBatchUrlSync(dock)
  return useCallback(
    (batchId: string | undefined) => {
      setSelectedBatchId(batchId)
      syncUrl(batchId)
    },
    [setSelectedBatchId, syncUrl],
  )
}
