import { NextRequest, NextResponse } from 'next/server'
import { registerTenant } from '@/services/backend/tenants'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Server-side proxy to zord-edge (avoids browser CORS issues).
    const result = await registerTenant(name)

    // Keep payload compatible with the existing Postman response shape.
    return NextResponse.json({
      APIKEY: result.api_key,
      Message: 'Merchent Registered',
      TenantId: result.tenant_id,
    })
  } catch (error) {
    // Never log api keys or request bodies.
    const msg = error instanceof Error ? error.message : 'Tenant registration failed'
    if (msg === 'TENANT_NAME_EXISTS') {
      return NextResponse.json(
        { error: 'TENANT_NAME_EXISTS', message: 'Tenant name is already registered. Choose a different name.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
