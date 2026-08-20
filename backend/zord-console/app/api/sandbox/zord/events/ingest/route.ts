import { NextRequest } from 'next/server'
import { unavailableSyntheticProd } from '../../helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return unavailableSyntheticProd(request)
}
