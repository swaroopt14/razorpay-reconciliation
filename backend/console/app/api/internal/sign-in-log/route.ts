import { NextRequest, NextResponse } from 'next/server'
import {
  applySignInLogCookie,
  fetchSmokeLoginAudit,
  isSignInLogUnlocked,
  passwordMatches,
} from '@/services/internal/signInLogGate.server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { password?: string; lock?: boolean } = {}
  try {
    body = (await request.json()) as { password?: string; lock?: boolean }
  } catch {
    body = {}
  }

  if (body.lock === true) {
    const res = NextResponse.json({ ok: true, unlocked: false })
    return applySignInLogCookie(res, false)
  }

  if (!passwordMatches(String(body.password || ''))) {
    return NextResponse.json({ ok: false, error: 'wrong_password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, unlocked: true })
  return applySignInLogCookie(res, true)
}

export async function GET(request: NextRequest) {
  if (!isSignInLogUnlocked(request)) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 401 })
  }

  try {
    const payload = await fetchSmokeLoginAudit(request.nextUrl.searchParams.get('limit') || '100')
    return NextResponse.json(payload, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        live: false,
        error: 'smoke_unreachable',
        message: err instanceof Error ? err.message : 'Could not reach smoke login-audit.',
        items: [],
      },
      { status: 502 },
    )
  }
}
