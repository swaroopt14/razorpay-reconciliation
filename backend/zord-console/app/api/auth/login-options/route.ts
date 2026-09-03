import { NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

export const dynamic = 'force-dynamic'

export async function GET() {
  const bases = Array.from(
    new Set(
      [
        BACKEND_SERVICES.EDGE.BASE_URL,
        process.env.ZORD_EDGE_URL,
        process.env.SMOKE_SIMULATOR_URL,
        'http://localhost:8099',
      ]
        .map((b) => (typeof b === 'string' ? b.trim().replace(/\/+$/, '') : ''))
        .filter(Boolean),
    ),
  )

  for (const base of bases) {
    try {
      const upstream = await fetch(`${base}/v1/auth/login-options`, { cache: 'no-store' })
      if (!upstream.ok) continue
      const payload = (await upstream.json()) as { emails?: string[] }
      const emails = Array.isArray(payload.emails) ? payload.emails.filter(Boolean) : []
      if (emails.length) {
        return NextResponse.json({ ok: true, emails }, { headers: { 'cache-control': 'no-store' } })
      }
    } catch {
      /* try next base */
    }
  }

  return NextResponse.json(
    { ok: false, emails: [], message: 'Could not load allowed sign-in emails.' },
    { status: 502, headers: { 'cache-control': 'no-store' } },
  )
}
