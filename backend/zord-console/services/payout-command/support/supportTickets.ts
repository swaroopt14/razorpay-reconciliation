export type SupportTicketStatus = 'open' | 'closed'
export type SupportTicketState = 'active' | 'awaiting_customer' | 'awaiting_zord'

export type SupportMessage = {
  id: string
  author: string
  role: 'customer' | 'zord'
  body: string
  createdAt: string
  kind?: 'chat' | 'email'
  emailDirection?: 'outbound' | 'inbound'
  emailTo?: string
  emailCc?: string
  emailSubject?: string
}

export type SupportTicket = {
  id: string
  ticketNumber: string
  category: string
  topic: string
  status: SupportTicketStatus
  state: SupportTicketState
  preview: string
  createdAt: string
  updatedAt: string
  expectedReplyBefore?: string
  unreadForCustomer: number
  /** Customer email for thread updates (optional). */
  contactEmail?: string
  notifyByEmail?: boolean
  messages: SupportMessage[]
}

export type NewSupportTicketInput = {
  category: string
  topic: string
  description: string
  priority?: 'normal' | 'urgent'
  contactEmail?: string
  notifyByEmail?: boolean
}

export type EmailMessageInput = {
  to: string
  cc?: string
  subject: string
  body: string
}

const STORAGE_PREFIX = 'zord:support-tickets'

function storageKey(tenantId: string) {
  return `${STORAGE_PREFIX}:${tenantId.trim() || 'default'}`
}

function ticketNum() {
  return String(Math.floor(7_600_000_000 + Math.random() * 999_999_999))
}

function nowIso() {
  return new Date().toISOString()
}

function daysFromNow(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function seedSupportTickets(): SupportTicket[] {
  const t1 = nowIso()
  return [
    {
      id: 't-seed-1',
      ticketNumber: '76930991820',
      category: 'Account configuration',
      topic: 'Transaction limit',
      status: 'open',
      state: 'active',
      preview: 'We need to raise the daily NEFT disbursement cap before month-end payroll.',
      createdAt: t1,
      updatedAt: t1,
      expectedReplyBefore: daysFromNow(2),
      unreadForCustomer: 0,
      messages: [
        {
          id: 'm1',
          author: 'You',
          role: 'customer',
          body: 'Please increase our daily outbound limit for production tenant. Current cap blocks our salary batch.',
          createdAt: t1,
        },
        {
          id: 'm2',
          author: 'Zord support',
          role: 'zord',
          body: 'Thanks — we received your request. Our onboarding team is reviewing your last 30-day volume and will confirm the revised limit within one business day.',
          createdAt: t1,
        },
      ],
    },
    {
      id: 't-seed-2',
      ticketNumber: '76930991821',
      category: 'Settlement related',
      topic: 'Delayed/Failed settlements',
      status: 'open',
      state: 'awaiting_customer',
      preview: 'Batch SET-2026-03-12 shows 14 observations still pending bank reference match.',
      createdAt: t1,
      updatedAt: t1,
      expectedReplyBefore: daysFromNow(1),
      unreadForCustomer: 2,
      messages: [
        {
          id: 'm3',
          author: 'Shubham',
          role: 'customer',
          body: 'We uploaded settlement file for batch SET-2026-03-12. Several rows are stuck in pending — can you check connector sync?',
          createdAt: t1,
        },
        {
          id: 'm4',
          author: 'Zord support',
          role: 'zord',
          body: 'We see 14 observations without bank_reference on that batch. Please share the bank statement extract for the same value date so we can align UTRs.',
          createdAt: t1,
        },
        {
          id: 'm5',
          author: 'Vivek Anand',
          role: 'customer',
          body: 'Attaching statement snippet in the next reply — UTR column is in column H.',
          createdAt: t1,
        },
      ],
    },
    {
      id: 't-seed-3',
      ticketNumber: '76930991822',
      category: 'API & integrations',
      topic: 'Webhook retries',
      status: 'closed',
      state: 'active',
      preview: 'Resolved: webhook signing secret rotated and delivery backlog cleared.',
      createdAt: t1,
      updatedAt: t1,
      unreadForCustomer: 0,
      messages: [
        {
          id: 'm6',
          author: 'You',
          role: 'customer',
          body: 'Our payout.finality webhooks failed after key rotation.',
          createdAt: t1,
        },
        {
          id: 'm7',
          author: 'Zord support',
          role: 'zord',
          body: 'Replay completed for the last 72h. Please confirm your endpoint returns 2xx on the test event from Settings → API keys.',
          createdAt: t1,
        },
      ],
    },
  ]
}

export function loadSupportTickets(tenantId: string): SupportTicket[] {
  if (typeof window === 'undefined') return seedSupportTickets()
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId))
    if (!raw) return seedSupportTickets()
    const parsed = JSON.parse(raw) as SupportTicket[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedSupportTickets()
  } catch {
    return seedSupportTickets()
  }
}

export function saveSupportTickets(tenantId: string, tickets: SupportTicket[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(tickets))
  } catch {
    /* quota / private mode */
  }
}

export function createSupportTicket(input: NewSupportTicketInput): SupportTicket {
  const ts = nowIso()
  const id = `t-${Date.now()}`
  return {
    id,
    ticketNumber: ticketNum(),
    category: input.category.trim(),
    topic: input.topic.trim(),
    status: 'open',
    state: 'active',
    preview: input.description.trim().slice(0, 140),
    createdAt: ts,
    updatedAt: ts,
    expectedReplyBefore: daysFromNow(input.priority === 'urgent' ? 1 : 3),
    unreadForCustomer: 0,
    contactEmail: input.contactEmail?.trim() || undefined,
    notifyByEmail: input.notifyByEmail === true,
    messages: [
      {
        id: `m-${Date.now()}`,
        author: 'You',
        role: 'customer',
        body: input.description.trim(),
        createdAt: ts,
      },
    ],
  }
}

export function appendCustomerReply(ticket: SupportTicket, body: string): SupportTicket {
  const ts = nowIso()
  const msg: SupportMessage = {
    id: `m-${Date.now()}`,
    author: 'You',
    role: 'customer',
    body: body.trim(),
    createdAt: ts,
    kind: 'chat',
  }
  return {
    ...ticket,
    updatedAt: ts,
    state: 'active',
    preview: body.trim().slice(0, 140),
    unreadForCustomer: 0,
    messages: [...ticket.messages, msg],
  }
}

export function appendEmailMessage(ticket: SupportTicket, input: EmailMessageInput): SupportTicket {
  const ts = nowIso()
  const msg: SupportMessage = {
    id: `m-${Date.now()}`,
    author: 'Email sent',
    role: 'customer',
    kind: 'email',
    emailDirection: 'outbound',
    emailTo: input.to.trim(),
    emailCc: input.cc?.trim() || undefined,
    emailSubject: input.subject.trim(),
    body: input.body.trim(),
    createdAt: ts,
  }
  return {
    ...ticket,
    updatedAt: ts,
    state: 'awaiting_zord',
    preview: `Email sent: ${input.subject.trim()}`,
    messages: [...ticket.messages, msg],
  }
}

export function markTicketRead(ticket: SupportTicket): SupportTicket {
  if (ticket.unreadForCustomer === 0) return ticket
  return { ...ticket, unreadForCustomer: 0 }
}
