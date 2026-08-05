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

const STORAGE_PREFIX = 'zord:support-tickets:v2'

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
  const now = Date.now()
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()
  const yearsAgo = (n: number) => new Date(now - n * 365 * 86_400_000).toISOString()

  return [
    {
      id: 't-seed-open-1',
      ticketNumber: '229204',
      category: 'Integrations',
      topic: 'Payment gateway',
      status: 'open',
      state: 'awaiting_customer',
      preview: 'Need help with integration.\nContact Number: 8989989800',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      expectedReplyBefore: daysFromNow(1),
      unreadForCustomer: 1,
      contactEmail: 'ops.reviewer@zordnet.com',
      notifyByEmail: true,
      messages: [
        {
          id: 'm-open-1',
          author: 'You',
          role: 'customer',
          body: 'Need help with integration.\nContact Number: 8989989800',
          createdAt: daysAgo(1),
        },
        {
          id: 'm-open-2',
          author: 'Zord Support',
          role: 'zord',
          body: [
            'Hello,',
            '',
            'Greetings from Zord!',
            '',
            'Thank you for writing to us.',
            '',
            'Could you please share the exact query list or screenshots / error logs related to this issue?',
            '',
            'The ticket reference for your request is #229204.',
            '',
            'Thanks & Regards,',
            'Soubhagya J',
            'Senior Solutions Engineer',
            'Zord · Outgrow Ordinary',
            '',
            'Level 1 Escalation - Mayur Mahale',
            'Level 2 Escalation - Mayur Wadpalliwar',
            'Level 3 Escalation - Vivek Sridhar',
          ].join('\n'),
          createdAt: daysAgo(1),
        },
      ],
    },
    {
      id: 't-seed-closed-1',
      ticketNumber: '7650299',
      category: 'Transaction and Settlement Related',
      topic: 'Enable Instant settlements',
      status: 'closed',
      state: 'active',
      preview: 'Enable Instant Settlements',
      createdAt: daysAgo(30),
      updatedAt: daysAgo(28),
      unreadForCustomer: 0,
      messages: [
        {
          id: 'm-c1',
          author: 'You',
          role: 'customer',
          body: 'Enable Instant Settlements',
          createdAt: daysAgo(30),
        },
        {
          id: 'm-c1b',
          author: 'Zord Support',
          role: 'zord',
          body: 'Instant settlements have been enabled for your workspace. Please confirm the next payout cycle.',
          createdAt: daysAgo(28),
        },
      ],
    },
    {
      id: 't-seed-closed-2',
      ticketNumber: '4542615',
      category: 'Integrations',
      topic: 'Others',
      status: 'closed',
      state: 'active',
      preview: 'this is a test ticket. Contact Number: 9972132594',
      createdAt: yearsAgo(1),
      updatedAt: yearsAgo(1),
      unreadForCustomer: 0,
      messages: [
        {
          id: 'm-c2',
          author: 'You',
          role: 'customer',
          body: 'this is a test ticket. Contact Number: 9972132594',
          createdAt: yearsAgo(1),
        },
      ],
    },
    {
      id: 't-seed-closed-3',
      ticketNumber: '4012422',
      category: 'Integrations',
      topic: 'Invoices',
      status: 'closed',
      state: 'active',
      preview:
        'The invoices are not saving after updation nor are automatically being sent to the respective customers. Contact Num...',
      createdAt: yearsAgo(1),
      updatedAt: yearsAgo(1),
      unreadForCustomer: 0,
      messages: [
        {
          id: 'm-c3',
          author: 'You',
          role: 'customer',
          body: 'The invoices are not saving after updation nor are automatically being sent to the respective customers. Contact Number: 9972132594',
          createdAt: yearsAgo(1),
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
