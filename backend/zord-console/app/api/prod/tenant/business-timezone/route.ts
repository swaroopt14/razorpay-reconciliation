import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import {
  businessDateYmd,
  DEFAULT_TENANT_BUSINESS_TIMEZONE,
  resolveTenantBusinessTimezone,
} from '@/services/payout-command/tenantBusinessTimezone'

export const dynamic = 'force-dynamic'

/**
 * CON-P1-29 — expose tenant business timezone + today's business_date for console filters.
 * Source: ZORD_TENANT_BUSINESS_TIMEZONE env (deploy/tenant config), else product default.
 * Intent-engine uses the same IANA zone via tenant_business_date_config.
 */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const configured = process.env.ZORD_TENANT_BUSINESS_TIMEZONE?.trim() || null
  const businessDateTimezone = resolveTenantBusinessTimezone(
    configured || DEFAULT_TENANT_BUSINESS_TIMEZONE,
  )
  const now = new Date()
  const businessDate = businessDateYmd(now, businessDateTimezone)

  const res = NextResponse.json(
    {
      tenant_id: gate.tenantId,
      business_date_timezone: businessDateTimezone,
      business_date: businessDate,
      source: configured ? 'env' : 'default',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
