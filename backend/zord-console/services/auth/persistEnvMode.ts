import type { EnvMode } from '@/services/auth/EnvironmentProvider'

const STORAGE_KEY = 'zord:environment'
const COOKIE_KEY = 'zord_env_mode'

const defaultChecklist = {
  run_scenario: false,
  upload_test_file: false,
  view_api_keys: false,
  view_docs: false,
}

/**
 * Persists sandbox vs live mode (localStorage + cookie) so EnvironmentProvider
 * stays aligned with the India console.
 */
export function persistEnvMode(mode: EnvMode) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    let parsed: Record<string, unknown> = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        parsed = {}
      }
    }
    const existingChecklist =
      typeof parsed.checklistComplete === 'object' && parsed.checklistComplete !== null
        ? (parsed.checklistComplete as Record<string, boolean>)
        : {}
    const checklistComplete = { ...defaultChecklist, ...existingChecklist }
    const next = {
      mode,
      liveActivationStatus:
        typeof parsed.liveActivationStatus === 'string' ? parsed.liveActivationStatus : 'not_started',
      checklistComplete,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota / privacy mode */
  }
  document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}
