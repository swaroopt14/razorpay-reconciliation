package handlers

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"zord-evidence/models"
	"zord-evidence/repositories"
	"zord-evidence/services"

	"github.com/gin-gonic/gin"
)

// ProofHandler serves the spec §4–§7 endpoints.
// It is completely independent of EvidenceHandler — no existing methods modified.
type ProofHandler struct {
	svc        *services.EvidenceService
	enrichRepo *repositories.EnrichmentRepository
	db         *sql.DB
}

func NewProofHandler(
	svc *services.EvidenceService,
	enrichRepo *repositories.EnrichmentRepository,
	db *sql.DB,
) *ProofHandler {
	return &ProofHandler{svc: svc, enrichRepo: enrichRepo, db: db}
}

// GET /v1/evidence/packs/:packID/enriched
// Returns spec §4 EnrichedEvidencePack — proof status, score, components, crypto signatures.
// Upstream lineage signals (Service 2 / Service 5) are present on the embedded EvidencePack
// fields (payment_instruction_received, bank_reference, etc.) — not duplicated as nested objects.
func (h *ProofHandler) GetEnrichedPack(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	enriched := services.BuildEnrichedPack(pack)

	// Overlay persisted enrichment columns written by GeneratePack.
	// proof_score, proof_status, proof_components_json etc. are written atomically
	// at pack generation time so DB values are always authoritative.
	ps, score, genBy, lvAt, ver, expCnt, comp, sigs, breakdown, _, _, dbErr :=
		h.enrichRepo.GetEnrichedFields(c.Request.Context(), packID)
	if dbErr == nil && ps != "" {
		enriched.ProofStatus = models.ProofStatus(ps)
		enriched.ProofScore = score
		enriched.GeneratedBy = genBy
		enriched.LastVerifiedAt = lvAt
		enriched.VerificationStatus = ver
		enriched.ExportCount = expCnt
		if comp.PaymentInstructionAvailable || comp.SettlementRecordAvailable {
			enriched.ProofComponents = comp
		}
		if sigs.RawIntentHash != "" || sigs.CanonicalIntentHash != "" {
			enriched.CryptographicSignatures = sigs
		}
		if len(breakdown.Components) > 0 {
			enriched.ProofScoreBreakdown = breakdown
		}
	}

	c.JSON(http.StatusOK, enriched)
}

// GET /v1/evidence/packs/:packID/timeline
// Spec §5 Engine A — operational timeline for business-facing display.
func (h *ProofHandler) GetTimeline(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	timeline := services.BuildTimeline(pack)
	c.JSON(http.StatusOK, gin.H{
		"evidence_pack_id": packID,
		"intent_id":        pack.IntentID,
		"timeline":         timeline,
	})
}

// GET /v1/evidence/packs/:packID/lineage-graph
// Spec §5 Engine B — Merkle DAG for auditor-facing display.
func (h *ProofHandler) GetLineageGraph(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	graph := services.BuildLineageGraph(pack)
	c.JSON(http.StatusOK, graph)
}

// POST /v1/evidence/packs/:packID/verify
// Spec §7 — re-hash live DB entries and compare against stored Merkle root.
func (h *ProofHandler) VerifyPack(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	checkedAt := time.Now().UTC()

	// -------- Level 1: DB / Merkle self-consistency --------
	// Proves the current database rows reproduce the root currently stored in
	// the database. On its own this does NOT prove the archive is intact, the
	// signature is valid, or that Service 2/5 haven't replaced a stored hash —
	// see Level 3 below for an independent check.
	computed := services.RecomputeMerkleRoot(pack)
	stored := pack.MerkleRoot
	merklePassed := computed == stored

	// -------- Level 3: encrypted archive verification --------
	// Previously only invoked during dispute export (P1-02) — a pack could
	// show VERIFIED here even if its archived object was modified, undecryptable,
	// or diverged from the sealed manifest. Wiring it into /verify closes that gap.
	archiveStatus := "PASSED"
	archiveExplanation := ""
	if archiveErr := h.svc.VerifyArchiveForPack(c.Request.Context(), packID); archiveErr != nil {
		archiveExplanation = archiveErr.Error()
		if errors.Is(archiveErr, services.ErrArchiveNotAvailable) {
			archiveStatus = "NOT_AVAILABLE"
		} else {
			archiveStatus = "FAILED"
		}
	}

	resp := models.VerifyResponse{
		EvidencePackID:     packID,
		CheckedAt:          checkedAt,
		StoredRoot:         stored,
		ComputedRoot:       computed,
		DBMerkleStatus:     statusLabel(merklePassed),
		ArchiveStatus:      archiveStatus,
		ArchiveExplanation: archiveExplanation,
	}

	// Overall status is only VERIFIED when both independent layers pass —
	// this is the actual point of adding Level 3: a pack that's internally
	// self-consistent but whose archive is corrupted must not read as VERIFIED.
	httpStatus := http.StatusOK
	switch {
	case !merklePassed:
		log.Printf("[ALERT] proof.verify CORRUPTED pack=%s stored_root=%s computed_root=%s — evidence pack has decoupled from its original anchor root",
			packID, stored, computed)
		resp.Status = "CORRUPTED"
		resp.Explanation = "ALERT: live database leaf hashes do not reproduce the original Merkle root. Evidence pack has decoupled from its anchor root. Immediate investigation required."
		httpStatus = http.StatusUnprocessableEntity

	case archiveStatus == "FAILED":
		log.Printf("[ALERT] proof.verify ARCHIVE_UNVERIFIED pack=%s err=%v — archive has decoupled from its sealed manifest",
			packID, archiveExplanation)
		resp.Status = "ARCHIVE_UNVERIFIED"
		resp.Explanation = "ALERT: database and Merkle root are internally consistent, but the independently stored encrypted archive failed verification: " + archiveExplanation
		httpStatus = http.StatusUnprocessableEntity

	case archiveStatus == "NOT_AVAILABLE":
		resp.Status = "INTERNALLY_CONSISTENT"
		resp.Explanation = "Database and Merkle root are internally consistent. Archive verification was not available for this pack (" + archiveExplanation + "), so this is not full dispute-ready proof."

	default:
		resp.Status = "VERIFIED"
		resp.Explanation = "Merkle root reproduced from live database entries, and the independently stored encrypted archive verified successfully (ciphertext, decryption, and plaintext manifest all match)."
	}

	// Overall correctness — never mark verified=true unless every layer we
	// actually checked passed.
	overallOK := resp.Status == "VERIFIED"
	if markErr := h.enrichRepo.MarkVerified(c.Request.Context(), packID, overallOK, checkedAt); markErr != nil {
		log.Printf("proof.verify: mark_verified failed pack=%s err=%v", packID, markErr)
	}

	c.JSON(httpStatus, resp)
}

func statusLabel(passed bool) string {
	if passed {
		return "PASSED"
	}
	return "FAILED"
}

// GET /v1/dispute/export/preview
// Returns the structured JSON view for a given export_type without producing a file.
// Query params: export_type, payment_reference (or evidence_pack_id), tenant_id.
func (h *ProofHandler) ExportPreview(c *gin.Context) {
	req := models.DisputeExportRequest{
		ExportType:       strings.ToUpper(c.Query("export_type")),
		PaymentReference: c.Query("payment_reference"),
		TenantID:         c.Query("tenant_id"),
		EvidencePackID:   c.Query("evidence_pack_id"),
		DisputeReason:    c.Query("dispute_reason"),
	}

	if req.ExportType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "export_type query param is required"})
		return
	}
	if req.ExportType == models.ExportTypeRawJSON {
		c.JSON(http.StatusForbidden, gin.H{"error": "RAW_JSON does not support preview"})
		return
	}
	if req.TenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id query param is required"})
		return
	}

	var pack *models.EvidencePack
	var err error

	if req.EvidencePackID != "" {
		pack, err = h.svc.GetPack(c.Request.Context(), req.EvidencePackID)
	} else if req.PaymentReference != "" {
		resp, listErr := h.svc.ListPacksByIntentID(c.Request.Context(), req.TenantID, req.PaymentReference)
		if listErr != nil || len(resp.Packs) == 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"error":             "no evidence pack found for payment_reference",
				"payment_reference": req.PaymentReference,
			})
			return
		}
		activeID := ""
		for _, p := range resp.Packs {
			if strings.ToUpper(p.PackStatus) == "ACTIVE" {
				activeID = p.EvidencePackID
				break
			}
		}
		if activeID == "" {
			activeID = resp.Packs[0].EvidencePackID
		}
		pack, err = h.svc.GetPack(c.Request.Context(), activeID)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "either evidence_pack_id or payment_reference query param is required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "evidence pack not found: " + err.Error()})
		return
	}

	preview, err := services.BuildExportPreview(pack, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, preview)
}

// GET /v1/evidence/packs/:packID/exports
// P2-02 admin/ops: list who exported this pack, when, and with which file hash.
func (h *ProofHandler) ListPackExports(c *gin.Context) {
	if c.GetHeader("X-Admin-Token") == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "listing exports requires X-Admin-Token header"})
		return
	}

	packID := c.Param("packID")
	resp, err := h.svc.ListPackExports(c.Request.Context(), packID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": "evidence pack not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// POST /v1/dispute/export
// Spec §6 — multi-tier dispute export engine.
func (h *ProofHandler) DisputeExport(c *gin.Context) {
	var req models.DisputeExportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Override or set ExportType from query parameter if provided
	if qType := c.Query("export_type"); qType != "" {
		req.ExportType = strings.ToUpper(qType)
	}

	if req.ExportType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "export_type is required (as query param or in JSON body)"})
		return
	}

	// RAW_JSON requires admin token — spec §8 admin-permission gate
	if req.ExportType == models.ExportTypeRawJSON {
		if c.GetHeader("X-Admin-Token") == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "RAW_JSON export requires X-Admin-Token header"})
			return
		}
	}

	// Resolve pack: prefer explicit evidence_pack_id, else look up by payment_reference
	var pack *models.EvidencePack
	var err error

	if req.EvidencePackID != "" {
		pack, err = h.svc.GetPack(c.Request.Context(), req.EvidencePackID)
	} else {
		resp, listErr := h.svc.ListPacksByIntentID(c.Request.Context(), req.TenantID, req.PaymentReference)
		if listErr != nil || len(resp.Packs) == 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"error":             "no evidence pack found for payment_reference",
				"payment_reference": req.PaymentReference,
			})
			return
		}
		activeID := ""
		for _, p := range resp.Packs {
			if strings.ToUpper(p.PackStatus) == "ACTIVE" {
				activeID = p.EvidencePackID
				break
			}
		}
		if activeID == "" {
			activeID = resp.Packs[0].EvidencePackID
		}
		pack, err = h.svc.GetPack(c.Request.Context(), activeID)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "evidence pack not found: " + err.Error()})
		return
	}

	result, err := h.svc.BuildDisputeExport(c.Request.Context(), req, pack, h.db)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported export_type") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, services.ErrArchiveVerificationFailed) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error":            err.Error(),
				"evidence_pack_id": pack.EvidencePackID,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", `attachment; filename="`+result.Filename+`"`)
	c.Header("X-Evidence-Export-ID", result.ExportID)
	c.Header("X-Payload-Hash", result.PayloadHash)
	c.Data(http.StatusOK, result.ContentType, result.Payload)
}
