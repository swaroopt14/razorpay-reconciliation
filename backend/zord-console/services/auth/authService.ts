'use client'

import { User, UserRole } from '@/types/auth'
import { STORAGE_KEYS } from '@/constants'

const AUTH_KEY = STORAGE_KEYS.AUTH
const ROLE_KEY = STORAGE_KEYS.CURRENT_ROLE
const AUTH_CHANGED_EVENT = 'zord-auth-changed'
export const SESSION_EXPIRED_EVENT = 'zord-session-expired'
const SESSION_HINT_COOKIE = 'zord_session_present'
const ROLE_COOKIE = 'zord_role'

interface AuthApiUser {
  id: string
  email: string
  role: UserRole
  name: string
  tenant_id: string
  tenant_name: string
  workspace_code: string
  mfa_enabled: boolean
}

interface AuthApiSession {
  session_id: string
  tenant_id: string
  workspace_code: string
  role: UserRole
  access_expires_at: string
  idle_expires_at?: string
  absolute_expires_at?: string
}

interface AuthApiEnvelope {
  user: AuthApiUser
  session: AuthApiSession
  requires_mfa?: boolean
}

interface LoginRequest {
  workspaceId: string
  email: string
  password: string
  loginSurface: 'console' | 'customer' | 'ops' | 'admin'
}

function emitAuthChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export function emitSessionExpired() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

export function notifySessionExpired() {
  emitSessionExpired()
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const entry = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))

  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null
}

function clearClientCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
}

function toClientUser(payload: AuthApiEnvelope): User {
  return {
    id: payload.user.id,
    email: payload.user.email,
    role: payload.user.role,
    tenant: payload.user.tenant_id,
    tenantId: payload.user.tenant_id,
    tenantName: payload.user.tenant_name,
    workspaceCode: payload.user.workspace_code,
    name: payload.user.name,
    mfaEnabled: payload.user.mfa_enabled,
    sessionExpiresAt: payload.session.access_expires_at,
    idleExpiresAt: payload.session.idle_expires_at,
    absoluteExpiresAt: payload.session.absolute_expires_at,
  }
}

function storeUser(user: User) {
  if (typeof window === 'undefined') return

  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  localStorage.setItem(ROLE_KEY, user.role)

  if (user.tenantName) {
    localStorage.setItem('zord_tenant_name', user.tenantName)
    localStorage.setItem('cx_tenant_name', user.tenantName)
  }

  emitAuthChanged()
}

function clearUserStorage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem('zord_tenant_id')
  localStorage.removeItem('zord_tenant_name')
  localStorage.removeItem('cx_tenant_name')
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null

  const auth = localStorage.getItem(AUTH_KEY)
  if (!auth) return null

  try {
    return JSON.parse(auth)
  } catch {
    return null
  }
}

export function setCurrentUser(user: User): void {
  storeUser(user)
}

export function clearAuth(): void {
  clearUserStorage()
  clearClientCookie(SESSION_HINT_COOKIE)
  clearClientCookie(ROLE_COOKIE)
  emitAuthChanged()
}

export async function login(request: LoginRequest): Promise<AuthApiEnvelope> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'include',
    body: JSON.stringify({
      workspace_id: request.workspaceId,
      email: request.email,
      password: request.password,
      login_surface: request.loginSurface,
    }),
  })

  const payload = await parseResponse<{ code?: string; message?: string } & Partial<AuthApiEnvelope>>(response)
  if (!response.ok) {
    const error = new Error(payload?.message || 'Unable to sign in right now.')
    ;(error as Error & { code?: string }).code = payload?.code
    throw error
  }

  if (!payload?.user || !payload?.session) {
    throw new Error('Unable to sign in right now.')
  }

  storeUser(toClientUser(payload as AuthApiEnvelope))
  return payload as AuthApiEnvelope
}

export async function hydrateSession(): Promise<User | null> {
  let response: Response
  try {
    response = await fetch('/api/auth/me', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    })
  } catch {
    // Network down, CORS misconfig, or browser blocked request — do not clear auth;
    // caller should not treat this the same as an invalid session.
    return null
  }

  if (!response.ok) {
    // Only tear down client auth on explicit session rejection — not edge outages.
    if (response.status === 401 || response.status === 403) {
      clearAuth()
    }
    return null
  }

  const payload = await parseResponse<AuthApiEnvelope>(response)
  if (!payload?.user || !payload?.session) {
    clearAuth()
    return null
  }

  const user = toClientUser(payload)
  storeUser(user)
  return user
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({}),
    })
  } finally {
    clearAuth()
  }
}

export function getCurrentRole(): UserRole | null {
  if (typeof window === 'undefined') return null

  const roleFromStorage = localStorage.getItem(ROLE_KEY)
  if (roleFromStorage) {
    return roleFromStorage as UserRole
  }

  const roleFromCookie = readCookie(ROLE_COOKIE)
  return (roleFromCookie as UserRole | null) ?? getCurrentUser()?.role ?? null
}

export function setCurrentRole(role: UserRole): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ROLE_KEY, role)
  const user = getCurrentUser()
  if (user) {
    storeUser({ ...user, role })
  }
}

export function switchRole(role: UserRole): void {
  if (process.env.NODE_ENV !== 'development') return
  setCurrentRole(role)
}

export function isAuthenticated(): boolean {
  return hasSessionHint() || getCurrentUser() !== null
}

export function hasSessionHint(): boolean {
  return readCookie(SESSION_HINT_COOKIE) === '1'
}

export function subscribeToAuthChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const listener = () => callback()
  window.addEventListener(AUTH_CHANGED_EVENT, listener)
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener)
}
