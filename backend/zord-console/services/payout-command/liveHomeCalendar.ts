import {
  clamp,
  HOME_QUARTERS,
  HOME_WEEKDAY_LABELS,
  type HomeOverviewSnapshot,
  type HomeTimeframe,
} from '@/services/payout-command/model'

export function currentHomeYear(now = new Date()): number {
  return now.getFullYear()
}

/** Backend-supported calendar years around the current operating year. */
export function liveHomeYearOptions(now = new Date()): number[] {
  const y = now.getFullYear()
  return [y - 1, y, y + 1]
}

function liveTimeframeLayout(timeframe: HomeTimeframe, quarterIndex: number, selectedYear: number) {
  if (timeframe === 'Today') {
    return {
      labels: ['6a', '9a', '12p', '3p', '6p', '9p', '12a', '3a'] as const,
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Today • operating day • ${selectedYear}`,
    }
  }
  if (timeframe === 'Week') {
    return {
      labels: [...HOME_WEEKDAY_LABELS] as readonly string[],
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Week view • Mon-Sun • ${selectedYear}`,
    }
  }
  if (timeframe === 'Year') {
    return {
      labels: ['Jan', 'Apr', 'Jul', 'Oct'] as const,
      holidayLabels: [] as readonly string[],
      timeframeLabel: `Year view • ${selectedYear}`,
    }
  }
  if (timeframe === 'Custom' || timeframe === 'Quarter') {
    const quarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]
    return {
      labels: quarter.months.map((month) => month.slice(0, 3)),
      holidayLabels: [] as readonly string[],
      timeframeLabel: `${quarter.name} • ${selectedYear}`,
    }
  }
  return {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] as const,
    holidayLabels: [] as readonly string[],
    timeframeLabel: `Month view • ${selectedYear}`,
  }
}

/** Calendar chrome for live Home. No simulation scenarios or seeded metric series. */
export function buildLiveHomeOverviewSnapshot(
  timeframe: HomeTimeframe,
  selectedYear: number,
  quarterIndex: number,
): HomeOverviewSnapshot {
  const layout = liveTimeframeLayout(timeframe, quarterIndex, selectedYear)
  const activeQuarter = HOME_QUARTERS[clamp(quarterIndex, 0, HOME_QUARTERS.length - 1)]

  return {
    metricValue: '—',
    title: 'Payment Command Center',
    summary:
      'Track payment instructions, settlement outcomes, match gaps, and proof readiness for this workspace.',
    tooltipValue: '—',
    tooltipDelta: '—',
    tooltipNote: 'Values come from live Services 2, 5, 6 and 7 for the selected window.',
    range: [0, 0],
    chartData: [],
    salesValue: '—',
    expensesValue: '—',
    budgetValue: '—',
    insightText: 'No simulated snapshot. Live KPIs load from backend time windows.',
    insightValue: '—',
    insightGaugeProgress: 0,
    forecastBars: [],
    budgetBars: [],
    axisLabels: layout.labels,
    quarterName: activeQuarter.name,
    quarterMonths: activeQuarter.months,
    selectedYear,
    holidayLabels: layout.holidayLabels,
    salesBaseValue: 0,
    expensesBaseValue: 0,
    budgetBaseValue: 0,
    insightBaseValue: 0,
    timeframeLabel: layout.timeframeLabel,
  }
}
