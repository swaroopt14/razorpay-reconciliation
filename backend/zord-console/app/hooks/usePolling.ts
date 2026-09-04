'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createPolling } from '@/utils'

interface UsePollingOptions<T> {
  fetchFn: () => Promise<T>
  shouldStop: (data: T) => boolean
  interval?: number
  enabled?: boolean
  onUpdate?: (data: T) => void
}

export function usePolling<T>({
  fetchFn,
  shouldStop,
  interval = 3000,
  enabled = true,
  onUpdate,
}: UsePollingOptions<T>) {
  const stopPollingRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (stopPollingRef.current) {
        stopPollingRef.current()
        stopPollingRef.current = null
      }
      return
    }

    const poll = createPolling(fetchFn, shouldStop, interval)
    const stop = poll((data) => {
      onUpdate?.(data)
    })

    stopPollingRef.current = stop

    return () => {
      stop()
      stopPollingRef.current = null
    }
  }, [fetchFn, shouldStop, interval, enabled, onUpdate])

  const stop = useCallback(() => {
    if (stopPollingRef.current) {
      stopPollingRef.current()
      stopPollingRef.current = null
    }
  }, [])

  return { stop }
}
