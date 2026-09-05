import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import {
  buildArealisLetterheadPdf,
  fieldLine,
  formatPdfDate,
} from '@/services/payout-command/prod-api/arealisLetterheadPdf'

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
  client_payout_ref?: string
  client_reference?: string
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

function evidencePackPdf(pack: EvidencePackExportPayload): Promise<Uint8Array> {
  const packId = pack.evidence_pack_id || 'unknown'
  const paymentRef =
    pack.client_payout_ref || pack.client_reference || pack.intent_id || packId

  return buildArealisLetterheadPdf(
    {
      date: formatPdfDate(pack.created_at),
      to: 'Compliance, Audit & Dispute Review',
      subject: `Evidence Pack Statement - ${packId}`,
      title: 'Cryptographic evidence pack for payout verification at real-world scale',
    },
    [
      {
        heading: 'PACK IDENTITY',
        lines: [
          fieldLine('Evidence pack', pack.evidence_pack_id),
          fieldLine('Payment reference', paymentRef),
          fieldLine('Tenant', pack.tenant_id),
          fieldLine('Intent', pack.intent_id),
          fieldLine('Contract', pack.contract_id),
          fieldLine('Batch', pack.batch_id),
          fieldLine('Mode', pack.mode),
        ],
      },
      {
        heading: 'VERIFICATION STATUS',
        lines: [
          fieldLine('Pack status', pack.pack_status),
          fieldLine('Proof status', pack.proof_status),
          fieldLine('Proof score', pack.proof_score),
          fieldLine('Merkle root', pack.merkle_root),
          fieldLine('Created at', pack.created_at),
        ],
      },
      {
        heading: `EVIDENCE ITEMS (${pack.items?.length ?? 0})`,
        lines:
          (pack.items?.length ?? 0) === 0
            ? ['No evidence items attached.']
            : (pack.items ?? []).map((item, index) => {
                const leaf = item.leaf_hash || item.hash || '-'
                return `${index + 1}. ${item.type ?? '-'}  |  ref=${item.ref ?? '-'}  |  leaf=${leaf}`
              }),
      },
    ],
  )
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
    const pdf = await evidencePackPdf(pack)
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
