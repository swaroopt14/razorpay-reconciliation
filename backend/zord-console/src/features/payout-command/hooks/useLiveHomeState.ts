'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useMemo, useState } from 'react'
import {
  defaultHomeCommandFilters,
  type HomeCommandFilters,
  type HomeOverviewSnapshot,
  type HomeTimeframe,
} from '@/services/payout-command/model'
import {
  buildLiveHomeOverviewSnapshot,
  currentHomeYear,
  liveHomeYearOptions,
} from '@/services/payout-command/liveHomeCalendar'

export type LiveHomeState = {
  snapshot: HomeOverviewSnapshot
  timeframe: HomeTimeframe
  year: number
  yearOptions: readonly number[]
  quarterIndex: number
  setTimeframe: (timeframe: HomeTimeframe) => void
  setYear: (year: number) => void
  setQuarterIndex: (index: number) => void
  applyScopeFromPrompt: (prompt: string) => void
  commandFilters: HomeCommandFilters
  setCommandFilters: Dispatch<SetStateAction<HomeCommandFilters>>
}

function timeframeFromPrompt(prompt: string, current: HomeTimeframe): HomeTimeframe {
  const lower = prompt.toLowerCase()
  if (lower.includes('today') || lower.includes('now')) return 'Today'
  if (lower.includes('week')) return 'Week'
  if (lower.includes('month')) return 'Month'
  if (lower.includes('quarter') || lower.includes('qtd')) return 'Quarter'
  if (lower.includes('year') || lower.includes('ytd')) return 'Year'
  return current
}

function yearFromPrompt(prompt: string, current: number, options: readonly number[]): number {
  const match = prompt.match(/\b(20\d{2})\b/)
  if (!match) return current
  const parsed = Number(match[1])
  return options.includes(parsed) ? parsed : current
}

function quarterFromPrompt(prompt: string, current: number): number {
  const lower = prompt.toLowerCase()
  if (lower.includes('q1') || lower.includes('first quarter')) return 0
  if (lower.includes('q2') || lower.includes('second quarter')) return 1
  if (lower.includes('q3') || lower.includes('third quarter')) return 2
  if (lower.includes('q4') || lower.includes('fourth quarter')) return 3
  return current
}

export function useLiveHomeState(_isActive: boolean): LiveHomeState {
  const yearOptions = useMemo(() => liveHomeYearOptions(), [])
  const [timeframe, setTimeframeRaw] = useState<HomeTimeframe>('Month')
  const [year, setYearRaw] = useState(() => currentHomeYear())
  const [quarterIndex, setQuarterIndexRaw] = useState(() => Math.floor(new Date().getMonth() / 3))
  const [commandFilters, setCommandFilters] = useState<HomeCommandFilters>(defaultHomeCommandFilters)

  const snapshot = useMemo(
    () => buildLiveHomeOverviewSnapshot(timeframe, year, quarterIndex),
    [quarterIndex, timeframe, year],
  )

  const setTimeframe = useCallback((tf: HomeTimeframe) => {
    setTimeframeRaw(tf)
  }, [])

  const setYear = useCallback((y: number) => {
    setYearRaw(y)
  }, [])

  const setQuarterIndex = useCallback((qi: number) => {
    setQuarterIndexRaw(qi)
  }, [])

  const applyScopeFromPrompt = useCallback(
    (prompt: string) => {
      const cleaned = prompt.trim()
      if (!cleaned) return
      setTimeframeRaw((current) => timeframeFromPrompt(cleaned, current))
      setYearRaw((current) => yearFromPrompt(cleaned, current, yearOptions))
      setQuarterIndexRaw((current) => quarterFromPrompt(cleaned, current))
    },
    [yearOptions],
  )

  return {
    snapshot,
    timeframe,
    year,
    yearOptions,
    quarterIndex,
    setTimeframe,
    setYear,
    setQuarterIndex,
    applyScopeFromPrompt,
    commandFilters,
    setCommandFilters,
  }
}
