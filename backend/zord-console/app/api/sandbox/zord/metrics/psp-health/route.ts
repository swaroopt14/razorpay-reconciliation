import { NextRequest } from 'next/server'
import { unavailableSyntheticProd } from '../../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return unavailableSyntheticProd(request)
}
