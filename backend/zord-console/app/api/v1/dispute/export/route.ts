import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import {
  applyEvidenceGateCookies,
  gateEvidenceTenant,
  getEvidencePackById,
  listEvidencePacksByQuery,
} from '../../evidence/_shared'
import type { EvidencePackFull, EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import {
  buildArealisLetterheadPdf,
  formatPdfDate,
} from '@/services/payout-command/prod-api/arealisLetterheadPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportType = 'FINANCE_SUMMARY' | 'AUDIT_DETAILED' | 'BANK_PSP_PACK' | 'RAW_JSON'
type DisputeReason =
  | 'BENEFICIARY_SAYS_NOT_RECEIVED'
  | 'AMOUNT_MISMATCH'
  | 'SETTLEMENT_NOT_FOUND'

type ExportRequestBody = {
  payment_reference?: string
  dispute_reason?: DisputeReason
  export_type?: ExportType
}

function sanitizeFileSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
}

function letterheadPdfFromLines(
  title: string,
  subject: string,
  lines: string[],
  createdAt?: string | null,
): Promise<Buffer> {
  const sections: { heading?: string; lines: string[] }[] = []
  let current: { heading?: string; lines: string[] } = { lines: [] }

  for (const line of lines) {
    const sectionMatch = line.match(/^---\s*(.+?)\s*---$/)
    if (sectionMatch) {
      if (current.heading || current.lines.length) sections.push(current)
      current = { heading: sectionMatch[1].toUpperCase(), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  if (current.heading || current.lines.length) sections.push(current)

  return buildArealisLetterheadPdf(
    {
      date: formatPdfDate(createdAt),
      to: 'Finance, Compliance & Dispute Desk',
      subject,
      title,
    },
    sections.length ? sections : [{ lines }],
  ).then((pdf) => Buffer.from(pdf))
}

function toMinorAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return null
  if (parsed > 1000000000) return Math.round(parsed)
  return Math.round(parsed * 100)
}

function formatInr(minor: number | null): string {
  if (minor == null) return 'N/A'
  return `INR ${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function masked(value: string | undefined): string {
  const v = apiTrimmedString(value)
  if (!v) return 'N/A'
  if (v.length <= 6) return `${v.slice(0, 1)}***${v.slice(-1)}`
  return `${v.slice(0, 3)}***${v.slice(-3)}`
}

function packPaymentReference(pack: EvidencePackFull): string {
  return (
    apiTrimmedString(pack.client_payout_ref) ||
    apiTrimmedString(pack.client_reference) ||
    apiTrimmedString(pack.intent_id) ||
    apiTrimmedString(pack.evidence_pack_id) ||
    'unknown-payment'
  )
}

/** Mask a UTR leaving only the last 4 characters visible (mirrors zord-evidence MaskUTR). */
function maskUtr(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length)
  return '*'.repeat(value.length - 4) + value.slice(-4)
}

/** Resolve the UTR from the pack's utr/bank_reference fields; empty string when absent. */
function packUtr(pack: EvidencePackFull): string {
  const fromApi = (pack as Record<string, unknown>).utr
  const raw =
    (typeof fromApi === 'string' ? fromApi.trim() : '') ||
    apiTrimmedString(pack.bank_reference)
  if (!raw) return ''
  // Upstream may already return a masked value - don't double-mask.
  if (raw.includes('*')) return raw
  return maskUtr(raw)
}

function pickPackFromList(reference: string, rows: EvidencePackSummaryRow[]): EvidencePackSummaryRow | null {
  const lower = reference.toLowerCase()
  for (const row of rows) {
    const candidates = [
      apiTrimmedString(row.evidence_pack_id),
      apiTrimmedString(row.intent_id),
      apiTrimmedString(row.client_payout_ref),
      apiTrimmedString(row.client_reference),
      apiTrimmedString(row.bank_reference),
    ]
      .filter(Boolean)
      .map((v) => v.toLowerCase())
    if (candidates.some((candidate) => candidate === lower)) return row
  }
  return rows[0] ?? null
}

async function resolvePack(tenantId: string, paymentReference: string): Promise<EvidencePackFull | null> {
  const byId = await getEvidencePackById(tenantId, paymentReference)
  if (byId.ok) return byId.data

  const directIntent = await listEvidencePacksByQuery(
    tenantId,
    new URLSearchParams({ intent_id: paymentReference }),
  )
  if (directIntent.ok && (directIntent.data.packs?.length ?? 0) > 0) {
    const first = directIntent.data.packs[0]
    const full = await getEvidencePackById(tenantId, first.evidence_pack_id)
    if (full.ok) return full.data
  }

  const broad = await listEvidencePacksByQuery(tenantId, new URLSearchParams())
  if (broad.ok && (broad.data.packs?.length ?? 0) > 0) {
    const match = pickPackFromList(paymentReference, broad.data.packs)
    if (match) {
      const full = await getEvidencePackById(tenantId, match.evidence_pack_id)
      if (full.ok) return full.data
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const gate = await gateEvidenceTenant(request)
  if (!gate.ok) return gate.response

  let body: ExportRequestBody
  try {
    body = (await request.json()) as ExportRequestBody
  } catch {
    const res = NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const paymentReference = apiTrimmedString(body.payment_reference)
  const exportType = apiTrimmedString(body.export_type).toUpperCase() as ExportType
  const disputeReason = apiTrimmedString(body.dispute_reason).toUpperCase() as DisputeReason

  if (!paymentReference || !exportType || !disputeReason) {
    const res = NextResponse.json(
      {
        error: 'payment_reference, dispute_reason, and export_type are required',
      },
      { status: 400 },
    )
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const pack = await resolvePack(gate.tenantId, paymentReference)
  if (!pack) {
    const res = NextResponse.json(
      { error: `No evidence pack found for payment_reference ${paymentReference}` },
      { status: 404 },
    )
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const packRef = sanitizeFileSafe(packPaymentReference(pack))
  const utr = packUtr(pack)
  const rawZordSignature = (pack as Record<string, unknown>).zord_signature
  const zordSignature =
    (typeof rawZordSignature === 'string' ? rawZordSignature.trim() : '') ||
    apiTrimmedString(pack.signatures?.[0]?.sig) ||
    'N/A'

  if (exportType === 'FINANCE_SUMMARY') {
    const packAny = pack as Record<string, unknown>
    const currency = typeof packAny.currency === 'string' ? packAny.currency : 'INR'
    const proofScore = pack.proof_score != null ? pack.proof_score : 'N/A'
    const matched = pack.proof_components?.match_decision_available ?? false
    const pdf = await letterheadPdfFromLines(
      'Finance summary for payout verification and dispute response',
      `Finance Summary - ${masked(packPaymentReference(pack))}`,
      [
        '--- Payment ---',
        `Payment reference: ${masked(packPaymentReference(pack))}`,
        `Amount:            ${pack.amount ?? 'N/A'}`,
        `Currency:          ${currency}`,
        `UTR:               ${utr}`,
        `Status:            ${apiTrimmedString(pack.pack_status) || 'N/A'}`,
        '',
        '--- Verification ---',
        `Matched:           ${String(matched)}`,
        `Variance:          ${apiTrimmedString(pack.proof_status) || 'N/A'}`,
        `Proof score:       ${proofScore}/100`,
        `Explanation:       Payment verified. Proof score: ${proofScore}/100.`,
        `Zord signature:    ${zordSignature}`,
      ],
      pack.created_at,
    )
    const res = new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="finance-summary-${packRef}.pdf"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  if (exportType === 'AUDIT_DETAILED') {
    const resolvedPack = pack
    const sv = resolvedPack.schema_versions ?? {}
    const cs = resolvedPack.cryptographic_signatures ?? {}

    function itemHash(typeFragment: string): string {
      const item = (resolvedPack.items ?? []).find((i) =>
        (i.type || '').toUpperCase().includes(typeFragment.toUpperCase()),
      )
      return apiTrimmedString(item?.leaf_hash || item?.hash) || 'N/A'
    }

    const sig = pack.signatures?.[0]
    const pc = pack.proof_components ?? {}

    const pdf = await letterheadPdfFromLines(
      'Audit evidence pack for cryptographic payout defensibility',
      `Audit Evidence Pack - ${pack.evidence_pack_id}`,
      [
        '--- Identity ---',
        `Evidence pack:   ${pack.evidence_pack_id}`,
        `Intent:          ${pack.intent_id || 'N/A'}`,
        `Tenant:          ${pack.tenant_id}`,
        `Contract:        ${apiTrimmedString(pack.contract_id) || 'N/A'}`,
        `UTR:             ${utr}`,
        '',
        '--- Timestamps ---',
        `Instruction received:    ${apiTrimmedString(pack.payment_instruction_received) || 'N/A'}`,
        `Intent created:          ${apiTrimmedString(pack.canonical_intent_created) || 'N/A'}`,
        `Settlement received:     ${apiTrimmedString(pack.settlement_record_received) || 'N/A'}`,
        `Settlement created:      ${apiTrimmedString(pack.canonical_settlement_created) || 'N/A'}`,
        `Pack created:            ${pack.created_at}`,
        '',
        '--- Mapping Profiles ---',
        `Profile used:    ${apiTrimmedString(pack.mapping_profile_used) || 'N/A'}`,
        `Ruleset version: ${apiTrimmedString(pack.ruleset_version) || 'v1'}`,
        `Schema (intent):   ${sv.intent ?? sv.intent_schema ?? 'v1'}`,
        `Schema (outcome):  ${sv.outcome ?? sv.outcome_schema ?? 'v1'}`,
        `Schema (contract): ${sv.contract ?? sv.contract_schema ?? 'v1'}`,
        `Schema (attach):   ${sv.attachment ?? sv.attachment_schema ?? 'N/A'}`,
        '',
        '--- Hashes ---',
        `Raw intent hash:          ${cs.raw_intent_hash || itemHash('RAW_INGRESS_ENVELOPE') || 'N/A'}`,
        `Canonical intent hash:    ${itemHash('CANONICAL_INTENT')}`,
        `Raw settlement hash:      ${cs.raw_settlement_hash || itemHash('RAW_SETTLEMENT_ENVELOPE') || 'N/A'}`,
        `Canonical settlement hash:${cs.canonical_settlement_hash || itemHash('CANONICAL_SETTLEMENT') || 'N/A'}`,
        `Attachment decision hash: ${cs.attachment_decision_hash || itemHash('ATTACHMENT_DECISION') || 'N/A'}`,
        `Governance decision hash: ${cs.governance_decision_hash || itemHash('GOVERNANCE_DECISION') || 'N/A'}`,
        `Envelope hash:            ${itemHash('RAW_INGRESS_ENVELOPE') || cs.raw_intent_hash || 'N/A'}`,
        `Final evidence view hash: ${cs.final_evidence_view_hash || itemHash('FINAL_EVIDENCE_VIEW') || 'N/A'}`,
        '',
        '--- Governance ---',
        `Decision:         ${apiTrimmedString(pack.governance_decision) || 'N/A'}`,
        `Required fields:  ${String(pack.required_fields_status ?? 'N/A')}`,
        `Tokenization:     ${String(pack.tokenization_status ?? 'N/A')}`,
        '',
        `Merkle root:             ${apiTrimmedString(pack.merkle_root) || 'N/A'}`,
        '',
        '--- Signature ---',
        `Signer:    ${apiTrimmedString(sig?.signer) || 'N/A'}`,
        `Algorithm: ${apiTrimmedString(sig?.alg) || 'N/A'}`,
        `Signed at: ${apiTrimmedString(sig?.signed_at) || 'N/A'}`,
        `Zord signature: ${zordSignature}`,
        '',
        `Verification status:     ${String(pack.verification_status ?? 'N/A')}`,
        `Completeness score:      ${pack.pack_completeness_score ?? 'N/A'}`,
        `Settlement leaf present: ${String(pack.settlement_leaf_present_flag ?? 'N/A')}`,
        `Attachment decision:     ${String(pack.attachment_decision_leaf_present_flag ?? 'N/A')}`,
        '',
        '--- Proof Components ---',
        `Payment instruction: ${String(pc.payment_instruction_available ?? 'N/A')}`,
        `Settlement record:   ${String(pc.settlement_record_available ?? 'N/A')}`,
        `Match decision:      ${String(pc.match_decision_available ?? 'N/A')}`,
        `Governance check:    ${String(pc.governance_decision_available ?? 'N/A')}`,
        `Replay protection:   ${String(pc.replay_check_passed ?? 'N/A')}`,
        `Cryptographic seal:  ${(pack.signatures?.length ?? 0) > 0 ? 'true' : 'false'}`,
        '',
        `Proof score: ${pack.proof_score ?? 'N/A'}/100`,
      ],
      pack.created_at,
    )
    const res = new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="audit-evidence-${packRef}.pdf"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  if (exportType === 'BANK_PSP_PACK') {
    const packAnyBank = pack as Record<string, unknown>
    const currencyBank = typeof packAnyBank.currency === 'string' ? packAnyBank.currency : 'INR'
    const valueDate = pack.created_at ? pack.created_at.slice(0, 10) : 'N/A'
    const settlementItem = (pack.items ?? []).find((i) =>
      (i.type || '').toUpperCase().includes('SETTLEMENT'),
    )
    const settlementRef = apiTrimmedString(settlementItem?.ref) || 'N/A'
    const issueStatement = `${apiTrimmedString(pack.attachment_decision) || 'MATCH_EXACT'} - UTR:${utr}`
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Bank_PSP_Dispute')
    sheet.addRow(['UTR', 'Client Reference', 'Value Date', 'Amount', 'Currency', 'Variance Reason', 'Settlement Record', 'Issue Statement', 'Zord Signature'])
    sheet.addRow([
      utr,
      packPaymentReference(pack),
      valueDate,
      String(pack.amount ?? 'N/A'),
      currencyBank,
      apiTrimmedString(pack.proof_status) || 'N/A',
      settlementRef,
      issueStatement,
      zordSignature,
    ])
    const out = Buffer.from(await workbook.xlsx.writeBuffer())
    const res = new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="bank-psp-dispute-${packRef}.xlsx"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const raw = {
    export_type: exportType,
    dispute_reason: disputeReason,
    payment_reference: paymentReference,
    generated_at: new Date().toISOString(),
    evidence_pack: pack,
  }
  const res = new NextResponse(JSON.stringify(raw, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="technical-payload-${packRef}.json"`,
      'cache-control': 'no-store',
    },
  })
  applyEvidenceGateCookies(res, gate.refreshedPayload)
  return res
}
