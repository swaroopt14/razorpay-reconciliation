/**
 * Sandbox Proof Center exports — real file downloads for demo packs
 * (no upstream evidence service required).
 */

import type { ProofPack } from './proofCenterDemo'

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Minimal single-page Helvetica PDF (browser-safe, no Node Buffer). */
export function createSimplePdfBytes(lines: string[]): Uint8Array {
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
    `5 0 obj\n<< /Length ${utf8ByteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]

  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(utf8ByteLength(body))
    body += object
  }
  const xrefStart = utf8ByteLength(body)
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Copy into an ArrayBuffer-backed view so BlobPart typing accepts it under TS 5.x DOM libs. */
function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy], { type: 'application/pdf' })
}

export function packToExportPayload(pack: ProofPack) {
  return {
    evidence_pack_id: pack.id,
    payment_ref: pack.paymentRef,
    contract_id: pack.contractId,
    payee: pack.payeeLabel,
    batch_id: pack.batchId,
    amount: pack.amountLabel,
    business_outcome: pack.businessOutcome,
    integrity: pack.integrity,
    governance: pack.governance,
    coverage: pack.coverage,
    pack_hash: pack.packHash,
    merkle_root: pack.merkleRoot,
    signature: pack.signature,
    generated_at: pack.generatedAt,
    evidence: pack.evidence,
    missing_items: pack.missingItems,
    verify_scope: pack.verifyScopeNote,
    sandbox: true,
  }
}

export function downloadProofPackJson(pack: ProofPack) {
  const payload = packToExportPayload(pack)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${pack.id.toLowerCase()}-evidence-pack.json`)
}

export function downloadProofPackPdf(pack: ProofPack) {
  const lines = [
    'Zord Evidence Pack Statement (Sandbox)',
    `Generated: ${pack.generatedAt}`,
    '',
    '--- Pack identity ---',
    `Evidence pack:  ${pack.id}`,
    `Payment ref:    ${pack.paymentRef}`,
    `Contract:       ${pack.contractId}`,
    `Payee:          ${pack.payeeLabel}`,
    `Batch:          ${pack.batchId}`,
    `Amount:         ${pack.amountLabel}`,
    '',
    '--- Status (kept separate) ---',
    `Business outcome: ${pack.businessOutcome}`,
    `Integrity:        ${pack.integrity}`,
    `Governance:       ${pack.governance}`,
    `Coverage:         ${pack.coverage}`,
    '',
    '--- Cryptographic refs ---',
    `Pack hash:    ${pack.packHash}`,
    `Merkle root:  ${pack.merkleRoot}`,
    `Signature:    ${pack.signature}`,
    '',
    '--- Evidence items ---',
    ...pack.evidence.map(
      (e, i) =>
        `${i + 1}. ${e.kind} | ${e.available ? 'present' : 'missing'} | ${e.hash ?? '-'}`,
    ),
    '',
    pack.missingItems.length
      ? `Missing: ${pack.missingItems.join('; ')}`
      : 'Missing: none',
    '',
    pack.verifyScopeNote,
    '',
    'Sandbox export - illustrative data. Integrity verification does not attest upstream bank/ERP truthfulness alone.',
  ]
  const bytes = createSimplePdfBytes(lines)
  triggerDownload(pdfBlob(bytes), `${pack.id.toLowerCase()}-evidence-pack.pdf`)
}

export function downloadDisputePack(pack: ProofPack) {
  const lines = [
    'Zord Dispute Pack (Sandbox)',
    `Generated: ${new Date().toISOString()}`,
    '',
    '--- Dispute scope ---',
    `Evidence pack:    ${pack.id}`,
    `Payment:          ${pack.paymentRef}`,
    `Contract:         ${pack.contractId}`,
    `Observed outcome: ${pack.businessOutcome}`,
    `Amount:           ${pack.amountLabel}`,
    '',
    '--- Cited artefacts ---',
    `Pack hash:   ${pack.packHash}`,
    `Merkle root: ${pack.merkleRoot}`,
    `Signature:   ${pack.signature}`,
    '',
    '--- Evidence checklist ---',
    ...pack.evidence.map(
      (e, i) => `${i + 1}. [${e.available ? 'x' : ' '}] ${e.kind}${e.note ? ` - ${e.note}` : ''}`,
    ),
    '',
    pack.missingItems.length
      ? `Gaps to resolve: ${pack.missingItems.join('; ')}`
      : 'Gaps to resolve: none listed',
    '',
    'This dispute pack cites the same contract and outcome as the on-screen evidence pack.',
    'Does not change match class. Sandbox / illustrative.',
  ]
  const bytes = createSimplePdfBytes(lines)
  triggerDownload(pdfBlob(bytes), `${pack.id.toLowerCase()}-dispute-pack.pdf`)
}
