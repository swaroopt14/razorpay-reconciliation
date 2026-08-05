'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * EnvironmentProvider — top-level client provider that owns the sandbox/live mode
 * for the current session and the activate-live wizard status.
 *
 * Why: a single source of truth for "am I in test mode?" so every surface (dock nav,
 * banner, API key page, dispatch flows) reads the same value. Persists to localStorage
 * so a refresh keeps the user where they were, and to a session cookie so the server
 * could read it later (currently unused server-side).
 */

export type EnvMode = 'sandbox' | 'live'
export type LiveActivationStatus = 'not_started' | 'in_review' | 'active'

type EnvironmentState = {
  mode: EnvMode
  setMode: (mode: EnvMode) => void
  liveActivationStatus: LiveActivationStatus
  setLiveActivationStatus: (status: LiveActivationStatus) => void
  /** True when the user can flip the toggle to Live (i.e. activation was approved). */
  canSwitchToLive: boolean
  /** Marks a sandbox-checklist action complete; persisted in localStorage. */
  completeChecklistItem: (id: ChecklistItemId) => void
  checklistComplete: Record<ChecklistItemId, boolean>
}

export type ChecklistItemId = 'run_scenario' | 'upload_test_file' | 'view_api_keys' | 'view_docs'

const STORAGE_KEY = 'zord:environment'
const COOKIE_KEY = 'zord_env_mode'

const EnvironmentContext = createContext<EnvironmentState | null>(null)

type StoredState = {
  mode: EnvMode
  liveActivationStatus: LiveActivationStatus
  checklistComplete: Record<ChecklistItemId, boolean>
}

const DEFAULT_STATE: StoredState = {
  mode: 'sandbox',
  liveActivationStatus: 'not_started',
  checklistComplete: {
    run_scenario: false,
    upload_test_file: false,
    view_api_keys: false,
    view_docs: false,
  },
}

function loadFromStorage(): StoredState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<StoredState>
    return {
      mode: parsed.mode === 'live' ? 'live' : 'sandbox',
      liveActivationStatus: parsed.liveActivationStatus ?? 'not_started',
      checklistComplete: { ...DEFAULT_STATE.checklistComplete, ...(parsed.checklistComplete ?? {}) },
    }
  } catch {
    return DEFAULT_STATE
  }
}

/**
 * First paint + SSR must match — do not read localStorage here (client-only).
 * `routeMode` from the route wins; otherwise default sandbox until hydration effect runs.
 */
function getInitialStoredState(routeMode?: EnvMode): StoredState {
  return {
    ...DEFAULT_STATE,
    mode: routeMode ?? DEFAULT_STATE.mode,
  }
}

function persistToStorage(state: StoredState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded / privacy mode — silently ignore.
  }
}

function persistModeCookie(mode: EnvMode) {
  if (typeof document === 'undefined') return
  // 30-day session cookie. SameSite=Lax so it survives same-origin nav.
  document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}

export function EnvironmentProvider({
  children,
  routeMode,
}: {
  children: ReactNode
  /**
   * If set (typically from the route — `/sandbox` passes 'sandbox',
   * `/payout-command-view/today` passes 'live'), forces the mode for this
   * tree regardless of localStorage. The user reaches the other mode by
   * navigating to its route, not by toggling state in place.
   */
  routeMode?: EnvMode
}) {
  const [hydrated, setHydrated] = useState(false)
  const [state, setState] = useState<StoredState>(() => getInitialStoredState(routeMode))

  // Re-sync prefs when `routeMode` changes or after SSR → client.
  useEffect(() => {
    const loaded = loadFromStorage()
    const effectiveMode: EnvMode = routeMode ?? loaded.mode
    setState({ ...loaded, mode: effectiveMode })
    persistModeCookie(effectiveMode)
    setHydrated(true)
  }, [routeMode])

  // Persist on any state change (after hydration).
  useEffect(() => {
    if (!hydrated) return
    persistToStorage(state)
    persistModeCookie(state.mode)
  }, [state, hydrated])

  const setMode = useCallback((mode: EnvMode) => {
    setState((prev) => ({ ...prev, mode }))
  }, [])

  const setLiveActivationStatus = useCallback((liveActivationStatus: LiveActivationStatus) => {
    setState((prev) => ({ ...prev, liveActivationStatus }))
  }, [])

  const completeChecklistItem = useCallback((id: ChecklistItemId) => {
    setState((prev) => ({
      ...prev,
      checklistComplete: { ...prev.checklistComplete, [id]: true },
    }))
  }, [])

  const value = useMemo<EnvironmentState>(
    () => ({
      mode: state.mode,
      setMode,
      liveActivationStatus: state.liveActivationStatus,
      setLiveActivationStatus,
      canSwitchToLive: state.liveActivationStatus === 'active',
      completeChecklistItem,
      checklistComplete: state.checklistComplete,
    }),
    [state, setMode, setLiveActivationStatus, completeChecklistItem],
  )

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export function useEnvironment(): EnvironmentState {
  const ctx = useContext(EnvironmentContext)
  if (!ctx) {
    throw new Error('useEnvironment must be used inside <EnvironmentProvider>')
  }
  return ctx
}
