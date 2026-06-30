import type { SupportTicket, SupportMessage } from '@/services/payout-command/support/supportTickets'

export type SupportSlackEvent =
  | { kind: 'new_ticket'; tenantId: string; ticket: SupportTicket }
  | { kind: 'chat_reply'; tenantId: string; ticket: SupportTicket; message: SupportMessage }
  | { kind: 'email'; tenantId: string; ticket: SupportTicket; message: SupportMessage }
  | { kind: 'manual_review'; tenantId: string; ticket: SupportTicket }

function fieldsLine(label: string, value: string | null | undefined) {
  return `*${label}:* ${value && value.trim().length ? value.trim() : '—'}`
}

function previewText(body: string, max = 400) {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function headerForEvent(event: SupportSlackEvent): string {
  switch (event.kind) {
    case 'new_ticket':
      return '🎫 New Zord support ticket'
    case 'chat_reply':
      return '💬 Support ticket reply'
    case 'email':
      return '📧 Support ticket email'
    case 'manual_review':
      return '🚨 Manual review escalated to support'
    default:
      return '🎫 Zord support update'
  }
}

/** Post support activity to Slack via Incoming Webhook. Resolves to false on any failure. */
export async function notifySupportSlack(event: SupportSlackEvent): Promise<boolean> {
  const webhook = process.env.SLACK_SUPPORT_WEBHOOK_URL?.trim()
  if (!webhook) return false

  const { ticket, tenantId } = event
  const firstMessage = ticket.messages[0]
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: headerForEvent(event), emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('Ticket', `#${ticket.ticketNumber}`) },
        { type: 'mrkdwn', text: fieldsLine('Tenant', tenantId) },
        { type: 'mrkdwn', text: fieldsLine('Category', ticket.category) },
        { type: 'mrkdwn', text: fieldsLine('Topic', ticket.topic) },
        { type: 'mrkdwn', text: fieldsLine('Status', ticket.status) },
        { type: 'mrkdwn', text: fieldsLine('Priority', event.kind === 'manual_review' ? 'urgent' : '—') },
      ],
    },
  ]

  if (event.kind === 'email') {
    const msg = event.message
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('To', msg.emailTo) },
        { type: 'mrkdwn', text: fieldsLine('Cc', msg.emailCc) },
        { type: 'mrkdwn', text: fieldsLine('Subject', msg.emailSubject) },
      ],
    })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Body:*\n>${previewText(msg.body).replace(/\n/g, '\n>')}` },
    })
  } else if (event.kind === 'chat_reply') {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Reply:*\n>${previewText(event.message.body).replace(/\n/g, '\n>')}` },
    })
  } else if (firstMessage) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Description:*\n>${previewText(firstMessage.body).replace(/\n/g, '\n>')}` },
    })
  }

  if (ticket.contactEmail) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: fieldsLine('Contact', ticket.contactEmail) }],
    })
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Ticket \`${ticket.id}\` · ${ticket.updatedAt}` }],
  })

  const fallback = `${headerForEvent(event)}: #${ticket.ticketNumber} (${ticket.topic})`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallback, blocks }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
