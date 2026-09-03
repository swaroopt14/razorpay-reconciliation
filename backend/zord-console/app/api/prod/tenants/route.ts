import { NextRequest, NextResponse } from 'next/server'
import { fetchTenants } from '@/services/backend/tenants'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Fetch from real backend (zord-edge)
    const response = await fetchTenants()

    return NextResponse.json({
      items: response.items,
      pagination: response.pagination,
    })
  } catch (error) {
    console.error('Error fetching tenants from backend:', error)

    // Return empty response on error (no mock data)
    return NextResponse.json({
      items: [],
      pagination: {
        page: 1,
        page_size: 50,
        total: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch tenants',
    })
  }
}
