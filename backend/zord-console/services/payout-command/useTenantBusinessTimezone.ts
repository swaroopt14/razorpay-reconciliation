'use client'

import { useEffect, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  DEFAULT_TENANT_BUSINESS_TIMEZONE,
  resolveTenantBusinessTimezone,
} from './tenantBusinessTimezone'

type BusinessTimezonePayload = {
  business_date_timezone?: string
  business_date?: string
}

/**
 * Tenant business IANA timezone for financial filters/windows (CON-P1-29).
 * Display may localize labels; grouping must use this zone — never browser local.
 */
export function useTenantBusinessTimezone(): {
  timeZone: string
  businessDate: string | null
  ready: boolean
} {
  const { tenantId, tenantReady } = useSessionTenant()
  const [timeZone, setTimeZone] = useState(DEFAULT_TENANT_BUSINESS_TIMEZONE)
  const [businessDate, setBusinessDate] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!tenantReady || !tenantId.trim()) {
      setTimeZone(DEFAULT_TENANT_BUSINESS_TIMEZONE)
      setBusinessDate(null)
      setReady(tenantReady)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/prod/tenant/business-timezone', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as BusinessTimezonePayload
        if (cancelled) return
        setTimeZone(resolveTenantBusinessTimezone(body.business_date_timezone))
        setBusinessDate(typeof body.business_date === 'string' ? body.business_date : null)
      } catch {
        if (!cancelled) {
          setTimeZone(DEFAULT_TENANT_BUSINESS_TIMEZONE)
          setBusinessDate(null)
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tenantId, tenantReady])

  return { timeZone, businessDate, ready }
}
