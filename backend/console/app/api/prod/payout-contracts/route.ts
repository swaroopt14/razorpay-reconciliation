import { NextResponse } from 'next/server'
import { fetchPayoutContracts } from '@/services/backend/payout-contracts'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const response = await fetchPayoutContracts()
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        error: error instanceof Error ? error.message : 'Failed to fetch payout contracts',
      },
      { status: 502 }
    )
  }
}

