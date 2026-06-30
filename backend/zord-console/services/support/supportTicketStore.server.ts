import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SupportTicket } from '@/services/payout-command/support/supportTickets'

const DATA_DIR = path.join(process.cwd(), '.data', 'support-tickets')

function tenantFilePath(tenantId: string) {
  const safe = tenantId.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default'
  return path.join(DATA_DIR, `${safe}.json`)
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

export async function loadTenantSupportTickets(tenantId: string): Promise<SupportTicket[]> {
  await ensureDataDir()
  try {
    const raw = await readFile(tenantFilePath(tenantId), 'utf8')
    const parsed = JSON.parse(raw) as SupportTicket[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw err
  }
}

export async function saveTenantSupportTickets(tenantId: string, tickets: SupportTicket[]): Promise<void> {
  await ensureDataDir()
  await writeFile(tenantFilePath(tenantId), JSON.stringify(tickets, null, 2), 'utf8')
}

export async function migrateTenantSupportTicketsIfEmpty(
  tenantId: string,
  incoming: SupportTicket[],
): Promise<SupportTicket[]> {
  const existing = await loadTenantSupportTickets(tenantId)
  if (existing.length > 0) return existing
  if (!Array.isArray(incoming) || incoming.length === 0) return []
  const valid = incoming.filter((t) => t && typeof t.id === 'string')
  if (valid.length === 0) return []
  await saveTenantSupportTickets(tenantId, valid)
  return valid
}
