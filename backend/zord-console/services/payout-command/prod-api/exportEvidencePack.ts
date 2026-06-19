import { apiTrimmedString } from './coerceApiField'

type DownloadResult = {
  ok: boolean
  status: number
  errorText?: string
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/"/g, ''))
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1]?.trim() || fallback
}

async function downloadResponse(response: Response, fallbackFilename: string): Promise<void> {
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameFromDisposition(response.headers.get('content-disposition'), fallbackFilename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function downloadEvidencePackJson(packId: string): Promise<DownloadResult> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { ok: false, status: 400, errorText: 'Evidence pack id is required.' }

  const response = await fetch(`/api/prod/evidence/packs/${encodeURIComponent(pid)}/export?format=json`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    return { ok: false, status: response.status, errorText: await response.text() }
  }

  await downloadResponse(response, `evidence_pack_${pid}.json`)
  return { ok: true, status: response.status }
}

export async function downloadEvidencePackPdf(packId: string): Promise<DownloadResult> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { ok: false, status: 400, errorText: 'Evidence pack id is required.' }

  const response = await fetch(`/api/prod/evidence/packs/${encodeURIComponent(pid)}/export?format=pdf`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    return { ok: false, status: response.status, errorText: await response.text() }
  }

  await downloadResponse(response, `evidence_pack_${pid}.pdf`)
  return { ok: true, status: response.status }
}
