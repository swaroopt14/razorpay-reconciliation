'use client'

/**
 * Connected providers — localStorage-backed list of PSPs / banks the user
 * has hooked up in their sandbox. Without at least one connected provider,
 * intent dispatch is blocked (just like in production).
 *
 * Persists across refreshes; cross-tab sync via the `storage` event.
 */

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'zord:connected-providers'

export type ProviderId =
  | 'razorpay'
  | 'cashfree'
  | 'payu'
  | 'stripe'
  | 'hdfc_bank'
  | 'icici_bank'
  | 'sbi'

export type ProviderKind = 'psp' | 'bank'

export type ProviderHealth = 'healthy' | 'degraded' | 'down'

export type ConnectedProvider = {
  id: ProviderId
  kind: ProviderKind
  /** Display name (matches EntityLogo names so logos resolve). */
  name: string
  /** Rails this provider supports (IMPS, NEFT, NACH, UPI…). */
  rails: string[]
  /** Test API key prefix for the operator to recognise (last 4 visible only). */
  apiKeyDisplay: string
  /** Webhook endpoint Zord will receive callbacks on (sandbox URL). */
  webhookUrl: string
  connectedAt: string
  health: ProviderHealth
}

/** Catalog of providers a user can connect — drives the empty-state grid. */
export const PROVIDER_CATALOG: Array<{
  id: ProviderId
  kind: ProviderKind
  name: string
  rails: string[]
  description: string
}> = [
  { id: 'razorpay', kind: 'psp', name: 'Razorpay', rails: ['IMPS', 'NEFT', 'NACH'], description: 'PSP · IMPS, NEFT, NACH' },
  { id: 'cashfree', kind: 'psp', name: 'Cashfree', rails: ['IMPS', 'UPI', 'NEFT'], description: 'PSP · IMPS, UPI, NEFT' },
  { id: 'payu', kind: 'psp', name: 'PayU', rails: ['IMPS', 'NACH'], description: 'PSP · IMPS, NACH' },
  { id: 'stripe', kind: 'psp', name: 'Stripe', rails: ['Card', 'Bank Transfer'], description: 'PSP · Card, Bank Transfer' },
  { id: 'hdfc_bank', kind: 'bank', name: 'HDFC Bank', rails: ['NEFT', 'RTGS', 'IMPS', 'NACH'], description: 'Bank-direct · NEFT, RTGS, IMPS, NACH' },
  { id: 'icici_bank', kind: 'bank', name: 'ICICI Bank', rails: ['NEFT', 'RTGS', 'IMPS'], description: 'Bank-direct · NEFT, RTGS, IMPS' },
  { id: 'sbi', kind: 'bank', name: 'SBI', rails: ['NEFT', 'RTGS', 'NACH'], description: 'Bank-direct · NEFT, RTGS, NACH' },
]

function loadFromStorage(): ConnectedProvider[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ConnectedProvider[]) : []
  } catch {
    return []
  }
}

function persistToStorage(providers: ConnectedProvider[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providers))
  } catch {
    // Ignore quota / privacy mode.
  }
}

export function useConnectedProviders() {
  const [hydrated, setHydrated] = useState(false)
  const [providers, setProviders] = useState<ConnectedProvider[]>([])

  useEffect(() => {
    setProviders(loadFromStorage())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setProviders(loadFromStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    persistToStorage(providers)
  }, [providers, hydrated])

  /**
   * Connect a provider with sandbox credentials. The "API key" + webhook URL
   * passed in are not validated (this is the sandbox UI shell); a real
   * implementation would round-trip with the provider's test endpoint.
   */
  const connectProvider = useCallback((id: ProviderId, apiKey: string, webhookUrl: string) => {
    const catalog = PROVIDER_CATALOG.find((p) => p.id === id)
    if (!catalog) return
    const last4 = apiKey.replace(/\s+/g, '').slice(-4) || '0000'
    const apiKeyDisplay = `${id === 'stripe' ? 'sk_test_' : 'rzp_test_'}…${last4}`
    setProviders((prev) => {
      const existing = prev.findIndex((p) => p.id === id)
      const entry: ConnectedProvider = {
        id,
        kind: catalog.kind,
        name: catalog.name,
        rails: catalog.rails,
        apiKeyDisplay,
        webhookUrl: webhookUrl || `https://api.zord.com/sandbox/webhooks/${id}`,
        connectedAt: new Date().toISOString(),
        health: 'healthy',
      }
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = entry
        return next
      }
      return [...prev, entry]
    })
  }, [])

  const disconnectProvider = useCallback((id: ProviderId) => {
    setProviders((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { providers, connectProvider, disconnectProvider, hydrated }
}
