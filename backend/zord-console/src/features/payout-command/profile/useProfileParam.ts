'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * URL-synced profile selection (`?borrower=` / `?loan=`) for full-page 360 views.
 * Keeps the surface mounted so queue filters/page survive open → back.
 */
export function useProfileParam(param: string) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const read = () => {
      setSelectedId(new URLSearchParams(window.location.search).get(param))
    }
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [param])

  const open = useCallback(
    (id: string) => {
      setSelectedId(id)
      const url = new URL(window.location.href)
      url.searchParams.set(param, id)
      window.history.pushState({}, '', url)
    },
    [param],
  )

  const close = useCallback(() => {
    setSelectedId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete(param)
    window.history.pushState({}, '', url)
  }, [param])

  return { selectedId, open, close }
}
