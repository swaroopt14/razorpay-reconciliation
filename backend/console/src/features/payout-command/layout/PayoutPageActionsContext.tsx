'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'

export type PayoutPageActionsRegistration = {
  refresh?: () => void | Promise<void>
  exportShare?: () => void
  refreshing?: boolean
  exportDisabled?: boolean
}

type PayoutPageActionsContextValue = {
  registerActions: (actions: PayoutPageActionsRegistration | null) => void
  triggerRefresh: () => Promise<void>
  triggerExportShare: () => void
  refreshing: boolean
  exportDisabled: boolean
  hasRefresh: boolean
  hasExport: boolean
}

const PayoutPageActionsContext = createContext<PayoutPageActionsContextValue | null>(null)

export function PayoutPageActionsProvider({ children }: { children: ReactNode }) {
  const actionsRef = useRef<PayoutPageActionsRegistration | null>(null)
  const [version, bumpVersion] = useReducer((n: number) => n + 1, 0)
  const [manualRefreshing, setManualRefreshing] = useReducer(
    (state: boolean, next: boolean) => next,
    false,
  )

  const registerActions = useCallback((actions: PayoutPageActionsRegistration | null) => {
    actionsRef.current = actions
    bumpVersion()
  }, [])

  const triggerRefresh = useCallback(async () => {
    const fn = actionsRef.current?.refresh
    if (!fn) return
    setManualRefreshing(true)
    try {
      await fn()
    } finally {
      setManualRefreshing(false)
    }
  }, [])

  const triggerExportShare = useCallback(() => {
    actionsRef.current?.exportShare?.()
  }, [])

  const value = useMemo((): PayoutPageActionsContextValue => {
    const registration = actionsRef.current
    return {
      registerActions,
      triggerRefresh,
      triggerExportShare,
      refreshing: manualRefreshing || Boolean(registration?.refreshing),
      exportDisabled: registration?.exportDisabled ?? true,
      hasRefresh: Boolean(registration?.refresh),
      hasExport: Boolean(registration?.exportShare),
    }
  }, [registerActions, triggerRefresh, triggerExportShare, manualRefreshing, version])

  return (
    <PayoutPageActionsContext.Provider value={value}>{children}</PayoutPageActionsContext.Provider>
  )
}

export function usePayoutPageActions() {
  const ctx = useContext(PayoutPageActionsContext)
  if (!ctx) {
    throw new Error('usePayoutPageActions must be used within PayoutPageActionsProvider')
  }
  return ctx
}

/** Surfaces call this to wire PageHeader refresh / export to local data loaders. */
export function useRegisterPayoutPageActions(payload: PayoutPageActionsRegistration) {
  const { registerActions } = usePayoutPageActions()
  const payloadRef = useRef(payload)
  payloadRef.current = payload

  const stableRefresh = useCallback(async () => {
    await payloadRef.current.refresh?.()
  }, [])

  const stableExport = useCallback(() => {
    payloadRef.current.exportShare?.()
  }, [])

  useEffect(() => {
    registerActions({
      refresh: payload.refresh ? stableRefresh : undefined,
      exportShare: payload.exportShare ? stableExport : undefined,
      refreshing: payload.refreshing,
      exportDisabled: payload.exportDisabled,
    })
    return () => registerActions(null)
  }, [
    registerActions,
    stableRefresh,
    stableExport,
    payload.refresh,
    payload.exportShare,
    payload.refreshing,
    payload.exportDisabled,
  ])
}
