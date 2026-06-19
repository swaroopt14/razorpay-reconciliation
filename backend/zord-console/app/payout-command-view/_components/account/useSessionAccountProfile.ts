'use client'

import { useEffect, useState } from 'react'
import { getCurrentUser, hydrateSession } from '@/services/auth'
import type { User } from '@/types/auth'

export type SessionAccountProfile = {
  name: string
  email: string
  role: string
  tenantId: string
  tenantName: string
  workspaceCode: string
  mfaEnabled: boolean | null
  sessionExpiresAt: string
}

function toSessionAccountProfile(user: User | null, fallbackTenantId = ''): SessionAccountProfile | null {
  if (!user) return null

  return {
    name: user.name?.trim() || '',
    email: user.email?.trim() || '',
    role: user.role?.trim() || '',
    tenantId: user.tenantId?.trim() || user.tenant?.trim() || fallbackTenantId,
    tenantName: user.tenantName?.trim() || '',
    workspaceCode: user.workspaceCode?.trim() || '',
    mfaEnabled: typeof user.mfaEnabled === 'boolean' ? user.mfaEnabled : null,
    sessionExpiresAt: user.sessionExpiresAt?.trim() || '',
  }
}

export function useSessionAccountProfile(fallbackTenantId = '') {
  const [profile, setProfile] = useState<SessionAccountProfile | null>(() =>
    toSessionAccountProfile(getCurrentUser(), fallbackTenantId),
  )
  const [loading, setLoading] = useState(() => getCurrentUser() === null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const user = await hydrateSession()
      if (cancelled) return

      if (user) {
        setProfile(toSessionAccountProfile(user, fallbackTenantId))
      } else {
        setProfile((current) => current ?? toSessionAccountProfile(getCurrentUser(), fallbackTenantId))
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [fallbackTenantId])

  return { profile, loading }
}
