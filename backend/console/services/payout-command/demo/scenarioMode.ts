/** India vs Cross border console mode. Default is India (current UI). */

export const SCENARIO_INR = 'inr' as const
export const SCENARIO_CROSS_BORDER = 'cross-border' as const
export type ConsoleScenario = typeof SCENARIO_INR | typeof SCENARIO_CROSS_BORDER

export const SCENARIO_STORAGE_KEY = 'zord_console_scenario'
export const SCENARIO_QUERY = 'scenario'

export const CROSS_BORDER_TRACE_ID = 'trc_novacell_inv10482'
export const CROSS_BORDER_PAC_ID = 'pac_novacell_eu_10482'
export const CROSS_BORDER_EXCEPTION_ID = 'exc_novacell_late_ack'
export const CROSS_BORDER_AGENT_ID = 'agt_treasury_eu_04'

/** All registered agents — policy attachment targets all four. */
export const ALL_AGENT_IDS = [
  'agt_treasury_eu_04',
  'agt_dispatch_coord_01',
  'agt_lifecycle_obs_01',
  'agt_resolution_01',
] as const

export const STRUCTURE_ATTACH_STORAGE_KEY = 'zord_demo_agent_structure_id'

export function parseScenario(value: string | null | undefined): ConsoleScenario {
  return value === SCENARIO_CROSS_BORDER || value === 'eur' || value === 'europe'
    ? SCENARIO_CROSS_BORDER
    : SCENARIO_INR
}

export function isCrossBorderPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/actions') ||
    pathname.startsWith('/agents') ||
    pathname.startsWith('/build/protocol') ||
    pathname.startsWith('/exceptions') ||
    pathname.startsWith('/proof/trc_')
  )
}

export function getStoredScenario(): ConsoleScenario {
  if (typeof window === 'undefined') return SCENARIO_INR
  try {
    const q = new URLSearchParams(window.location.search)
    const fromUrl = q.get(SCENARIO_QUERY)
    if (fromUrl) {
      const parsed = parseScenario(fromUrl)
      sessionStorage.setItem(SCENARIO_STORAGE_KEY, parsed)
      return parsed
    }
    if (isCrossBorderPath(window.location.pathname)) {
      sessionStorage.setItem(SCENARIO_STORAGE_KEY, SCENARIO_CROSS_BORDER)
      return SCENARIO_CROSS_BORDER
    }
    const stored = sessionStorage.getItem(SCENARIO_STORAGE_KEY)
    if (stored) return parseScenario(stored)
  } catch {
    /* ignore */
  }
  return SCENARIO_INR
}

export function persistScenario(scenario: ConsoleScenario) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SCENARIO_STORAGE_KEY, scenario)
  } catch {
    /* ignore */
  }
}

/** Return a session-storage key scoped to the given scenario (or the current one). */
export function scenarioScopedKey(base: string, scenario?: ConsoleScenario): string {
  const mode = scenario ?? getStoredScenario()
  return `${base}_${mode}`
}

export function withScenarioScope(href: string, scenario?: ConsoleScenario): string {
  const mode = scenario ?? (typeof window !== 'undefined' ? getStoredScenario() : SCENARIO_INR)
  const [path, rawQs = ''] = href.split('?')
  const q = new URLSearchParams(rawQs)
  q.set(SCENARIO_QUERY, mode)
  return `${path}?${q.toString()}`
}

/** Same entry as India (Overview) — Control plane pages are additive in the rail only. */
export function crossBorderHomeHref(opts?: { guide?: boolean }): string {
  const q = new URLSearchParams({
    demo: 'sandbox',
    scenario: SCENARIO_CROSS_BORDER,
    batch_id: 'batch-001',
  })
  if (opts?.guide) q.set('guide', '1')
  return `/overview?${q.toString()}`
}

export function indiaHomeHref(opts?: { guide?: boolean }): string {
  const q = new URLSearchParams({
    demo: 'sandbox',
    scenario: SCENARIO_INR,
    batch_id: 'batch-001',
  })
  if (opts?.guide) q.set('guide', '1')
  return `/overview?${q.toString()}`
}
