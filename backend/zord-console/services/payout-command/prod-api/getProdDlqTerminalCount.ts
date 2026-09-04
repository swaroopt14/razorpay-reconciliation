import { fetchProdJsonGet } from './fetchProdJsonGet'

export const PROD_DLQ_TERMINAL_COUNT_PATH = '/api/prod/dlq/terminal/count'

export async function getProdDlqTerminalCount(): Promise<number | null> {
  const body = await fetchProdJsonGet<{ count?: number }>(PROD_DLQ_TERMINAL_COUNT_PATH)
  if (body == null) return null
  const count = typeof body.count === 'number' ? body.count : Number(body.count)
  return Number.isFinite(count) ? count : null
}
