'use client'

import { useCallback, useEffect, useState } from 'react'
import { getProdDlqTerminalCount } from '@/services/payout-command/prod-api/getProdDlqTerminalCount'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'

/** Polls tenant-wide terminal DLQ count from intent-engine. */
export function useDlqTerminalCount(enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) {
      setCount(null)
      return
    }
    setLoading(true)
    try {
      const next = await getProdDlqTerminalCount()
      setCount(next)
    } catch {
      setCount(null)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setCount(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { count, loading, refetch: load }
}
