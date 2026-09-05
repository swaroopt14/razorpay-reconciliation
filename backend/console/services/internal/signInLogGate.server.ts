import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

export const SIGNIN_LOG_COOKIE = 'zord_signin_log'
export const SIGNIN_LOG_PAGE_PASSWORD = 'zord-signin-log'

function expectedPassword() {
  return (process.env.SIGNIN_LOG_PASSWORD || SIGNIN_LOG_PAGE_PASSWORD).trim()
}

export function signInLogUnlockToken() {
  return createHash('sha256').update(`zord-signin-log:${expectedPassword()}`).digest('hex')
}

export function isSignInLogUnlocked(request: NextRequest) {
  return request.cookies.get(SIGNIN_LOG_COOKIE)?.value === signInLogUnlockToken()
}

export function passwordMatches(password: string) {
  return password.trim() === expectedPassword()
}

export function applySignInLogCookie(res: NextResponse, unlocked: boolean) {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true'
  if (!unlocked) {
    res.cookies.set(SIGNIN_LOG_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0,
    })
    return res
  }
  res.cookies.set(SIGNIN_LOG_COOKIE, signInLogUnlockToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}

export function smokeLoginAuditBase() {
  return (
    process.env.ZORD_EDGE_URL ||
    process.env.SMOKE_SIMULATOR_URL ||
    'http://localhost:8099'
  ).replace(/\/+$/, '')
}

export function smokeApiKey() {
  return (
    process.env.ZORD_BULK_INGEST_API_KEY ||
    process.env.ZORD_SETTLEMENT_API_KEY ||
    process.env.SMOKE_API_KEY ||
    'zord-local-dev-api-key'
  ).trim()
}

export type SmokeLoginAuditRow = {
  id: string
  email: string
  company_name: string | null
  workspace_id: string | null
  login_surface: string | null
  mode: string | null
  success: boolean
  ip: string | null
  user_agent: string | null
  latency_ms: number | null
  logged_in_at: string
}

function asIso(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return ''
}

function normalizeRow(row: Record<string, unknown>): SmokeLoginAuditRow {
  const latency = row.latency_ms
  return {
    id: String(row.id || ''),
    email: String(row.email || 'unknown'),
    company_name: row.company_name ? String(row.company_name) : null,
    workspace_id: row.workspace_id ? String(row.workspace_id) : null,
    login_surface: row.login_surface ? String(row.login_surface) : null,
    mode: row.mode ? String(row.mode) : null,
    success: row.success !== false,
    ip: row.ip ? String(row.ip) : null,
    user_agent: row.user_agent ? String(row.user_agent) : null,
    latency_ms: typeof latency === 'number' && Number.isFinite(latency) ? latency : null,
    logged_in_at: asIso(row.logged_in_at),
  }
}

export async function fetchSmokeLoginAudit(limit: string | number = 100) {
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100))
  const url = `${smokeLoginAuditBase()}/v1/smoke/login-audit?limit=${safeLimit}`
  const upstream = await fetch(url, {
    headers: { authorization: `Bearer ${smokeApiKey()}` },
    cache: 'no-store',
  })
  const text = await upstream.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    throw new Error('Login audit API returned invalid JSON.')
  }
  if (!upstream.ok) {
    throw new Error(String(payload.message || payload.error || `login_audit_${upstream.status}`))
  }
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const status = (payload.status || {}) as { backend?: string; database_configured?: boolean }
  return {
    ok: true,
    live: true,
    source: String(payload.source || status.backend || 'unknown'),
    count: rawItems.length,
    items: rawItems.map((row) => normalizeRow((row || {}) as Record<string, unknown>)),
    status,
    fetched_at: new Date().toISOString(),
  }
}
