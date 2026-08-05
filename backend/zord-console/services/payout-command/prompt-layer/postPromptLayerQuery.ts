/**
 * Ask Zord workspace → `/api/prompt-layer/query` (RAG / evidence layer).
 * Breakpoint-friendly: request + JSON parse live here.
 */
export const PROMPT_LAYER_QUERY_PATH = '/api/prompt-layer/query'

/** Session tenant required for prompt-layer — no demo / mock fallback. */
export function sessionTenantForPromptLayer(
  tenantId: string,
  tenantReady: boolean,
): { ok: true; tenantId: string } | { ok: false; title: string; body: string } {
  if (!tenantReady) {
    return {
      ok: false,
      title: 'Resolving workspace',
      body: 'Loading your workspace from the signed-in session…',
    }
  }
  const tid = tenantId.trim()
  if (!tid) {
    return {
      ok: false,
      title: 'Sign in required',
      body: 'Sign in to sandbox or live, then try Ask Zord again.',
    }
  }
  return { ok: true, tenantId: tid }
}
export type PromptLayerUIContextMetric = {
  label: string
  value: string
}

export type PromptLayerUIContext = {
  scope?: string
  scope_level?: 'tenant' | 'batch'
  source_page?: string
  section_title?: string
  selected_title?: string
  selected_description?: string
  selected_metrics?: PromptLayerUIContextMetric[]
  batch_id?: string
}
export type PostPromptLayerQueryBody = {
  query: string
  top_k: number
  ui_context?: PromptLayerUIContext
}
export type PromptLayerRequestContext = {
  tenantId: string
  sessionId: string
  userId?: string
}
export type PostPromptLayerQueryResult = {
  ok: boolean
  httpStatus: number
  payload: unknown
}

export async function postPromptLayerQuery(
  body: PostPromptLayerQueryBody,
  ctx: PromptLayerRequestContext,
): Promise<PostPromptLayerQueryResult> {
  const response = await fetch(PROMPT_LAYER_QUERY_PATH, {
    method: 'POST',
    headers: {
  'content-type': 'application/json',
  'x-tenant-id': ctx.tenantId,
  'x-session-id': ctx.sessionId,
  ...(ctx.userId?.trim() ? { 'x-user-id': ctx.userId.trim() } : {}),
},
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok, httpStatus: response.status, payload }
}

/** Maps prompt-layer JSON (`answer` at root or under `response`). */
export function mapPromptLayerAnswer(
  raw: unknown,
  title = 'Ask Zord',
): { title: string; body: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const root = (raw as { response?: unknown }).response ?? raw
  if (!root || typeof root !== 'object') return null
  const res = root as Record<string, unknown>
  const answer = typeof res.answer === 'string' ? res.answer.trim() : ''
  if (!answer) return null
  return { title, body: answer }
}
