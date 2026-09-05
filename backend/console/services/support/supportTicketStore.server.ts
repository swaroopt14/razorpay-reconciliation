import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SupportTicket } from '@/services/payout-command/support/supportTickets'

const DATA_DIR = path.join(process.cwd(), '.data', 'support-tickets')

/** In-memory fallback when the container filesystem is not writable (common in Docker). */
const memoryStore = new Map<string, SupportTicket[]>()

function tenantKey(tenantId: string) {
  return tenantId.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default'
}

function tenantFilePath(tenantId: string) {
  return path.join(DATA_DIR, `${tenantKey(tenantId)}.json`)
}

async function ensureDataDir(): Promise<boolean> {
  try {
    await mkdir(DATA_DIR, { recursive: true })
    return true
  } catch (err) {
    console.warn('[zord] support ticket store: cannot create data dir, using memory', {
      dir: DATA_DIR,
      message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export async function loadTenantSupportTickets(tenantId: string): Promise<SupportTicket[]> {
  const key = tenantKey(tenantId)
  const canWrite = await ensureDataDir()
  if (!canWrite) {
    return memoryStore.get(key) ?? []
  }

  try {
    const raw = await readFile(tenantFilePath(tenantId), 'utf8')
    if (!raw.trim()) {
      return memoryStore.get(key) ?? []
    }
    const parsed = JSON.parse(raw) as SupportTicket[]
    const tickets = Array.isArray(parsed) ? parsed : []
    memoryStore.set(key, tickets)
    return tickets
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return memoryStore.get(key) ?? []
    }
    console.warn('[zord] support ticket store: load failed, using memory', {
      tenantId: key,
      message: err instanceof Error ? err.message : String(err),
    })
    return memoryStore.get(key) ?? []
  }
}

export async function saveTenantSupportTickets(tenantId: string, tickets: SupportTicket[]): Promise<void> {
  const key = tenantKey(tenantId)
  memoryStore.set(key, tickets)

  const canWrite = await ensureDataDir()
  if (!canWrite) return

  try {
    await writeFile(tenantFilePath(tenantId), JSON.stringify(tickets, null, 2), 'utf8')
  } catch (err) {
    console.warn('[zord] support ticket store: save failed, kept in memory', {
      tenantId: key,
      message: err instanceof Error ? err.message : String(err),
    })
  }
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
