import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import { markTicketRead } from '@/services/payout-command/support/supportTickets'
import {
  loadTenantSupportTickets,
  saveTenantSupportTickets,
} from '@/services/support/supportTicketStore.server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const { ticketId } = await context.params
  if (!ticketId?.trim()) {
    return NextResponse.json({ code: 'MISSING_TICKET', message: 'Ticket id is required.' }, { status: 400 })
  }

  let body: { markRead?: boolean }
  try {
    body = (await request.json()) as { markRead?: boolean }
  } catch {
    return NextResponse.json(
      { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const tickets = await loadTenantSupportTickets(gate.tenantId)
  const index = tickets.findIndex((t) => t.id === ticketId)
  if (index < 0) {
    return NextResponse.json({ code: 'NOT_FOUND', message: 'Ticket not found.' }, { status: 404 })
  }

  let updated = tickets[index]
  if (body.markRead === true) {
    updated = markTicketRead(updated)
  }

  const next = [...tickets]
  next[index] = updated
  await saveTenantSupportTickets(gate.tenantId, next)

  const res = NextResponse.json(
    { ok: true, ticket: updated },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
