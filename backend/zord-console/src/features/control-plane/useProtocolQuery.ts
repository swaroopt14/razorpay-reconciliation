'use client'

import { useCallback, useEffect, useState } from 'react'

export function useProtocolQuery<T>(key: string, loader: () => Promise<T>, fallback?: T) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then((value) => {
        if (!cancelled) {
          setData(value)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // If a fallback is provided, use it instead of showing error
          if (fallback != null) {
            setData(fallback)
            setError(null)
            setLoading(false)
          } else {
            setError(err instanceof Error ? err.message : 'load_failed')
            setLoading(false)
          }
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload via tick; loader identity is keyed
  }, [key, tick])

  return { data, error, loading, setData, reload }
}
