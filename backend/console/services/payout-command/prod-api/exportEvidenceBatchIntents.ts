import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'

type DownloadResult = {
  ok: boolean
  status: number
  errorText?: string
}

type BatchIntentsResponse = {
  packs?: EvidencePackSummaryRow[]
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function createSimplePdf(lines: string[]): Uint8Array {
  const contentLines = lines.slice(0, 52).map((line, index) => {
    const y = 780 - index * 14
    return `BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line.slice(0, 100))}) Tj ET`
  })
  const stream = contentLines.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]

  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'))
    body += object
  }
  const xrefStart = Buffer.byteLength(body, 'utf8')
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return new Uint8Array(Buffer.from(body, 'utf8'))
}

async function downloadResponse(response: Response, fallbackFilename: string): Promise<void> {
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1]?.trim() || fallbackFilename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildPdfSummary(batchId: string, packs: EvidencePackSummaryRow[]): Uint8Array {
  const lines = [
    'Evidence Batch Intents Export',
    `Batch ID: ${batchId}`,
    `Pack Count: ${packs.length}`,
    '',
    ...packs.slice(0, 40).map((pack, index) => {
      const packId = apiTrimmedString(pack.evidence_pack_id) || '-'
      const intentId = apiTrimmedString(pack.intent_id) || '-'
      const mode = apiTrimmedString(pack.mode) || '-'
      const ref = apiTrimmedString(pack.client_payout_ref) || apiTrimmedString(pack.client_reference) || '-'
      return `${index + 1}. pack=${packId} intent=${intentId} mode=${mode} ref=${ref}`
    }),
  ]
  return createSimplePdf(lines)
}

export async function downloadEvidenceBatchIntentsJson(batchId: string): Promise<DownloadResult> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return { ok: false, status: 400, errorText: 'Batch id is required.' }

  const response = await fetch(`/api/prod/evidence/batch/${encodeURIComponent(bid)}/intents`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    return { ok: false, status: response.status, errorText: await response.text() }
  }

  await downloadResponse(response, `evidence_batch_${safeFilenamePart(bid)}_intents.json`)
  return { ok: true, status: response.status }
}

export async function downloadEvidenceBatchIntentsPdf(batchId: string): Promise<DownloadResult> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return { ok: false, status: 400, errorText: 'Batch id is required.' }

  const response = await fetch(`/api/prod/evidence/batch/${encodeURIComponent(bid)}/intents`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    return { ok: false, status: response.status, errorText: await response.text() }
  }

  const payload = (await response.json()) as BatchIntentsResponse
  const pdf = buildPdfSummary(bid, payload.packs ?? [])
  const pdfBytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `evidence_batch_${safeFilenamePart(bid)}_intents.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return { ok: true, status: response.status }
}
