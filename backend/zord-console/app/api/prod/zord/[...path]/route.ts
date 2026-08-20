import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BODY = {
  error: 'Synthetic analytics are not available on live.',
  detail:
    'The /api/prod/zord/* namespace was a demo BFF. Live metrics come from Services 2, 5, 6 and 7 via /api/prod/intelligence, /api/prod/intents, /api/prod/settlement, and /api/prod/evidence.',
}

function gone() {
  return NextResponse.json(BODY, {
    status: 410,
    headers: { 'cache-control': 'no-store' },
  })
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
