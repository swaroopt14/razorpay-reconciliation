import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import {
  createSupportTicket,
  type NewSupportTicketInput,
  type SupportTicket,
} from '@/services/payout-command/support/supportTickets'
import {
  loadTenantSupportTickets,
  migrateTenantSupportTicketsIfEmpty,
  saveTenantSupportTickets,
} from '@/services/support/supportTicketStore.server'
import { notifySupportSlack } from '@/services/support/supportSlack.server'

export const dynamic = 'force-dynamic'

type PostBody = NewSupportTicketInput & {
  migrate?: SupportTicket[]
  source?: 'manual_review'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const tickets = await loadTenantSupportTickets(gate.tenantId)
  const res = NextResponse.json({ tickets }, { status: 200, headers: { 'cache-control': 'no-store' } })
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}

export async function POST(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json(
      { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  if (Array.isArray(body.migrate) && body.migrate.length > 0) {
    const migrated = await migrateTenantSupportTicketsIfEmpty(gate.tenantId, body.migrate)
    const res = NextResponse.json(
      { ok: true, tickets: migrated, migrated: migrated.length > 0 },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  const category = asString(body.category)
  const topic = asString(body.topic)
  const description = asString(body.description)

  const missing: string[] = []
  if (!category) missing.push('category')
  if (!topic) missing.push('topic')
  if (!description) missing.push('description')

  if (missing.length) {
    return NextResponse.json(
      { code: 'MISSING_FIELDS', message: `Missing required fields: ${missing.join(', ')}.` },
      { status: 400 },
    )
  }

  const ticket = createSupportTicket({
    category,
    topic,
    description,
    priority: body.priority === 'urgent' ? 'urgent' : 'normal',
    contactEmail: asString(body.contactEmail) || undefined,
    notifyByEmail: body.notifyByEmail === true,
  })

  const existing = await loadTenantSupportTickets(gate.tenantId)
  await saveTenantSupportTickets(gate.tenantId, [ticket, ...existing])

  console.info('[zord] support ticket created', {
    tenantId: gate.tenantId,
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    source: body.source ?? 'console',
  })

  const slackDelivered = await notifySupportSlack(
    body.source === 'manual_review'
      ? { kind: 'manual_review', tenantId: gate.tenantId, ticket }
      : { kind: 'new_ticket', tenantId: gate.tenantId, ticket },
  )

  const res = NextResponse.json(
    { ok: true, ticket, slackDelivered },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  )
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
