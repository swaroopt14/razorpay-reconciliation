import { NextRequest, NextResponse } from 'next/server'
import { fetchPayoutContractById, fetchPayoutContracts } from '@/services/backend/payout-contracts'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contract_id: string }> }
) {
  const { contract_id } = await params

  try {
    // Preferred: direct GET by id (if backend supports it)
    // If direct lookup fails (network / unsupported endpoint), continue with list fallback.
    try {
      const direct = await fetchPayoutContractById(contract_id)
      if (direct) return NextResponse.json(direct)
    } catch {
      // Continue to list fallback below.
    }

    // Fallback: list + filter (works even if backend only exposes /v1/contracts)
    const list = await fetchPayoutContracts()
    const found = list.items.find((c) => c.contract_id === contract_id)
    if (!found) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json(found)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch payout contract' },
      { status: 502 }
    )
  }
}
