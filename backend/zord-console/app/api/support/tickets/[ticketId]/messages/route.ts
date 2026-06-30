import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import {
  appendCustomerReply,
  appendEmailMessage,
  type EmailMessageInput,
} from '@/services/payout-command/support/supportTickets'
import {
  loadTenantSupportTickets,
  saveTenantSupportTickets,
} from '@/services/support/supportTicketStore.server'
import { notifySupportSlack } from '@/services/support/supportSlack.server'

export const dynamic = 'force-dynamic'

type PostBody =
  | { kind: 'chat'; body: string }
  | ({ kind: 'email' } & EmailMessageInput)

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const { ticketId } = await context.params
  if (!ticketId?.trim()) {
    return NextResponse.json({ code: 'MISSING_TICKET', message: 'Ticket id is required.' }, { status: 400 })
  }

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
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

  const current = tickets[index]
  if (current.status === 'closed') {
    return NextResponse.json({ code: 'TICKET_CLOSED', message: 'Cannot post to a closed ticket.' }, { status: 409 })
  }

  let updated = current
  let slackEvent: Parameters<typeof notifySupportSlack>[0] | null = null

  if (body.kind === 'email') {
    const to = asString(body.to)
    const subject = asString(body.subject)
    const emailBody = asString(body.body)
    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { code: 'MISSING_FIELDS', message: 'Email requires to, subject, and body.' },
        { status: 400 },
      )
    }
    updated = appendEmailMessage(current, {
      to,
      cc: asString(body.cc) || undefined,
      subject,
      body: emailBody,
    })
    const message = updated.messages[updated.messages.length - 1]
    slackEvent = { kind: 'email', tenantId: gate.tenantId, ticket: updated, message }
  } else {
    const chatBody = asString(body.body)
    if (!chatBody) {
      return NextResponse.json(
        { code: 'MISSING_FIELDS', message: 'Reply body is required.' },
        { status: 400 },
      )
    }
    updated = appendCustomerReply(current, chatBody)
    const message = updated.messages[updated.messages.length - 1]
    slackEvent = { kind: 'chat_reply', tenantId: gate.tenantId, ticket: updated, message }
  }

  const next = [...tickets]
  next[index] = updated
  await saveTenantSupportTickets(gate.tenantId, next)

  console.info('[zord] support ticket message', {
    tenantId: gate.tenantId,
    ticketId: updated.id,
    kind: body.kind,
  })

  const slackDelivered = slackEvent ? await notifySupportSlack(slackEvent) : false

  const res = NextResponse.json(
    { ok: true, ticket: updated, slackDelivered },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
