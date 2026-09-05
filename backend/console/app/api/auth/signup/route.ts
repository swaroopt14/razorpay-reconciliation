import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    {
      code: 'SIGNUP_DISABLED',
      message: 'Self-serve signup is off. Ask an admin to add your email.',
    },
    { status: 403 },
  )
}
