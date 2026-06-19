import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type EvidencePackExportPayload = {
  evidence_pack_id?: string
  tenant_id?: string
  intent_id?: string
  contract_id?: string
  batch_id?: string
  mode?: string
  pack_status?: string
  merkle_root?: string
  proof_status?: string
  proof_score?: number
  created_at?: string
  items?: Array<{
    type?: string
    ref?: string
    hash?: string
    leaf_hash?: string
    schema_version?: string
  }>
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function lineText(label: string, value: unknown): string {
  const text = value == null || value === '' ? '-' : String(value)
  return `${label}: ${text}`
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

function evidencePackPdf(pack: EvidencePackExportPayload): Uint8Array {
  const lines = [
    'Evidence Pack Export',
    lineText('Evidence Pack ID', pack.evidence_pack_id),
    lineText('Tenant ID', pack.tenant_id),
    lineText('Intent ID', pack.intent_id),
    lineText('Contract ID', pack.contract_id),
    lineText('Batch ID', pack.batch_id),
    lineText('Mode', pack.mode),
    lineText('Pack Status', pack.pack_status),
    lineText('Proof Status', pack.proof_status),
    lineText('Proof Score', pack.proof_score),
    lineText('Merkle Root', pack.merkle_root),
    lineText('Created At', pack.created_at),
    '',
    `Evidence Items (${pack.items?.length ?? 0})`,
    ...(pack.items ?? []).map((item, index) =>
      `${index + 1}. ${item.type ?? '-'} ref=${item.ref ?? '-'} leaf=${item.leaf_hash ?? item.hash ?? '-'}`,
    ),
  ]
  return createSimplePdf(lines)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const { packId: rawPackId } = await context.params
  const packId = rawPackId?.trim() || ''
  if (!packId) {
    return NextResponse.json({ error: 'packId is required.' }, { status: 400 })
  }

  const format = (request.nextUrl.searchParams.get('format') || 'json').toLowerCase()
  if (format !== 'json' && format !== 'pdf') {
    return NextResponse.json({ error: 'format must be json or pdf.' }, { status: 400 })
  }

  const upstreamUrl = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}${BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_BY_ID(packId)}?tenant_id=${encodeURIComponent(gate.tenantId)}`

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': gate.tenantId,
      },
      cache: 'no-store',
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      const res = new NextResponse(text, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const safePackId = safeFilenamePart(packId)
    if (format === 'json') {
      const res = new NextResponse(text, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="evidence_pack_${safePackId}.json"`,
          'cache-control': 'no-store',
        },
      })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const pack = JSON.parse(text) as EvidencePackExportPayload
    const pdf = evidencePackPdf(pack)
    const pdfBytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
    const res = new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="evidence_pack_${safePackId}.pdf"`,
        'cache-control': 'no-store',
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        error: 'evidence export service unreachable',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
