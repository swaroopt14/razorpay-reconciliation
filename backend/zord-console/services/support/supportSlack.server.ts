import type { SupportTicket, SupportMessage } from '@/services/payout-command/support/supportTickets'
import {
  classificationLabel,
  minimizeEmailRef,
  minimizeTenantRef,
  redactSupportTextForSlack,
} from '@/services/support/redactSupportForSlack'

export type SupportSlackEvent =
  | { kind: 'new_ticket'; tenantId: string; ticket: SupportTicket }
  | { kind: 'chat_reply'; tenantId: string; ticket: SupportTicket; message: SupportMessage }
  | { kind: 'email_log'; tenantId: string; ticket: SupportTicket; message: SupportMessage }
  | { kind: 'manual_review'; tenantId: string; ticket: SupportTicket }

function fieldsLine(label: string, value: string | null | undefined) {
  return `*${label}:* ${value && value.trim().length ? value.trim() : '—'}`
}

function headerForEvent(event: SupportSlackEvent): string {
  switch (event.kind) {
    case 'new_ticket':
      return 'New Zord support ticket'
    case 'chat_reply':
      return 'Support ticket reply'
    case 'email_log':
      return 'Support email logged for follow-up'
    case 'manual_review':
      return 'Manual review escalated to support'
    default:
      return 'Zord support update'
  }
}

/**
 * CON-P1-11 — build Slack Blocks with redacted/minimal content only.
 * Full ticket bodies remain in the support store; Slack is a pointer + safe preview.
 */
export function buildSupportSlackPayload(event: SupportSlackEvent): {
  text: string
  blocks: unknown[]
  classes: string[]
} {
  const { ticket, tenantId } = event
  const firstMessage = ticket.messages[0]
  const allClasses: string[] = []

  const topicSafe = redactSupportTextForSlack(ticket.topic || '', 80)
  allClasses.push(...topicSafe.classes)

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: headerForEvent(event), emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('Ticket', `#${ticket.ticketNumber}`) },
        { type: 'mrkdwn', text: fieldsLine('Tenant', minimizeTenantRef(tenantId)) },
        { type: 'mrkdwn', text: fieldsLine('Category', ticket.category) },
        { type: 'mrkdwn', text: fieldsLine('Topic', topicSafe.text || '—') },
        { type: 'mrkdwn', text: fieldsLine('Status', ticket.status) },
        {
          type: 'mrkdwn',
          text: fieldsLine('Priority', event.kind === 'manual_review' ? 'urgent' : '—'),
        },
      ],
    },
  ]

  if (event.kind === 'email_log') {
    const msg = event.message
    const subject = redactSupportTextForSlack(msg.emailSubject || '', 120)
    const body = redactSupportTextForSlack(msg.body || '', 240)
    allClasses.push(...subject.classes, ...body.classes)
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: fieldsLine('To', minimizeEmailRef(msg.emailTo)) },
        { type: 'mrkdwn', text: fieldsLine('Cc', minimizeEmailRef(msg.emailCc)) },
        { type: 'mrkdwn', text: fieldsLine('Subject', subject.text || '—') },
      ],
    })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Redacted preview:*\n>${body.text.replace(/\n/g, '\n>') || '—'}`,
      },
    })
  } else if (event.kind === 'chat_reply') {
    const body = redactSupportTextForSlack(event.message.body || '', 240)
    allClasses.push(...body.classes)
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Redacted preview:*\n>${body.text.replace(/\n/g, '\n>') || '—'}`,
      },
    })
  } else if (firstMessage) {
    const body = redactSupportTextForSlack(firstMessage.body || '', 240)
    allClasses.push(...body.classes)
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Redacted preview:*\n>${body.text.replace(/\n/g, '\n>') || '—'}`,
      },
    })
  }

  if (ticket.contactEmail) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: fieldsLine('Contact', minimizeEmailRef(ticket.contactEmail)) }],
    })
  }

  const classLabel = classificationLabel(
    Array.from(new Set(allClasses.filter((c) => c !== 'none'))) as Array<
      'email' | 'vpa' | 'utr' | 'account' | 'ifsc' | 'phone' | 'none'
    >,
  )

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Ticket \`${ticket.id}\` · ${classLabel} · Full content retained in Zord support store only (not Slack).`,
      },
    ],
  })

  const fallback = `${headerForEvent(event)}: #${ticket.ticketNumber} (${topicSafe.text || 'support'})`

  return {
    text: fallback,
    blocks,
    classes: Array.from(new Set(allClasses.filter((c) => c !== 'none'))),
  }
}

/** Post support activity to Slack via Incoming Webhook. Resolves to false on any failure. */
export async function notifySupportSlack(event: SupportSlackEvent): Promise<boolean> {
  const webhook = process.env.SLACK_SUPPORT_WEBHOOK_URL?.trim()
  if (!webhook) return false

  // Optional allowlist: only post when webhook host looks like Slack (or approved override).
  const approvedHost = process.env.SLACK_SUPPORT_WEBHOOK_HOST?.trim() || 'hooks.slack.com'
  try {
    const host = new URL(webhook).hostname
    if (host !== approvedHost && !host.endsWith(`.${approvedHost}`)) {
      console.error('[zord-support-slack] webhook host not approved', { host, approvedHost })
      return false
    }
  } catch {
    return false
  }

  const payload = buildSupportSlackPayload(event)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: payload.text, blocks: payload.blocks }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
