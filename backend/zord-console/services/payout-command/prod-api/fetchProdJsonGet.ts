export type ProdJsonGetResult<T> = {
  data: T | null
  ok: boolean
  status: number
  url: string
  /** Raw body when status is not OK (for UI diagnostics). */
  errorText?: string
}

/**
 * Single place to breakpoint all payout-command → `/api/prod/*` GET traffic.
 */
export async function fetchProdJsonGetWithMeta<T>(url: string): Promise<ProdJsonGetResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      const errorText = await response.text()
      return { data: null, ok: false, status: response.status, url, errorText }
    }
    const data = (await response.json()) as T
    return { data, ok: true, status: response.status, url }
  } catch {
    return { data: null, ok: false, status: 0, url }
  }
}

export async function fetchProdJsonGet<T>(url: string): Promise<T | null> {
  const res = await fetchProdJsonGetWithMeta<T>(url)
  return res.data
}
