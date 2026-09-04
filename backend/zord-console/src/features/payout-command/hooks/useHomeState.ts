'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildStaticHomeOverviewSnapshot,
  defaultHomeCommandFilters,
  homeCommandFilterMultiplier,
  homeSimulationScenarios,
  resolveHomeQuarterFromPrompt,
  resolveHomeTimeframeFromPrompt,
  resolveHomeYearFromPrompt,
  resolvePromptScenario,
  type HomeCommandFilters,
  type HomeOverviewSnapshot,
  type HomeSimulation,
  type HomeTimeframe,
} from '@/services/payout-command/model'

export type HomeState = {
  scenario: HomeSimulation
  snapshot: HomeOverviewSnapshot
  timeframe: HomeTimeframe
  year: 2026 | 2027 | 2028
  quarterIndex: number
  activeChartPoint: number
  setTimeframe: (timeframe: HomeTimeframe) => void
  setYear: (year: 2026 | 2027 | 2028) => void
  setQuarterIndex: (index: number) => void
  setActiveChartPoint: (point: number) => void
  applyScopeFromPrompt: (prompt: string) => void
  commandFilters: HomeCommandFilters
  setCommandFilters: Dispatch<SetStateAction<HomeCommandFilters>>
}

export function useHomeState(_isActive: boolean): HomeState {
  const [scenario, setScenario] = useState<HomeSimulation>(homeSimulationScenarios[0])
  const [timeframe, setTimeframeRaw] = useState<HomeTimeframe>('Month')
  const [year, setYearRaw] = useState<2026 | 2027 | 2028>(2026)
  const [quarterIndex, setQuarterIndexRaw] = useState(0)
  const [activeChartPoint, setActiveChartPoint] = useState(0)
  const [commandFilters, setCommandFilters] = useState<HomeCommandFilters>(defaultHomeCommandFilters)

  const filterMultiplier = useMemo(() => homeCommandFilterMultiplier(commandFilters), [commandFilters])

  const snapshot = useMemo(
    () => buildStaticHomeOverviewSnapshot(scenario, timeframe, year, quarterIndex, filterMultiplier),
    [filterMultiplier, quarterIndex, scenario, timeframe, year],
  )

  const setTimeframe = useCallback((tf: HomeTimeframe) => {
    setTimeframeRaw(tf)
  }, [])

  const setYear = useCallback((y: 2026 | 2027 | 2028) => {
    setYearRaw(y)
  }, [])

  const setQuarterIndex = useCallback((qi: number) => {
    setQuarterIndexRaw(qi)
  }, [])

  useEffect(() => {
    const [start, end] = snapshot.range
    setActiveChartPoint(Math.round((start + end) / 2))
  }, [snapshot.range])

  const applyScopeFromPrompt = useCallback(
    (prompt: string) => {
      const cleaned = prompt.trim()
      if (!cleaned) return

      const nextScenario = resolvePromptScenario(cleaned, homeSimulationScenarios, homeSimulationScenarios[0])
      setScenario(nextScenario)
      setTimeframeRaw(resolveHomeTimeframeFromPrompt(cleaned, timeframe))
      setYearRaw(resolveHomeYearFromPrompt(cleaned, year))
      setQuarterIndexRaw(resolveHomeQuarterFromPrompt(cleaned, quarterIndex))
    },
    [quarterIndex, timeframe, year],
  )

  return {
    scenario,
    snapshot,
    timeframe,
    year,
    quarterIndex,
    activeChartPoint,
    setTimeframe,
    setYear,
    setQuarterIndex,
    setActiveChartPoint,
    applyScopeFromPrompt,
    commandFilters,
    setCommandFilters,
  }
}
