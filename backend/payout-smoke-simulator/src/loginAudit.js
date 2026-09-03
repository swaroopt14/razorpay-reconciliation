/**
 * Smoke login audit — Postgres-backed when DATABASE_URL is set.
 * Never stores passwords. Falls back to an in-memory ring buffer if DB is unavailable.
 */

import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

const MEMORY_CAP = 500
const memoryRows = []

let pool = null
let ready = false
let initPromise = null

function databaseUrl() {
  return (process.env.DATABASE_URL || process.env.SMOKE_DATABASE_URL || '').trim()
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().slice(0, 320)
}

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')?.trim() || null
}

export async function initLoginAudit() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const url = databaseUrl()
    if (!url) {
      console.warn(
        '[login-audit] DATABASE_URL not set — using in-memory audit only (lost on restart).',
      )
      ready = true
      return { mode: 'memory' }
    }
    try {
      pool = new Pool({
        connectionString: url,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      })
      await pool.query(`
        CREATE TABLE IF NOT EXISTS smoke_login_audit (
          id UUID PRIMARY KEY,
          email TEXT NOT NULL,
          company_name TEXT,
          workspace_id TEXT,
          login_surface TEXT,
          mode TEXT,
          success BOOLEAN NOT NULL DEFAULT TRUE,
          ip TEXT,
          user_agent TEXT,
          latency_ms INTEGER,
          logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await pool.query(`ALTER TABLE smoke_login_audit ADD COLUMN IF NOT EXISTS company_name TEXT`)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS smoke_login_audit_logged_in_at_idx
          ON smoke_login_audit (logged_in_at DESC)
      `)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS smoke_login_audit_email_idx
          ON smoke_login_audit (email)
      `)
      ready = true
      console.log('[login-audit] Postgres connected — smoke_login_audit ready')
      return { mode: 'postgres' }
    } catch (err) {
      console.error(
        '[login-audit] Postgres init failed — falling back to memory:',
        err instanceof Error ? err.message : err,
      )
      pool = null
      ready = true
      return { mode: 'memory', error: err instanceof Error ? err.message : String(err) }
    }
  })()
  return initPromise
}

/**
 * Record a login attempt. Never pass or store password.
 */
export async function recordLoginAudit({
  request,
  email,
  companyName,
  workspaceId,
  loginSurface,
  mode,
  success = true,
  latencyMs,
}) {
  if (!ready) {
    try {
      await initLoginAudit()
    } catch {
      /* ignore */
    }
  }

  const row = {
    id: randomUUID(),
    email: normalizeEmail(email) || 'unknown',
    company_name:
      typeof companyName === 'string' && companyName.trim() ? companyName.trim().slice(0, 160) : null,
    workspace_id: typeof workspaceId === 'string' ? workspaceId.trim().slice(0, 120) || null : null,
    login_surface:
      typeof loginSurface === 'string' ? loginSurface.trim().slice(0, 64) || null : null,
    mode: typeof mode === 'string' ? mode.trim().slice(0, 32) || null : null,
    success: Boolean(success),
    ip: request ? clientIp(request) : null,
    user_agent: request?.headers.get('user-agent')?.slice(0, 512) || null,
    latency_ms:
      typeof latencyMs === 'number' && Number.isFinite(latencyMs)
        ? Math.max(0, Math.round(latencyMs))
        : null,
    logged_in_at: new Date().toISOString(),
  }

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO smoke_login_audit
          (id, email, company_name, workspace_id, login_surface, mode, success, ip, user_agent, latency_ms, logged_in_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          row.id,
          row.email,
          row.company_name,
          row.workspace_id,
          row.login_surface,
          row.mode,
          row.success,
          row.ip,
          row.user_agent,
          row.latency_ms,
          row.logged_in_at,
        ],
      )
      return { stored: 'postgres', id: row.id }
    } catch (err) {
      console.error(
        '[login-audit] insert failed — memory fallback:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  memoryRows.unshift(row)
  if (memoryRows.length > MEMORY_CAP) memoryRows.length = MEMORY_CAP
  return { stored: 'memory', id: row.id }
}

export async function listLoginAudit({ limit = 50 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 50))

  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, email, company_name, workspace_id, login_surface, mode, success, ip, user_agent,
                latency_ms, logged_in_at
         FROM smoke_login_audit
         ORDER BY logged_in_at DESC
         LIMIT $1`,
        [safeLimit],
      )
      return {
        source: 'postgres',
        count: result.rows.length,
        items: result.rows,
      }
    } catch (err) {
      console.error(
        '[login-audit] list failed — memory fallback:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return {
    source: 'memory',
    count: Math.min(safeLimit, memoryRows.length),
    items: memoryRows.slice(0, safeLimit),
  }
}

export function loginAuditStatus() {
  return {
    ready,
    backend: pool ? 'postgres' : 'memory',
    database_configured: Boolean(databaseUrl()),
  }
}
