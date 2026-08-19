import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * CON-P0-05: The former catch-all intelligence proxy forwarded arbitrary
 * upstream paths and client Authorization headers. That tunnel is removed.
 *
 * Live console traffic must use session-bound `/api/prod/intelligence/*`
 * (see `app/api/prod/intelligence/_shared.ts`), which injects tenant from
 * the signed-in session and never trusts client identity headers.
 *
 * CON-P1-06: no upstream proxy here, so no publicBffError path — always 404.
 * MERGE RULE: on conflict, keep hard 404 forever — never restore the catch-all proxy.
 */
function gone() {
  return NextResponse.json(
    {
      code: 'NOT_FOUND',
      message:
        'Generic /api/intelligence proxy removed. Use session-bound /api/prod/intelligence/* routes.',
    },
    {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    },
  )
}

export async function GET() {
  return gone()
}

export async function POST() {
  return gone()
}

export async function PUT() {
  return gone()
}

export async function PATCH() {
  return gone()
}

export async function DELETE() {
  return gone()
}
