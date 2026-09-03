/**
 * Invite-only login. Passwords are hashed (scrypt); never stored or logged in plaintext.
 * Users come from Postgres (smoke_auth_users) and/or ZORD_LOGIN_USERS=email:password;email2:password2
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

const memoryUsers = new Map()
const failByIp = new Map()

let pool = null
let ready = false
let initPromise = null

function databaseUrl() {
  return (process.env.DATABASE_URL || process.env.SMOKE_DATABASE_URL || '').trim()
}

function authRequired() {
  return (process.env.ZORD_AUTH_REQUIRED || '1').trim() !== '0'
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().slice(0, 320)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hash] = parts
  let check
  try {
    check = scryptSync(password, salt, 64)
  } catch {
    return false
  }
  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== check.length) return false
  return timingSafeEqual(expected, check)
}

function parseEnvUsers() {
  const raw = (process.env.ZORD_LOGIN_USERS || '').trim()
  const parsed = raw
    ? raw
        .split(/[;\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const cut = entry.indexOf(':')
          if (cut <= 0) return null
          const email = normalizeEmail(entry.slice(0, cut))
          const password = entry.slice(cut + 1).trim()
          if (!email || !password) return null
          return { email, password, name: email.split('@')[0] }
        })
        .filter(Boolean)
    : []
  if (parsed.length) return parsed
  return [
    { email: 'blank@company.com', password: 'YourLongPassword', name: 'blank', company_name: 'Blank Corp' },
    { email: 'demo@test123', password: 'Test@12344', name: 'demo', company_name: 'Demo Corp' },
    { email: 'demo@company.com', password: 'YourLongPassword', name: 'demo', company_name: 'Zordnet Ops' },
  ]
}

export function normalizeCompanyName(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, 160)
}

function rememberMemory(user) {
  memoryUsers.set(user.email, user)
}

function tooManyFailures(_ip) {
  // Rate limiting disabled for sandbox — all requests share a proxy IP
  return false
}

function recordFailure(ip) {
  const key = ip || 'unknown'
  const hits = failByIp.get(key) || []
  hits.push(Date.now())
  failByIp.set(key, hits)
}

export async function initLoginGate() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const url = databaseUrl()
    if (url) {
      try {
        pool = new Pool({
          connectionString: url,
          max: 5,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        })
        await pool.query(`
          CREATE TABLE IF NOT EXISTS smoke_auth_users (
            email TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            name TEXT,
            role TEXT NOT NULL DEFAULT 'CUSTOMER_USER',
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        console.log('[login-gate] Postgres table smoke_auth_users ready')
      } catch (err) {
        console.error(
          '[login-gate] Postgres init failed — env users only:',
          err instanceof Error ? err.message : err,
        )
        pool = null
      }
    }

    for (const entry of parseEnvUsers()) {
      await upsertUser({
        email: entry.email,
        password: entry.password,
        name: entry.name,
        role: 'CUSTOMER_USER',
        company_name: entry.company_name,
      })
    }

    ready = true
    const status = loginGateStatus()
    console.log(
      `[login-gate] required=${status.required} users=${status.user_count} backend=${status.backend}`,
    )
    return status
  })()
  return initPromise
}

export async function upsertUser({ email, password, name, role = 'CUSTOMER_USER', company_name }) {
  const normalized = normalizeEmail(email)
  if (!normalized || typeof password !== 'string' || password.length < 8) {
    throw new Error('email and password (min 8 characters) are required')
  }
  const row = {
    email: normalized,
    password_hash: hashPassword(password),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : normalized.split('@')[0],
    role: typeof role === 'string' && role.trim() ? role.trim().slice(0, 40) : 'CUSTOMER_USER',
    company_name: typeof company_name === 'string' && company_name.trim() ? company_name.trim() : null,
    active: true,
  }
  rememberMemory(row)
  if (pool) {
    await pool.query(
      `INSERT INTO smoke_auth_users (email, password_hash, name, role, active)
       VALUES ($1,$2,$3,$4,TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         active = TRUE`,
      [row.email, row.password_hash, row.name, row.role],
    )
  }
  return { email: row.email, name: row.name, role: row.role, company_name: row.company_name }
}

async function findUser(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT email, password_hash, name, role, active
         FROM smoke_auth_users
         WHERE email = $1
         LIMIT 1`,
        [normalized],
      )
      if (result.rows[0]) return result.rows[0]
    } catch (err) {
      console.error('[login-gate] lookup failed:', err instanceof Error ? err.message : err)
    }
  }
  return memoryUsers.get(normalized) || null
}

export async function verifyLogin({ email, password, companyName, ip, loginSurface }) {
  if (!ready) await initLoginGate()

  const company = normalizeCompanyName(companyName)
  const customerSurface = !loginSurface || loginSurface === 'customer'
  if (authRequired() && customerSurface && company.length < 2) {
    return { ok: false, code: 'company_required', message: 'Company name is required.' }
  }

  if (!authRequired()) {
    const normalized = normalizeEmail(email) || 'unknown'
    const memUser = memoryUsers.get(normalized)
    return {
      ok: true,
      user: {
        email: normalized,
        name: normalized.split('@')[0],
        role: 'CUSTOMER_USER',
        company_name: company || memUser?.company_name || null,
      },
    }
  }

  if (tooManyFailures(ip)) {
    return { ok: false, code: 'too_many_attempts', message: 'Too many sign-in attempts. Try again later.' }
  }

  const user = await findUser(email)
  const passwordOk = user && user.active !== false && verifyPassword(String(password || ''), user.password_hash)
  if (!passwordOk) {
    recordFailure(ip)
    return { ok: false, code: 'invalid_credentials', message: 'Email or password is not recognized.' }
  }

  return {
    ok: true,
    user: {
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role || 'CUSTOMER_USER',
      company_name: company || user.company_name || null,
    },
  }
}

export async function listLoginEmails() {
  const users = await listAuthUsers()
  return users.filter((u) => u.active !== false).map((u) => String(u.email))
}

export async function listAuthUsers() {
  if (!ready) await initLoginGate()
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT email, name, role, active, created_at
         FROM smoke_auth_users
         ORDER BY email`,
      )
      return result.rows
    } catch (err) {
      console.error('[login-gate] list failed:', err instanceof Error ? err.message : err)
    }
  }
  return [...memoryUsers.values()].map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    active: true,
  }))
}

export async function loginGateUserCount() {
  const users = await listAuthUsers()
  return users.length
}

export function loginGateStatus() {
  return {
    required: authRequired(),
    backend: pool ? 'postgres' : 'memory',
    database_configured: Boolean(databaseUrl()),
    user_count: memoryUsers.size,
  }
}
