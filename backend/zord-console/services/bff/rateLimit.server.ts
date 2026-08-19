/**
 * CON-P1-20 — application-level per-principal throttles for expensive/sensitive BFF routes.
 * Gateway/WAF remains the primary limit; these buckets are defense-in-depth and return Retry-After.
 *
 * Process-local sliding windows (suitable for single-instance / sticky console pods).
 * Keys are tenant- or IP-scoped so one principal cannot exhaust another.
 */
import { NextRequest, NextResponse } from 'next/server'

export type BffRateBucket =
  | 'auth'
  | 'prompt'
  | 'evidence_export'
  | 'evidence_verify'
  | 'reprocess'
  | 'support'

type BucketConfig = { limit: number; windowMs: number; envLimit?: string }

const BUCKET_DEFAULTS: Record<BffRateBucket, BucketConfig> = {
  // Public auth — keyed by client IP
  auth: { limit: 20, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_AUTH_PER_MIN' },
  // Ask Zord — keyed by tenant
  prompt: { limit: 30, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_PROMPT_PER_MIN' },
  evidence_export: { limit: 20, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_EVIDENCE_EXPORT_PER_MIN' },
  evidence_verify: { limit: 20, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_EVIDENCE_VERIFY_PER_MIN' },
  reprocess: { limit: 10, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_REPROCESS_PER_MIN' },
  support: { limit: 30, windowMs: 60_000, envLimit: 'BFF_RATE_LIMIT_SUPPORT_PER_MIN' },
}

type Counter = { count: number; resetAt: number }

/** bucket → principalKey → counter */
const stores = new Map<BffRateBucket, Map<string, Counter>>()

function parseLimit(envName: string | undefined, fallback: number): number {
  if (!envName) return fallback
  const raw = process.env[envName]
  if (!raw?.trim()) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sanitizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  const ip = value.trim()
  if (!ip || ip.length > 64) return null
  // Basic IPv4 / IPv6 (incl. compressed) — reject header injection / multi-value.
  if (ip.includes(',') || ip.includes(' ')) return null
  if (!/^[\d.:a-fA-F]+$/.test(ip)) return null
  return ip
}

function trustProxyHeadersEnabled(): boolean {
  const raw = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/**
 * Best-effort client IP for auth throttles.
 * Prefers proxy-set single-value headers; only uses XFF when TRUST_PROXY_HEADERS is enabled
 * (rightmost hop = nearest proxy).
 */
export function resolveRateLimitClientIp(request: NextRequest): string {
  for (const headerName of ['x-real-ip', 'true-client-ip', 'cf-connecting-ip'] as const) {
    const trusted = sanitizeIp(request.headers.get(headerName))
    if (trusted) return trusted
  }

  if (trustProxyHeadersEnabled()) {
    const xff = request.headers.get('x-forwarded-for')
    if (xff) {
      const hops = xff
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const nearest = hops.length > 0 ? sanitizeIp(hops[hops.length - 1]) : null
      if (nearest) return nearest
    }
  }

  return 'unknown'
}

export function rateLimitKeyForIp(request: NextRequest): string {
  return `ip:${resolveRateLimitClientIp(request)}`
}

export function rateLimitKeyForTenant(tenantId: string): string {
  const tid = tenantId.trim() || 'anonymous'
  return `tenant:${tid}`
}

export type ConsumeRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; response: NextResponse }

/**
 * Consume one unit from the named bucket for `key` (tenant:… or ip:…).
 * On exceed: 429 with Retry-After and a stable JSON body.
 */
export function consumeBffRateLimit(opts: {
  bucket: BffRateBucket
  key: string
  /** Optional override; defaults come from env / BUCKET_DEFAULTS. */
  limit?: number
  windowMs?: number
  message?: string
}): ConsumeRateLimitResult {
  const defaults = BUCKET_DEFAULTS[opts.bucket]
  const limit = opts.limit ?? parseLimit(defaults.envLimit, defaults.limit)
  const windowMs = opts.windowMs ?? defaults.windowMs
  const principal = opts.key.trim() || 'anonymous'
  const storeKey = `${opts.bucket}:${principal}`

  let store = stores.get(opts.bucket)
  if (!store) {
    store = new Map()
    stores.set(opts.bucket, store)
  }

  const now = Date.now()
  let counter = store.get(storeKey)
  if (!counter || now >= counter.resetAt) {
    counter = { count: 0, resetAt: now + windowMs }
    store.set(storeKey, counter)
  }

  counter.count += 1
  if (counter.count <= limit) {
    return { ok: true }
  }

  const retryAfterSec = Math.max(1, Math.ceil((counter.resetAt - now) / 1000))
  const response = NextResponse.json(
    {
      code: 'RATE_LIMITED',
      message: opts.message ?? 'Too many requests. Try again shortly.',
      retry_after_seconds: retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(retryAfterSec),
      },
    },
  )
  return { ok: false, retryAfterSec, response }
}

/** Test helper — clears all in-memory buckets. */
export function resetBffRateLimitStoresForTests() {
  stores.clear()
}
