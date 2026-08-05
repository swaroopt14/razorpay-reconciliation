import type {
  EmailMessageInput,
  NewSupportTicketInput,
  SupportTicket,
} from './supportTickets'
import { loadSupportTickets as loadLocalSupportTickets } from './supportTickets'

const STORAGE_PREFIX = 'zord:support-tickets'

function localStorageKey(tenantId: string) {
  return `${STORAGE_PREFIX}:${tenantId.trim() || 'default'}`
}

function isSeedOnly(tickets: SupportTicket[]): boolean {
  return tickets.length > 0 && tickets.every((t) => t.id.startsWith('t-seed-'))
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { message?: string }
  if (!res.ok) {
    const msg = typeof data.message === 'string' ? data.message : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

export async function fetchSupportTickets(tenantId: string): Promise<SupportTicket[]> {
  const res = await fetch('/api/support/tickets', { credentials: 'include', cache: 'no-store' })
  const data = await parseJson<{ tickets: SupportTicket[] }>(res)
  const tickets = Array.isArray(data.tickets) ? data.tickets : []

  if (tickets.length === 0 && typeof window !== 'undefined') {
    const local = loadLocalSupportTickets(tenantId)
    if (local.length > 0 && !isSeedOnly(local)) {
      try {
        const migrateRes = await fetch('/api/support/tickets', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ migrate: local }),
        })
        const migrated = await parseJson<{ tickets: SupportTicket[] }>(migrateRes)
        if (Array.isArray(migrated.tickets) && migrated.tickets.length > 0) {
          window.localStorage.removeItem(localStorageKey(tenantId))
          return migrated.tickets
        }
      } catch {
        /* keep empty server list */
      }
    }
  }

  return tickets
}

export async function createSupportTicketRemote(
  input: NewSupportTicketInput & { source?: 'manual_review' },
): Promise<SupportTicket> {
  const res = await fetch('/api/support/tickets', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await parseJson<{ ticket: SupportTicket }>(res)
  return data.ticket
}

export async function postSupportChatReply(ticketId: string, body: string): Promise<SupportTicket> {
  const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'chat', body }),
  })
  const data = await parseJson<{ ticket: SupportTicket }>(res)
  return data.ticket
}

export async function postSupportEmailMessage(
  ticketId: string,
  input: EmailMessageInput,
): Promise<SupportTicket> {
  const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'email', ...input }),
  })
  const data = await parseJson<{ ticket: SupportTicket }>(res)
  return data.ticket
}

export async function markSupportTicketReadRemote(ticketId: string): Promise<SupportTicket> {
  const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markRead: true }),
  })
  const data = await parseJson<{ ticket: SupportTicket }>(res)
  return data.ticket
}
