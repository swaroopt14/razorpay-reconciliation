/**
 * Sandbox Proof Center exports — real file downloads for demo packs
 * (no upstream evidence service required).
 */

import type { EvidenceItemKind, ProofPack } from './proofCenterDemo'

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
    outcome_detail: pack.outcomeDetail,
    signal_source: pack.signalSource,
    webhooks: pack.webhooks,
    sources: pack.sources,
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
    `Outcome detail:    ${pack.outcomeDetail}`,
    `Integrity:        ${pack.integrity}`,
    `Governance:       ${pack.governance}`,
    `Coverage:         ${pack.coverage}`,
    `Signal source:    ${pack.signalSource}`,
    '',
    '--- Webhooks gathered ---',
    ...pack.webhooks.map((w) => `${w.at} | ${w.event} | ${w.source} | ${w.status} | ${w.detail}`),
    '',
    '--- Cryptographic refs ---',
    `Pack hash:    ${pack.packHash}`,
    `Merkle root:  ${pack.merkleRoot}`,
    `Signature:    ${pack.signature}`,
    '',
    '--- Evidence items ---',
    ...pack.evidence.map(
      (e, i) =>
        `${i + 1}. ${e.kind} | ${e.source ?? '-'} | ${e.available ? 'present' : 'missing'} | ${e.hash ?? '-'} | ${e.note}`,
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function packFileId(pack: ProofPack): string {
  return pack.id.toLowerCase().replace(/[^a-z0-9._-]+/g, '_')
}

function evidenceByKind(pack: ProofPack, kind: EvidenceItemKind) {
  return pack.evidence.find((item) => item.kind === kind)
}

function componentStatus(present: boolean): { badge: string; label: string } {
  if (present) return { badge: 'ok', label: '✓ Passed' }
  return { badge: 'err', label: '✗ Missing' }
}

function proofComponents(pack: ProofPack) {
  const instruction = evidenceByKind(pack, 'Payout instruction')?.available !== false
  const settlement =
    evidenceByKind(pack, 'Bank credit')?.available === true ||
    evidenceByKind(pack, 'Settlement record')?.available === true
  const match = evidenceByKind(pack, 'Match decision')?.available === true
  const outcomeWebhook = evidenceByKind(pack, 'Outcome webhook')?.available === true
  const processing = evidenceByKind(pack, 'Processing webhook')?.available === true
  const variance = pack.businessOutcome === 'Exact' || match
  const seal = Boolean(pack.signature && pack.signature !== '-' && pack.merkleRoot && pack.merkleRoot !== '-')
  return [
    { name: 'Payout instruction (Razorpay API)', weight: 20, present: instruction },
    { name: 'Bank credit / settlement', weight: 20, present: settlement },
    { name: 'Match decision', weight: 20, present: match },
    { name: 'Outcome webhook (payout.processed / reversed)', weight: 15, present: outcomeWebhook },
    { name: 'Processing webhook', weight: 15, present: processing || variance },
    { name: 'Cryptographic seal', weight: 10, present: seal },
  ]
}

function proofScore(pack: ProofPack): number {
  const parts = proofComponents(pack)
  return parts.reduce((sum, part) => sum + (part.present ? part.weight : 0), 0)
}

function disputeReason(pack: ProofPack): string {
  if (pack.businessOutcome === 'Exact') return 'NONE'
  const detail = pack.outcomeDetail.toLowerCase()
  if (detail.includes('short')) return 'AMOUNT_MISMATCH'
  if (detail.includes('return') || detail.includes('reversal')) return 'BENEFICIARY_SAYS_NOT_RECEIVED'
  if (detail.includes('policy') || detail.includes('beneficiary change')) return 'GOVERNANCE_HOLD'
  return 'UTR_NOT_MATCHED'
}

function matchStatus(pack: ProofPack): { cls: string; label: string } {
  if (pack.businessOutcome === 'Exact') return { cls: 'ok', label: 'MATCHED' }
  if (pack.coverageRank <= 3) return { cls: 'warn', label: 'NEED REVIEW' }
  return { cls: 'warn', label: 'NEED REVIEW' }
}

function timelineValue(pack: ProofPack, labels: string[], fallback: string): string {
  const hit = pack.timeline.find((event) => labels.some((label) => event.label.toLowerCase().includes(label)))
  return hit?.at || pack.generatedAt || fallback
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Finance summary HTML — same layout as the Zord Evidence Service export. */
export function buildFinanceSummaryHtml(pack: ProofPack): string {
  const score = proofScore(pack)
  const match = matchStatus(pack)
  const generated = isoNow()
  const variance = pack.businessOutcome === 'Exact' ? 'ZERO' : 'NON-ZERO'
  const statusCls = pack.integrity === 'Failed' ? 'err' : pack.integrity === 'Pending' ? 'warn' : 'ok'
  const explanation =
    pack.businessOutcome === 'Exact' && score === 100
      ? `Payment fully verified — matched and variance-free. Proof score: ${score}/100.`
      : pack.verifyScopeNote
  const components = proofComponents(pack)
  const artifactRows = pack.evidence
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.kind.toUpperCase().replace(/ /g, '_'))}</td><td>${escapeHtml(item.hash || item.id)}</td><td>v1</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Finance Summary — ${escapeHtml(pack.paymentRef)}</title><style>
body{font-family:sans-serif;max-width:960px;margin:2rem auto;color:#222;line-height:1.5}
h1{border-bottom:2px solid #0056b3;padding-bottom:.5rem;color:#0056b3}
h2{color:#0056b3;margin-top:2rem}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:10px 12px;text-align:left}
th{background:#eef2ff;font-weight:600}
.score-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:1.8rem;font-weight:bold;background:#e8f5e9;color:#2e7d32}
.badge{padding:3px 10px;border-radius:4px;font-size:0.85rem;font-weight:600}
.ok{background:#d4edda;color:#155724}
.warn{background:#fff3cd;color:#856404}
.err{background:#f8d7da;color:#721c24}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.summary-grid td{font-size:1rem}
.summary-grid .label{font-weight:600;background:#f7f9ff;width:200px}
.explanation-box{background:#f0f7ff;border-left:4px solid #0056b3;padding:12px 16px;margin:1rem 0;font-style:italic;color:#0056b3}
footer{margin-top:3rem;font-size:0.75rem;color:#888;border-top:1px solid #eee;padding-top:1rem}
</style></head><body>
<h1>Payment Finance Summary</h1>
<p><strong>Generated:</strong> ${escapeHtml(generated)} &nbsp;|&nbsp; <strong>Pack ID:</strong> ${escapeHtml(pack.id)}</p>
<p><strong>Dispute Reason:</strong> ${escapeHtml(disputeReason(pack))}</p>
<h2>Summary</h2>
<table class="summary-grid">
<tr><td class="label">Payment Reference</td><td>${escapeHtml(pack.paymentRef)}</td></tr>
<tr><td class="label">Amount</td><td>${escapeHtml(pack.amountLabel)}</td></tr>
<tr><td class="label">UTR (Bank Reference)</td><td>${escapeHtml(evidenceByKind(pack, 'Settlement record')?.hash || '—')}</td></tr>
<tr><td class="label">Status</td><td><span class="badge ${statusCls}">${escapeHtml(pack.integrity === 'Verified' ? 'ACTIVE' : pack.integrity.toUpperCase())}</span></td></tr>
<tr><td class="label">Match Status</td><td><span class="badge ${match.cls}">${match.label}</span></td></tr>
<tr><td class="label">Variance</td><td>${variance}</td></tr>
<tr><td class="label">Proof Score</td><td><span class="score-badge">${score} / 100</span></td></tr>
<tr><td class="label">Zord Signature</td><td style="word-break: break-all; font-family: monospace;">${escapeHtml(pack.signature)}</td></tr>
</table>
<div class="explanation-box">${escapeHtml(explanation)}</div>
<h2>Proof Components</h2>
<table>
<tr><th>Component</th><th>Weight</th><th>Status</th></tr>
${components
  .map((part) => {
    const st = componentStatus(part.present)
    return `<tr><td>${escapeHtml(part.name)}</td><td>${part.weight}%</td><td><span class="badge ${st.badge}">${st.label}</span></td></tr>`
  })
  .join('')}
</table>
<h2>Service 2 — Payout / webhook signals</h2>
<table>
<tr><th>Field</th><th>Value</th></tr>
<tr><td>Payout instruction received</td><td>${escapeHtml(timelineValue(pack, ['payout created', 'instruction'], pack.generatedAt))}</td></tr>
<tr><td>Webhook payout.pending</td><td>${escapeHtml(timelineValue(pack, ['payout.pending', 'pending'], pack.generatedAt))}</td></tr>
<tr><td>Webhook payout.processing</td><td>${escapeHtml(timelineValue(pack, ['payout.processing', 'processing'], pack.generatedAt))}</td></tr>
<tr><td>Signal source</td><td>${escapeHtml(pack.signalSource)}</td></tr>
<tr><td>Coverage</td><td>${escapeHtml(pack.coverage)}</td></tr>
<tr><td>Governance</td><td>${escapeHtml(pack.governance)}</td></tr>
</table>
<h2>Service 5 — Settlement Reconciliation Signals</h2>
<table>
<tr><th>Field</th><th>Value</th></tr>
<tr><td>Bank credit / settlement received</td><td>${escapeHtml(timelineValue(pack, ['bank credit', 'settlement', 'return', 'reversal'], pack.generatedAt))}</td></tr>
<tr><td>Match decision</td><td>${escapeHtml(timelineValue(pack, ['match'], pack.generatedAt))}</td></tr>
<tr><td>Attachment Decision</td><td>${pack.businessOutcome === 'Exact' ? 'MATCH_EXACT' : 'NEED_REVIEW'}</td></tr>
<tr><td>Match Confidence</td><td>${pack.businessOutcome === 'Exact' ? '96.75%' : pack.coverageRank >= 4 ? '82.00%' : '—'}</td></tr>
<tr><td>Value Date Check</td><td>${evidenceByKind(pack, 'Settlement record')?.available ? 'true' : 'false'}</td></tr>
<tr><td>Amount Match</td><td>${pack.businessOutcome === 'Exact' ? 'true' : 'false'}</td></tr>
</table>
<h2>Matched Artifacts (PII Masked)</h2>
<table>
<tr><th>Type</th><th>Reference (Masked)</th><th>Schema</th></tr>
${artifactRows}
<tr><td>FINAL_EVIDENCE_VIEW</td><td>${escapeHtml(pack.id)}</td><td>v1</td></tr>
</table>
<footer>This document is confidential. Generated by Zord Evidence Service. PII fields are tokenised per RBI data localisation guidelines.</footer>
</body></html>`
}

/** Audit evidence pack HTML — same layout as the Zord Evidence Service export. */
export function buildAuditPackHtml(pack: ProofPack): string {
  const score = proofScore(pack)
  const generated = isoNow()
  const present = (ok: boolean) =>
    ok
      ? '<span style="color:#155724;font-weight:bold">✓ Present</span>'
      : '<span style="color:#721c24;font-weight:bold">✗ Missing</span>'
  const components = proofComponents(pack)
  const hashRows = pack.evidence
    .map(
      (item, index) =>
        `<tr><td>${index}</td><td>${escapeHtml(item.kind.toUpperCase().replace(/ /g, '_'))}</td><td>${escapeHtml(item.id)}</td><td class="hash">${escapeHtml(item.hash || '—')}</td><td>v1</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Audit Evidence Pack — ${escapeHtml(pack.id)}</title><style>
body{font-family:monospace;max-width:1040px;margin:2rem auto;color:#111;line-height:1.5}
h1{border-bottom:2px solid #333;padding-bottom:.4rem}
h2{background:#f5f5f5;padding:6px 10px;border-left:4px solid #555;margin-top:2rem}
table{border-collapse:collapse;width:100%;margin-bottom:1.5rem}
td,th{border:1px solid #bbb;padding:7px 10px;font-size:0.85rem}
th{background:#eee;font-weight:600}
.hash{font-size:0.72rem;word-break:break-all;color:#444}
.score-num{font-size:1.6rem;font-weight:bold}
footer{margin-top:3rem;font-size:0.72rem;color:#666;border-top:1px solid #ccc;padding-top:1rem}
</style></head><body>
<h1>Audit Evidence Pack</h1>
<p><strong>Evidence Pack ID:</strong> <span class="hash">${escapeHtml(pack.id)}</span></p>
<p><strong>Intent ID:</strong> ${escapeHtml(pack.paymentRef)}</p>
<p><strong>Contract ID:</strong> ${escapeHtml(pack.contractId)}</p>
<p><strong>Tenant ID:</strong> sandbox-demo</p>
<p><strong>Mode:</strong> INTELLIGENCE_ATTACH &nbsp;|&nbsp; <strong>Ruleset:</strong> v1</p>
<p><strong>Dispute Reason:</strong> ${escapeHtml(disputeReason(pack))}</p>
<h2>① Timestamps</h2>
<table>
<tr><th>Milestone</th><th>Timestamp (UTC)</th></tr>
<tr><td>Payout instruction received</td><td>${escapeHtml(timelineValue(pack, ['payout created', 'instruction'], pack.generatedAt))}</td></tr>
<tr><td>Webhook payout.pending</td><td>${escapeHtml(timelineValue(pack, ['payout.pending', 'pending'], pack.generatedAt))}</td></tr>
<tr><td>Bank credit / settlement received</td><td>${escapeHtml(timelineValue(pack, ['bank credit', 'settlement', 'return', 'reversal'], pack.generatedAt))}</td></tr>
<tr><td>Match decision</td><td>${escapeHtml(timelineValue(pack, ['match'], pack.generatedAt))}</td></tr>
<tr><td>Evidence Pack Created</td><td>${escapeHtml(pack.generatedAt)}</td></tr>
</table>
<h2>② Mapping Profiles</h2>
<table>
<tr><th>Key</th><th>Value</th></tr>
<tr><td>Mapping Profile Used</td><td>auto-generic-${escapeHtml(pack.batchId)}-v1</td></tr>
<tr><td>Ruleset Version</td><td>v1</td></tr>
<tr><td>Schema: attachment_schema</td><td>v1</td></tr>
<tr><td>Schema: intent_schema</td><td>v1</td></tr>
<tr><td>Schema: outcome_schema</td><td>v1</td></tr>
<tr><td>Schema: contract_schema</td><td>v1</td></tr>
</table>
<h2>③ Hashes (Cryptographic Signatures)</h2>
<table>
<tr><th>Artifact</th><th>Hash</th></tr>
<tr><td>Pack Hash</td><td class="hash">${escapeHtml(pack.packHash)}</td></tr>
<tr><td>Merkle Root</td><td class="hash">${escapeHtml(pack.merkleRoot)}</td></tr>
<tr><td>Signature</td><td class="hash">${escapeHtml(pack.signature)}</td></tr>
${pack.evidence
  .map((item) => `<tr><td>${escapeHtml(item.kind)}</td><td class="hash">${escapeHtml(item.hash || '—')}</td></tr>`)
  .join('')}
</table>
<h3>Evidence Item Leaf Hashes</h3>
<table>
<tr><th>#</th><th>Type</th><th>Ref</th><th>Leaf Hash</th><th>Schema</th></tr>
${hashRows}
</table>
<h2>④ Governance Status</h2>
<table>
<tr><th>Field</th><th>Value</th></tr>
<tr><td>Governance Decision</td><td>${escapeHtml(pack.governance)}</td></tr>
<tr><td>Required Fields Status</td><td>${pack.governance === 'Need review' ? 'review' : 'true'}</td></tr>
<tr><td>Tokenization Status</td><td>true</td></tr>
</table>
<h2>⑤ Merkle Root &amp; Cryptographic Seal</h2>
<p><strong>Merkle Root:</strong> <span class="hash">${escapeHtml(pack.merkleRoot)}</span></p>
<div class="section">
  <h2>7. Cryptographic Endorsement</h2>
  <div class="content">
    <p><strong>Zord Signature:</strong> <span style="word-break: break-all; font-family: monospace;">${escapeHtml(pack.signature)}</span></p>
    <p><strong>Signer:</strong> zord_evidence</p>
    <p><strong>Algorithm:</strong> EdDSA</p>
    <p><strong>Signed At:</strong> ${escapeHtml(pack.generatedAt)}</p>
  </div>
</div>
<h2>⑥ Verification Status</h2>
<table>
<tr><th>Field</th><th>Value</th></tr>
<tr><td>Pack Completeness Score</td><td>${score}%</td></tr>
<tr><td>Settlement Leaf Present</td><td>${present(evidenceByKind(pack, 'Settlement record')?.available === true)}</td></tr>
<tr><td>Attachment Decision Leaf Present</td><td>${present(evidenceByKind(pack, 'Match decision')?.available === true)}</td></tr>
<tr><td>Proof Score</td><td><strong class="score-num">${score} / 100</strong></td></tr>
</table>
<h2>⑦ Proof Components Checklist</h2>
<table>
<tr><th>Component</th><th>Weight</th><th>Status</th><th>Explanation</th></tr>
${components
  .map((part) => {
    const note = part.present ? '' : 'Required artefact missing from this pack.'
    return `<tr><td>${escapeHtml(part.name)}</td><td>${part.weight}%</td><td>${present(part.present)}</td><td>${escapeHtml(note)}</td></tr>`
  })
  .join('')}
</table>
<footer>Audit pack generated at ${escapeHtml(generated)} · Zord Evidence Service · Compliant with RBI ODR framework.</footer>
</body></html>`
}

export function downloadFinanceSummaryHtml(pack: ProofPack) {
  const blob = new Blob([buildFinanceSummaryHtml(pack)], { type: 'text/html;charset=utf-8' })
  triggerDownload(blob, `finance_summary_${packFileId(pack)}.html`)
}

export function downloadAuditPackHtml(pack: ProofPack) {
  const blob = new Blob([buildAuditPackHtml(pack)], { type: 'text/html;charset=utf-8' })
  triggerDownload(blob, `audit_pack_${packFileId(pack)}.html`)
}
