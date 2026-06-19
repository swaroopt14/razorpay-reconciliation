package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"zord-evidence/models"
	"zord-evidence/utils"

	"github.com/google/uuid"
)

// ExportResult is returned by BuildDisputeExport and holds the payload bytes
// plus metadata about the export for logging and response headers.
type ExportResult struct {
	ContentType string
	Filename    string
	Payload     []byte
	PayloadHash string // SHA-256 of Payload
	ExportID    string
}

// BuildDisputeExport compiles the requested export format from the given pack.
// It enforces masking rules per spec §8 and records the export in the log table.
func (s *EvidenceService) BuildDisputeExport(
	ctx context.Context,
	req models.DisputeExportRequest,
	pack *models.EvidencePack,
	db *sql.DB,
) (*ExportResult, error) {

	var payload []byte
	var contentType, filename string
	var err error

	switch req.ExportType {
	case models.ExportTypeFinanceSummary:
		payload, err = buildFinanceSummary(pack, req)
		contentType = "text/html; charset=utf-8"
		filename = fmt.Sprintf("finance_summary_%s.html", pack.EvidencePackID)

	case models.ExportTypeAuditDetailed:
		payload, err = buildAuditPack(pack, req)
		contentType = "text/html; charset=utf-8"
		filename = fmt.Sprintf("audit_pack_%s.html", pack.EvidencePackID)

	case models.ExportTypeBankPSPPack:
		payload, err = buildBankPSPPack(pack, req)
		contentType = "text/csv; charset=utf-8"
		filename = fmt.Sprintf("bank_psp_pack_%s.csv", pack.EvidencePackID)

	case models.ExportTypeRawJSON:
		payload, err = buildRawJSONExport(pack, req)
		contentType = "application/json"
		filename = fmt.Sprintf("evidence_raw_%s.json", pack.EvidencePackID)

	default:
		return nil, fmt.Errorf("unsupported export_type %q: must be one of FINANCE_SUMMARY, AUDIT_DETAILED, BANK_PSP_PACK, RAW_JSON", req.ExportType)
	}

	if err != nil {
		return nil, fmt.Errorf("build export: %w", err)
	}

	sum := sha256.Sum256(payload)
	payloadHash := fmt.Sprintf("%x", sum[:])
	exportID := "exp_" + uuid.NewString()

	// Persist export log (spec §6)
	if db != nil {
		_, _ = db.ExecContext(ctx, `
INSERT INTO evidence_export_log(
    export_id, evidence_pack_id, tenant_id, intent_id,
    payment_reference, export_type, dispute_reason, requested_by, file_hash
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			exportID, pack.EvidencePackID, pack.TenantID, pack.IntentID,
			req.PaymentReference, req.ExportType, req.DisputeReason, req.RequestedBy, payloadHash,
		)

		// Increment export_count on the pack row
		_, _ = db.ExecContext(ctx,
			`UPDATE evidence_packs SET export_count = export_count + 1, updated_at = NOW() WHERE evidence_pack_id = $1`,
			pack.EvidencePackID,
		)
	}

	return &ExportResult{
		ContentType: contentType,
		Filename:    filename,
		Payload:     payload,
		PayloadHash: payloadHash,
		ExportID:    exportID,
	}, nil
}

// BuildExportPreview returns the structured view for a given export_type without
// rendering a file. Used by GET /v1/dispute/export/preview.
func BuildExportPreview(pack *models.EvidencePack, req models.DisputeExportRequest) (*models.ExportPreviewResponse, error) {
	resp := &models.ExportPreviewResponse{
		ExportType:     req.ExportType,
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
	}

	switch req.ExportType {
	case models.ExportTypeFinanceSummary:
		view := buildFinanceSummaryView(pack, req)
		resp.FinanceSummary = &view

	case models.ExportTypeAuditDetailed:
		view := buildAuditDetailedView(pack)
		resp.AuditDetailed = &view

	case models.ExportTypeBankPSPPack:
		view := buildBankPSPPackView(pack, req)
		resp.BankPSPPack = &view

	default:
		return nil, fmt.Errorf("preview not supported for export_type %q", req.ExportType)
	}

	return resp, nil
}

// =============================================================================
// FINANCE_SUMMARY (spec §6.1)
// High-level executive brief. PII masked. Single scannable page.
// =============================================================================

func buildFinanceSummaryView(pack *models.EvidencePack, req models.DisputeExportRequest) models.FinanceSummaryView {
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)

	// Payment reference: prefer client_payout_ref, fall back to request field
	payRef := req.PaymentReference
	if pack.ClientPayoutRef != nil && *pack.ClientPayoutRef != "" {
		payRef = *pack.ClientPayoutRef
	}

	// UTR — masked (last-4 visible per §8)
	utr := ""
	if pack.BankReference != nil {
		utr = *pack.BankReference
	}
	maskedUTR := MaskUTR(utr)

	// Matched flag
	matched := false
	if pack.AttachmentDecision != nil && strings.ToUpper(*pack.AttachmentDecision) == "MATCHED" {
		matched = true
	}

	// Variance label
	varianceLabel := deriveVarianceLabel(pack)

	return models.FinanceSummaryView{
		PaymentReference: payRef,
		Amount:           pack.Amount,
		Currency:         pack.Currency,
		UTR:              maskedUTR,
		Status:           pack.PackStatus,
		Matched:          matched,
		VarianceLabel:    varianceLabel,
		ProofScore:       score.Score,
		Explanation:      deriveFinanceExplanation(pack, score),
		ZordSignature:    pack.ZordSignature,
	}
}

func buildFinanceSummary(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	view := buildFinanceSummaryView(pack, req)
	maskedItems := MaskEvidenceItems(pack.Items, MaskingLevelBusiness)
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)

	matchedText := "NOT MATCHED"
	matchedClass := "warn"
	if view.Matched {
		matchedText = "MATCHED"
		matchedClass = "ok"
	}

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`)
	sb.WriteString(`<title>Finance Summary — ` + htmlEscape(view.PaymentReference) + `</title>`)
	sb.WriteString(`<style>
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
</style></head><body>`)

	sb.WriteString(`<h1>Payment Finance Summary</h1>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Generated:</strong> %s &nbsp;|&nbsp; <strong>Pack ID:</strong> %s</p>`,
		time.Now().UTC().Format(time.RFC3339), htmlEscape(pack.EvidencePackID)))

	if req.DisputeReason != "" {
		sb.WriteString(fmt.Sprintf(`<p><strong>Dispute Reason:</strong> %s</p>`, htmlEscape(req.DisputeReason)))
	}

	// === SUMMARY TABLE (8 required fields) ===
	sb.WriteString(`<h2>Summary</h2>`)
	sb.WriteString(`<table class="summary-grid">`)

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Payment Reference</td><td>%s</td></tr>`,
		htmlEscape(view.PaymentReference)))

	amountStr := view.Amount.String()
	if view.Currency != "" {
		amountStr += " " + view.Currency
	}
	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Amount</td><td>%s</td></tr>`,
		htmlEscape(amountStr)))

	utrDisplay := view.UTR
	if utrDisplay == "" {
		utrDisplay = "—"
	}
	sb.WriteString(fmt.Sprintf(`<tr><td class="label">UTR (Bank Reference)</td><td>%s</td></tr>`,
		htmlEscape(utrDisplay)))

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Status</td><td><span class="badge ok">%s</span></td></tr>`,
		htmlEscape(view.Status)))

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Match Status</td><td><span class="badge %s">%s</span></td></tr>`,
		matchedClass, matchedText))

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Variance</td><td>%s</td></tr>`,
		htmlEscape(view.VarianceLabel)))

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Proof Score</td><td><span class="score-badge">%d / 100</span></td></tr>`,
		view.ProofScore))

	sb.WriteString(fmt.Sprintf(`<tr><td class="label">Zord Signature</td><td style="word-break: break-all; font-family: monospace;">%s</td></tr>`, htmlEscape(view.ZordSignature)))

	sb.WriteString(`</table>`)

	// === ONE-LINE EXPLANATION ===
	sb.WriteString(fmt.Sprintf(`<div class="explanation-box">%s</div>`, htmlEscape(view.Explanation)))

	// === PROOF COMPONENTS ===
	if len(score.Deductions) > 0 {
		sb.WriteString(`<h2>Score Deductions</h2><ul>`)
		for _, d := range score.Deductions {
			sb.WriteString(`<li>` + htmlEscape(d) + `</li>`)
		}
		sb.WriteString(`</ul>`)
	}

	sb.WriteString(`<h2>Proof Components</h2><table><tr><th>Component</th><th>Weight</th><th>Status</th></tr>`)
	for _, c := range score.Components {
		status := `<span class="badge ok">✓ Passed</span>`
		if !c.Passed {
			status = `<span class="badge warn">✗ Missing</span>`
		}
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%d%%</td><td>%s</td></tr>`,
			htmlEscape(c.Check), c.Weight, status))
	}
	sb.WriteString(`</table>`)

	// === INTENT PIPELINE SIGNALS (Service 2) ===
	sb.WriteString(`<h2>Service 2 — Intent Pipeline Signals</h2><table><tr><th>Field</th><th>Value</th></tr>`)
	if pack.PaymentInstructionReceived != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Payment Instruction Received</td><td>%s</td></tr>`, pack.PaymentInstructionReceived.UTC().Format(time.RFC3339)))
	}
	if pack.CanonicalIntentCreated != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Canonical Intent Created</td><td>%s</td></tr>`, pack.CanonicalIntentCreated.UTC().Format(time.RFC3339)))
	}
	if pack.MappingProfileUsed != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Mapping Profile</td><td>%s</td></tr>`, htmlEscape(*pack.MappingProfileUsed)))
	}
	if pack.GovernanceDecision != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Governance Decision</td><td>%s</td></tr>`, htmlEscape(*pack.GovernanceDecision)))
	}
	if pack.RequiredFieldsStatus != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Required Fields Status</td><td>%v</td></tr>`, *pack.RequiredFieldsStatus))
	}
	if pack.TokenizationStatus != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Tokenization Status</td><td>%v</td></tr>`, *pack.TokenizationStatus))
	}
	sb.WriteString(`</table>`)

	// === SETTLEMENT RECONCILIATION SIGNALS (Service 5) ===
	sb.WriteString(`<h2>Service 5 — Settlement Reconciliation Signals</h2><table><tr><th>Field</th><th>Value</th></tr>`)
	if pack.SettlementRecordReceived != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Settlement Record Received</td><td>%s</td></tr>`, pack.SettlementRecordReceived.UTC().Format(time.RFC3339)))
	}
	if pack.CanonicalSettlementCreated != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Canonical Settlement Created</td><td>%s</td></tr>`, pack.CanonicalSettlementCreated.UTC().Format(time.RFC3339)))
	}
	if pack.AttachmentDecision != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Attachment Decision</td><td>%s</td></tr>`, htmlEscape(*pack.AttachmentDecision)))
	}
	if pack.MatchConfidence != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Match Confidence</td><td>%.2f%%</td></tr>`, *pack.MatchConfidence*100))
	}
	if pack.ValueDateCheck != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Value Date Check</td><td>%v</td></tr>`, *pack.ValueDateCheck))
	}
	if pack.AmountMatch != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Amount Match</td><td>%v</td></tr>`, *pack.AmountMatch))
	}
	sb.WriteString(`</table>`)

	// === MATCHED ARTIFACTS ===
	sb.WriteString(`<h2>Matched Artifacts (PII Masked)</h2><table>`)
	sb.WriteString(`<tr><th>Type</th><th>Reference (Masked)</th><th>Schema</th></tr>`)
	for _, item := range maskedItems {
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td><td>%s</td></tr>`,
			htmlEscape(item.Type), htmlEscape(item.Ref), htmlEscape(item.SchemaVersion)))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(`<footer>This document is confidential. Generated by Zord Evidence Service. PII fields are tokenised per RBI data localisation guidelines.</footer>`)
	sb.WriteString(`</body></html>`)

	return []byte(sb.String()), nil
}

// =============================================================================
// AUDIT_DETAILED (spec §6.2)
// Compliance-focused. Full hashes, timestamps, Merkle root, process checklist.
// =============================================================================

func buildAuditDetailedView(pack *models.EvidencePack) models.AuditDetailedView {
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)
	sigs := enrichPackSigs(pack)

	var sig *models.Signature
	if len(pack.Signatures) > 0 {
		s := pack.Signatures[0]
		sig = &s
	}

	govDecision := ""
	if pack.GovernanceDecision != nil {
		govDecision = *pack.GovernanceDecision
	}
	mappingProfile := ""
	if pack.MappingProfileUsed != nil {
		mappingProfile = *pack.MappingProfileUsed
	}

	checklist := models.ProofComponentsChecklist{
		PaymentInstruction: comp.PaymentInstructionAvailable,
		SettlementRecord:   comp.SettlementRecordAvailable,
		MatchDecision:      comp.MatchDecisionAvailable,
		GovernanceCheck:    comp.GovernanceDecisionAvailable,
		ReplayProtection:   comp.ReplayCheckPassed,
		CryptographicSeal:  sealExists,
	}

	return models.AuditDetailedView{
		EvidencePackID: pack.EvidencePackID,
		IntentID:       pack.IntentID,
		TenantID:       pack.TenantID,
		ContractID:     pack.ContractID,

		Timestamps: models.AuditTimestamps{
			PaymentInstructionReceived: pack.PaymentInstructionReceived,
			CanonicalIntentCreated:     pack.CanonicalIntentCreated,
			SettlementRecordReceived:   pack.SettlementRecordReceived,
			CanonicalSettlementCreated: pack.CanonicalSettlementCreated,
			PackCreatedAt:              pack.CreatedAt,
		},

		MappingProfiles: models.AuditMappingProfiles{
			MappingProfileUsed: mappingProfile,
			RulesetVersion:     pack.RulesetVersion,
			SchemaVersions:     pack.SchemaVersions,
		},

		Hashes: sigs,

		GovernanceStatus: models.AuditGovernanceStatus{
			GovernanceDecision:   govDecision,
			RequiredFieldsStatus: pack.RequiredFieldsStatus,
			TokenizationStatus:   pack.TokenizationStatus,
		},

		MerkleRoot: pack.MerkleRoot,
		Signature:  sig,

		VerificationStatus:        false, // updated by verify endpoint; static snapshot here
		PackCompletenessScore:     pack.PackCompletenessScore,
		SettlementLeafPresent:     pack.SettlementLeafPresentFlag,
		AttachmentDecisionPresent: pack.AttachmentDecisionLeafPresentFlag,

		ProofComponentsChecklist: checklist,
		ProofScore:               score.Score,
		ZordSignature:            pack.ZordSignature,
	}
}

func buildAuditPack(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)
	maskedItems := MaskEvidenceItems(pack.Items, MaskingLevelAudit)
	view := buildAuditDetailedView(pack)

	checkMark := func(b bool) string {
		if b {
			return `<span style="color:#155724;font-weight:bold">✓ Present</span>`
		}
		return `<span style="color:#721c24;font-weight:bold">✗ Missing</span>`
	}

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`)
	sb.WriteString(`<title>Audit Evidence Pack — ` + htmlEscape(pack.EvidencePackID) + `</title>`)
	sb.WriteString(`<style>
body{font-family:monospace;max-width:1040px;margin:2rem auto;color:#111;line-height:1.5}
h1{border-bottom:2px solid #333;padding-bottom:.4rem}
h2{background:#f5f5f5;padding:6px 10px;border-left:4px solid #555;margin-top:2rem}
table{border-collapse:collapse;width:100%;margin-bottom:1.5rem}
td,th{border:1px solid #bbb;padding:7px 10px;font-size:0.85rem}
th{background:#eee;font-weight:600}
.hash{font-size:0.72rem;word-break:break-all;color:#444}
.score-num{font-size:1.6rem;font-weight:bold}
footer{margin-top:3rem;font-size:0.72rem;color:#666;border-top:1px solid #ccc;padding-top:1rem}
</style></head><body>`)

	sb.WriteString(`<h1>Audit Evidence Pack</h1>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Evidence Pack ID:</strong> <span class="hash">%s</span></p>`, view.EvidencePackID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Intent ID:</strong> %s</p>`, view.IntentID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Contract ID:</strong> %s</p>`, htmlEscape(view.ContractID)))
	sb.WriteString(fmt.Sprintf(`<p><strong>Tenant ID:</strong> %s</p>`, view.TenantID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Mode:</strong> %s &nbsp;|&nbsp; <strong>Ruleset:</strong> %s</p>`,
		htmlEscape(pack.Mode), htmlEscape(pack.RulesetVersion)))
	if req.DisputeReason != "" {
		sb.WriteString(fmt.Sprintf(`<p><strong>Dispute Reason:</strong> %s</p>`, htmlEscape(req.DisputeReason)))
	}

	// ── Section 1: Timestamps ──
	sb.WriteString(`<h2>① Timestamps</h2>`)
	sb.WriteString(`<table><tr><th>Milestone</th><th>Timestamp (UTC)</th></tr>`)
	writeTimeRow := func(label string, t *time.Time) {
		if t != nil {
			sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td></tr>`, label, t.UTC().Format(time.RFC3339Nano)))
		} else {
			sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td style="color:#999">—</td></tr>`, label))
		}
	}
	writeTimeRow("Payment Instruction Received", view.Timestamps.PaymentInstructionReceived)
	writeTimeRow("Canonical Intent Created", view.Timestamps.CanonicalIntentCreated)
	writeTimeRow("Settlement Record Received", view.Timestamps.SettlementRecordReceived)
	writeTimeRow("Canonical Settlement Created", view.Timestamps.CanonicalSettlementCreated)
	t := view.Timestamps.PackCreatedAt
	writeTimeRow("Evidence Pack Created", &t)
	sb.WriteString(`</table>`)

	// ── Section 2: Mapping Profiles ──
	sb.WriteString(`<h2>② Mapping Profiles</h2>`)
	sb.WriteString(`<table><tr><th>Key</th><th>Value</th></tr>`)
	mp := view.MappingProfiles.MappingProfileUsed
	if mp == "" {
		mp = "—"
	}
	sb.WriteString(fmt.Sprintf(`<tr><td>Mapping Profile Used</td><td>%s</td></tr>`, htmlEscape(mp)))
	sb.WriteString(fmt.Sprintf(`<tr><td>Ruleset Version</td><td>%s</td></tr>`, htmlEscape(view.MappingProfiles.RulesetVersion)))
	for k, v := range view.MappingProfiles.SchemaVersions {
		sb.WriteString(fmt.Sprintf(`<tr><td>Schema: %s</td><td>%s</td></tr>`, htmlEscape(k), htmlEscape(v)))
	}
	sb.WriteString(`</table>`)

	// ── Section 3: Hashes ──
	sb.WriteString(`<h2>③ Hashes (Cryptographic Signatures)</h2>`)
	sb.WriteString(`<table><tr><th>Artifact</th><th>Hash</th></tr>`)
	writeHashRow := func(label, hash string) {
		if hash != "" {
			sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td class="hash">%s</td></tr>`, label, hash))
		}
	}
	writeHashRow("Raw Intent Hash", view.Hashes.RawIntentHash)
	writeHashRow("Canonical Intent Hash", view.Hashes.CanonicalIntentHash)
	writeHashRow("Raw Settlement Hash", view.Hashes.RawSettlementHash)
	writeHashRow("Canonical Settlement Hash", view.Hashes.CanonicalSettlementHash)
	writeHashRow("Attachment Decision Hash", view.Hashes.AttachmentDecisionHash)
	writeHashRow("Governance Decision Hash", view.Hashes.GovernanceDecisionHash)
	writeHashRow("Envelope Hash", view.Hashes.EnvelopeHash)
	writeHashRow("Final Evidence View Hash", view.Hashes.FinalEvidenceViewHash)
	sb.WriteString(`</table>`)

	sb.WriteString(`<h3>Evidence Item Leaf Hashes</h3>`)
	sb.WriteString(`<table><tr><th>#</th><th>Type</th><th>Ref</th><th>Leaf Hash</th><th>Schema</th></tr>`)
	for i, item := range maskedItems {
		sb.WriteString(fmt.Sprintf(`<tr><td>%d</td><td>%s</td><td>%s</td><td class="hash">%s</td><td>%s</td></tr>`,
			i, htmlEscape(item.Type), htmlEscape(item.Ref), item.LeafHash, item.SchemaVersion))
	}
	sb.WriteString(`</table>`)

	// ── Section 4: Governance Status ──
	sb.WriteString(`<h2>④ Governance Status</h2>`)
	sb.WriteString(`<table><tr><th>Field</th><th>Value</th></tr>`)
	govDecision := view.GovernanceStatus.GovernanceDecision
	if govDecision == "" {
		govDecision = "—"
	}
	sb.WriteString(fmt.Sprintf(`<tr><td>Governance Decision</td><td>%s</td></tr>`, htmlEscape(govDecision)))
	rfStatus := "—"
	if view.GovernanceStatus.RequiredFieldsStatus != nil {
		rfStatus = fmt.Sprintf("%v", *view.GovernanceStatus.RequiredFieldsStatus)
	}
	sb.WriteString(fmt.Sprintf(`<tr><td>Required Fields Status</td><td>%s</td></tr>`, rfStatus))
	tokStatus := "—"
	if view.GovernanceStatus.TokenizationStatus != nil {
		tokStatus = fmt.Sprintf("%v", *view.GovernanceStatus.TokenizationStatus)
	}
	sb.WriteString(fmt.Sprintf(`<tr><td>Tokenization Status</td><td>%s</td></tr>`, tokStatus))
	sb.WriteString(`</table>`)

	// ── Section 5: Merkle Root ──
	sb.WriteString(`<h2>⑤ Merkle Root &amp; Cryptographic Seal</h2>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Merkle Root:</strong> <span class="hash">%s</span></p>`, view.MerkleRoot))

	sb.WriteString(`<div class="section">
        <h2>7. Cryptographic Endorsement</h2>
        <div class="content">
            <p><strong>Zord Signature:</strong> <span style="word-break: break-all; font-family: monospace;">` + htmlEscape(view.ZordSignature) + `</span></p>`)
	if view.Signature != nil {
		sb.WriteString(fmt.Sprintf(`<p><strong>Signer:</strong> %s</p>`, htmlEscape(view.Signature.Signer)))
		sb.WriteString(fmt.Sprintf(`<p><strong>Algorithm:</strong> %s</p>`, htmlEscape(view.Signature.Alg)))
		sb.WriteString(fmt.Sprintf(`<p><strong>Signature:</strong> <span style="word-break: break-all; font-family: monospace;">%s</span></p>`, htmlEscape(view.Signature.Sig)))
		sb.WriteString(fmt.Sprintf(`<p><strong>Signed At:</strong> %s</p>`, view.Signature.SignedAt.UTC().Format(time.RFC3339Nano)))
	}
	sb.WriteString(`</div></div>`)

	// ── Section 6: Verification Status ──
	sb.WriteString(`<h2>⑥ Verification Status</h2>`)
	sb.WriteString(`<table><tr><th>Field</th><th>Value</th></tr>`)
	sb.WriteString(fmt.Sprintf(`<tr><td>Pack Completeness Score</td><td>%.0f%%</td></tr>`, view.PackCompletenessScore*100))
	sb.WriteString(fmt.Sprintf(`<tr><td>Settlement Leaf Present</td><td>%s</td></tr>`, checkMark(view.SettlementLeafPresent)))
	sb.WriteString(fmt.Sprintf(`<tr><td>Attachment Decision Leaf Present</td><td>%s</td></tr>`, checkMark(view.AttachmentDecisionPresent)))
	sb.WriteString(fmt.Sprintf(`<tr><td>Proof Score</td><td><strong>%d / 100</strong></td></tr>`, view.ProofScore))
	sb.WriteString(`</table>`)

	// ── Section 7: Proof Components Checklist ──
	sb.WriteString(`<h2>⑦ Proof Components Checklist</h2>`)
	sb.WriteString(`<table><tr><th>Component</th><th>Weight</th><th>Status</th><th>Explanation</th></tr>`)
	for _, c := range score.Components {
		statusCell := checkMark(c.Passed)
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%d%%</td><td>%s</td><td>%s</td></tr>`,
			htmlEscape(c.Check), c.Weight, statusCell, htmlEscape(c.Explanation)))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(fmt.Sprintf(`<footer>Audit pack generated at %s · Zord Evidence Service · Compliant with RBI ODR framework.</footer>`,
		time.Now().UTC().Format(time.RFC3339)))
	sb.WriteString(`</body></html>`)

	return []byte(sb.String()), nil
}

// =============================================================================
// BANK_PSP_PACK (spec §6.3)
// External execution pack for banks/PSPs in CSV format.
// =============================================================================

func buildBankPSPPackView(pack *models.EvidencePack, req models.DisputeExportRequest) models.BankPSPPackView {
	utr := ""
	if pack.BankReference != nil {
		utr = *pack.BankReference
	}
	maskedUTR := MaskUTR(utr)

	clientRef := ""
	if pack.ClientReference != nil {
		clientRef = *pack.ClientReference
	}

	varianceReason := deriveVarianceLabel(pack)
	settlementRecord := extractRefByType(pack, models.LeafTypeCanonicalSettlementObservation)
	valueDate := pack.CreatedAt.UTC().Format("2006-01-02")

	// Build one-line issue statement
	attachStatus := "UNKNOWN"
	if pack.AttachmentDecision != nil && *pack.AttachmentDecision != "" {
		attachStatus = *pack.AttachmentDecision
	}
	issueStatement := fmt.Sprintf("%s — %s — UTR:%s",
		req.DisputeReason, attachStatus, maskedUTR)
	if req.DisputeReason == "" {
		issueStatement = fmt.Sprintf("%s — UTR:%s", attachStatus, maskedUTR)
	}

	return models.BankPSPPackView{
		UTR:              maskedUTR,
		ClientReference:  clientRef,
		ValueDate:        valueDate,
		Amount:           pack.Amount,
		Currency:         pack.Currency,
		VarianceReason:   varianceReason,
		SettlementRecord: settlementRecord,
		IssueStatement:   issueStatement,
		ZordSignature:    pack.ZordSignature,
	}
}

func buildBankPSPPack(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	view := buildBankPSPPackView(pack, req)

	// variance_flag (legacy boolean column kept for backward compatibility)
	varianceFlag := "false"
	if v := getLeafByType(pack, models.LeafTypeVarianceDecision); v != nil {
		if v.Hash != models.ZeroVarianceHash {
			varianceFlag = "true"
		}
	}

	matchConfidence := ""
	if pack.MatchConfidence != nil {
		matchConfidence = fmt.Sprintf("%.4f", *pack.MatchConfidence)
	}
	valueDateCheck := "false"
	if pack.ValueDateCheck != nil && *pack.ValueDateCheck {
		valueDateCheck = "true"
	}
	amountMatch := "false"
	if pack.AmountMatch != nil && *pack.AmountMatch {
		amountMatch = "true"
	}

	var sb strings.Builder

	// Header — original columns preserved; new columns appended
	sb.WriteString("payment_reference,intent_id,contract_id,batch_id,utr_number,client_reference_id,value_date," +
		"attachment_status,match_confidence,variance_flag,value_date_check,amount_match,merkle_root,pack_status," +
		"dispute_reason,export_timestamp," +
		"amount,currency,variance_reason,settlement_record_ref,issue_statement,zord_signature\n")

	attachStatus := "UNKNOWN"
	if pack.AttachmentDecision != nil && *pack.AttachmentDecision != "" {
		attachStatus = *pack.AttachmentDecision
	} else if getLeafByType(pack, models.LeafTypeAttachmentDecision) != nil {
		attachStatus = "MATCHED"
	}

	sb.WriteString(fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
		// original columns
		csvEscape(req.PaymentReference),
		csvEscape(pack.IntentID),
		csvEscape(pack.ContractID),
		csvEscape(pack.ClientBatchID),
		csvEscape(view.UTR),
		csvEscape(view.ClientReference),
		csvEscape(view.ValueDate),
		csvEscape(attachStatus),
		csvEscape(matchConfidence),
		csvEscape(varianceFlag),
		csvEscape(valueDateCheck),
		csvEscape(amountMatch),
		csvEscape(pack.MerkleRoot),
		csvEscape(pack.PackStatus),
		csvEscape(req.DisputeReason),
		csvEscape(time.Now().UTC().Format(time.RFC3339)),
		// new columns
		csvEscape(view.Amount.String()),
		csvEscape(view.Currency),
		csvEscape(view.VarianceReason),
		csvEscape(view.SettlementRecord),
		csvEscape(view.IssueStatement),
		csvEscape(view.ZordSignature),
	))

	return []byte(sb.String()), nil
}

// =============================================================================
// RAW JSON Export (spec §6.4)
// Complete verifiable ledger dump. Admin-only.
// =============================================================================

func buildRawJSONExport(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	comp := deriveComponents(pack)
	score := ComputeProofScore(comp, true)

	payload := map[string]any{
		"export_metadata": map[string]any{
			"export_type":       req.ExportType,
			"payment_reference": req.PaymentReference,
			"dispute_reason":    req.DisputeReason,
			"requested_by":      req.RequestedBy,
			"exported_at":       time.Now().UTC().Format(time.RFC3339Nano),
		},
		"evidence_pack":    pack,
		"proof_score":      score,
		"proof_components": comp,
		"lineage_graph":    BuildLineageGraph(pack),
		"verification_hint": map[string]any{
			"instruction": "Re-compute leaf hashes from items using SHA256(type||ref||hash||schema_version) and rebuild the Merkle root using BuildMerkleRoot(leaves). Compare against merkle_root field.",
			"merkle_root": pack.MerkleRoot,
		},
	}
	return json.MarshalIndent(payload, "", "  ")
}

// =============================================================================
// Helpers
// =============================================================================

func deriveComponents(pack *models.EvidencePack) models.ProofComponents {
	var c models.ProofComponents
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeRawSettlementLine, models.LeafTypeCanonicalIntentHash:
			c.PaymentInstructionAvailable = true
		case models.LeafTypeRawSettlementFile, models.LeafTypeCanonicalSettlementObservation:
			c.SettlementRecordAvailable = true
		case models.LeafTypeAttachmentDecision:
			c.MatchDecisionAvailable = true
		case models.LeafTypeGovernanceDecision:
			c.GovernanceDecisionAvailable = true
		case models.LeafTypeVarianceDecision:
			c.ReplayCheckPassed = true
		}
	}
	return c
}

func extractRefByType(pack *models.EvidencePack, leafType string) string {
	item := getLeafByType(pack, leafType)
	if item == nil {
		return ""
	}
	return item.Ref
}

func getLeafByType(pack *models.EvidencePack, leafType string) *models.EvidenceItem {
	for i := range pack.Items {
		if pack.Items[i].Type == leafType {
			return &pack.Items[i]
		}
	}
	return nil
}

// deriveVarianceLabel returns "ZERO" when the variance leaf hash equals
// ZeroVarianceHash, and "NON-ZERO" when a real variance was recorded.
// Returns "UNKNOWN" when the variance leaf is absent from the pack.
func deriveVarianceLabel(pack *models.EvidencePack) string {
	v := getLeafByType(pack, models.LeafTypeVarianceDecision)
	if v == nil {
		return "UNKNOWN"
	}
	if v.Hash == models.ZeroVarianceHash {
		return "ZERO"
	}
	return "NON-ZERO"
}

// deriveFinanceExplanation produces a deterministic one-line human summary of
// the payment's current proof state, suitable for display in Finance Summary.
func deriveFinanceExplanation(pack *models.EvidencePack, score models.ProofScoreResult) string {
	if score.Score == 100 {
		return "Payment fully verified — matched and variance-free. Proof score: 100/100."
	}
	// Find the first failing component and explain it
	for _, c := range score.Components {
		if !c.Passed {
			return fmt.Sprintf("%s. Proof score: %d/100.", c.Explanation, score.Score)
		}
	}
	return fmt.Sprintf("Proof score %d/100 — partial evidence collected.", score.Score)
}

// enrichPackSigs builds the CryptographicSignatures view from pack items.
func enrichPackSigs(pack *models.EvidencePack) models.CryptographicSignatures {
	sigs := models.CryptographicSignatures{}
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeRawSettlementLine:
			sigs.RawIntentHash = item.Hash
		case models.LeafTypeCanonicalIntentHash:
			sigs.CanonicalIntentHash = item.Hash
		case models.LeafTypeRawSettlementFile:
			sigs.RawSettlementHash = item.Hash
		case models.LeafTypeCanonicalSettlementObservation:
			sigs.CanonicalSettlementHash = item.Hash
		case models.LeafTypeAttachmentDecision:
			sigs.AttachmentDecisionHash = item.Hash
		case models.LeafTypeGovernanceDecision:
			sigs.GovernanceDecisionHash = item.Hash
		case models.LeafTypeEnvelopeHash:
			sigs.EnvelopeHash = item.Hash
		case models.LeafTypeFinalEvidenceView:
			sigs.FinalEvidenceViewHash = item.Hash
		}
	}
	return sigs
}

// BuildEnrichedPack wraps an existing EvidencePack with the spec §4 enrichment layer.
func BuildEnrichedPack(pack *models.EvidencePack) *models.EnrichedEvidencePack {
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)
	status := DeriveProofStatus(comp, sealExists, pack.PackStatus == "SUPERSEDED", false)

	enriched := &models.EnrichedEvidencePack{
		EvidencePack:            *pack,
		ProofStatus:             status,
		ProofScore:              score.Score,
		ProofScoreBreakdown:     score,
		GeneratedBy:             "system",
		VerificationStatus:      false,
		ProofComponents:         comp,
		CryptographicSignatures: enrichPackSigs(pack),
	}

	return enriched
}

// RecomputeMerkleRoot deterministically re-derives the Merkle root from stored
// items exactly as GeneratePack does. Used by the verify endpoint.
func RecomputeMerkleRoot(pack *models.EvidencePack) string {
	leaves := make([]utils.MerkleLeaf, 0, len(pack.Items))
	for i, item := range pack.Items {
		leafInput := item.Type + "||" + item.Ref + "||" + item.Hash + "||" + item.SchemaVersion
		leafHash := utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: leafHash})
	}
	return utils.BuildMerkleRoot(leaves)
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}
