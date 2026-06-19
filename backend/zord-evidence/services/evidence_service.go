package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"strings"
	"time"
	"zord-evidence/kafka"
	"zord-evidence/models"
	"zord-evidence/repositories"
	"zord-evidence/storage"
	"zord-evidence/utils"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// validModes are the three lifecycle operating modes defined in spec §3.2
var validModes = []string{"INTELLIGENCE_ATTACH", "SECONDARY_DISPATCH", "FULL_CONTROL"}

type EvidenceService struct {
	repo                *repositories.EvidenceRepository
	pendingLeafRepo     repositories.PendingLeafRepository
	enrichRepo          *repositories.EnrichmentRepository
	s3                  storage.S3Store
	signer              *Signer
	archiveCrypto       *ArchiveCrypto
	archivePrefix       string
	replayCompareStrict bool
	publisher           kafka.EventPublisher
}

func NewEvidenceService(
	repo *repositories.EvidenceRepository,
	pendingLeafRepo repositories.PendingLeafRepository,
	enrichRepo *repositories.EnrichmentRepository,
	s3 storage.S3Store,
	signer *Signer,
	archiveCrypto *ArchiveCrypto,
	archivePrefix string,
	strict bool,
	publisher kafka.EventPublisher,
) *EvidenceService {
	return &EvidenceService{
		repo:                repo,
		pendingLeafRepo:     pendingLeafRepo,
		enrichRepo:          enrichRepo,
		s3:                  s3,
		signer:              signer,
		archiveCrypto:       archiveCrypto,
		archivePrefix:       archivePrefix,
		replayCompareStrict: strict,
		publisher:           publisher,
	}
}

// HandleLeafUpdate orchestrates the buffered leaf ingestion and pack generation.
func (s *EvidenceService) HandleLeafUpdate(ctx context.Context, tenantID, envelopeID, intentID, contractID, traceID string, newLeaves []models.PendingLeafCandidate) error {
	// 0. If intentID is missing but envelopeID is present, try to resolve it from existing leaves
	if intentID == "" && envelopeID != "" {
		resolved, err := s.pendingLeafRepo.ResolveIntentID(ctx, tenantID, envelopeID)
		if err != nil {
			log.Printf("evidence.service.resolve_intent_failed env=%s err=%v", envelopeID, err)
		} else if resolved != "" {
			intentID = resolved
			// Update the new leaves to have the resolved intentID
			for i := range newLeaves {
				newLeaves[i].IntentID = &intentID
			}
		}
	}

	// 1. Link logic (if we just got an intentID, link any buffered envelope_id leaves)
	if intentID != "" && envelopeID != "" {
		if err := s.pendingLeafRepo.LinkEnvelopeToIntent(ctx, tenantID, envelopeID, intentID, contractID); err != nil {
			return err
		}
	}

	// 2. Upsert new leaves
	var lastBatchID string
	for i := range newLeaves {
		if err := s.pendingLeafRepo.UpsertLeaf(ctx, &newLeaves[i]); err != nil {
			return err
		}
		if newLeaves[i].ClientBatchID != nil && *newLeaves[i].ClientBatchID != "" {
			lastBatchID = *newLeaves[i].ClientBatchID
		}
	}

	// 2b. If we received leaves carrying a batchID, also trigger batch-level readiness check
	if lastBatchID != "" {
		_ = s.HandleBatchLeafUpdate(ctx, tenantID, lastBatchID, nil, false)
	}

	// 3. Check readiness if we have an intentID
	if intentID == "" {
		return nil
	}

	leaves, err := s.pendingLeafRepo.GetLeavesForIntent(ctx, tenantID, intentID)
	if err != nil {
		return err
	}

	// 4. Map leaf types to items
	leafMap := make(map[string]models.PendingLeafCandidate)
	for _, l := range leaves {
		leafMap[l.LeafType] = l
	}

	// 5. Check if all 8 required external leaves are present
	allPresent := true
	var items []models.EvidenceItem
	var missing []string
	for _, requiredType := range models.RequiredLeafTypes {
		if l, ok := leafMap[requiredType]; ok {
			items = append(items, models.EvidenceItem{
				Type:          l.LeafType,
				Ref:           l.ItemRef,
				Hash:          l.Hash,
				SchemaVersion: l.SchemaVersion,
			})
		} else if requiredType == models.LeafTypeVarianceDecision {
			// Special case: VARIANCE_DECISION is required but can be synthesized if missing
			items = append(items, models.EvidenceItem{
				Type:          models.LeafTypeVarianceDecision,
				Ref:           intentID, // Fallback to intentID if missing
				Hash:          models.ZeroVarianceHash,
				SchemaVersion: "v1",
			})
			log.Printf("evidence.service.readiness_check intent=%s VARIANCE_DECISION missing — using ZeroVarianceHash", intentID)
		} else {
			allPresent = false
			missing = append(missing, requiredType)
		}
	}

	if !allPresent {
		log.Printf("evidence.service.readiness_check intent=%s missing_leaves=%v present_count=%d", intentID, missing, len(items))
		return nil // Not ready yet
	}

	// 5b. Resolve contractID from buffered leaves if missing in argument
	if contractID == "" {
		for _, l := range leaves {
			if l.ContractID != nil && *l.ContractID != "" {
				contractID = *l.ContractID
				break
			}
		}
	}

	// 5b.1 Resolve batchID from buffered leaves — intent leaves now carry the
	// originating batch_id so the persisted pack can be queried by batch.
	var batchID string
	for _, l := range leaves {
		if l.ClientBatchID != nil && *l.ClientBatchID != "" {
			batchID = *l.ClientBatchID
			break
		}
	}

	// 5c. Defensive: ensure we have a traceID (even if hardcoded here) to satisfy NOT NULL constraints.
	if traceID == "" {
		traceID = "00000000-0000-0000-0000-000000000000"
		log.Printf("evidence.service.readiness_check intent=%s trace_id missing — using zero UUID fallback", intentID)
	}

	log.Printf("evidence.service.readiness_check intent=%s ALL_LEAVES_PRESENT — triggering generation", intentID)

	// 5d. Extract traceability metadata from leaves
	var pir, cic *time.Time
	var mpu, gd *string
	var rfs, ts *bool
	var srr, csc *time.Time
	var br, cr, ad *string
	var mc *float64
	var vdc, am *bool

	var clientPayoutRef *string
	var amount decimal.Decimal
	var currency string

	for _, l := range leaves {
		if l.ClientPayoutRef != nil {
			clientPayoutRef = l.ClientPayoutRef
			amount = l.Amount
			currency = l.Currency
		}
		if l.PaymentInstructionReceived != nil {
			pir = l.PaymentInstructionReceived
			cic = l.CanonicalIntentCreated
			mpu = l.MappingProfileUsed
			rfs = l.RequiredFieldsStatus
			ts = l.TokenizationStatus
			gd = l.GovernanceDecision
		}
		if l.SettlementRecordReceived != nil {
			srr = l.SettlementRecordReceived
			csc = l.CanonicalSettlementCreated
			br = l.BankReference
			cr = l.ClientReference
			ad = l.AttachmentDecision
			mc = l.MatchConfidence
			vdc = l.ValueDateCheck
			am = l.AmountMatch
		}
	}

	// 6. Generate the pack!
	req := models.GenerateEvidenceRequest{
		TenantID:                   tenantID,
		IntentID:                   intentID,
		ClientBatchID:              batchID,
		EnvelopeID:                 envelopeID,
		TraceID:                    traceID,
		ContractID:                 contractID,
		Mode:                       "INTELLIGENCE_ATTACH",
		RulesetVersion:             "v1",
		SchemaVersions:             map[string]string{"intent_schema": "v1", "outcome_schema": "v1", "contract_schema": "v1", "attachment_schema": "v1"},
		Items:                      items,
		PaymentInstructionReceived: pir,
		CanonicalIntentCreated:     cic,
		MappingProfileUsed:         mpu,
		RequiredFieldsStatus:       rfs,
		TokenizationStatus:         ts,
		GovernanceDecision:         gd,

		SettlementRecordReceived:   srr,
		CanonicalSettlementCreated: csc,
		BankReference:              br,
		ClientReference:            cr,
		AttachmentDecision:         ad,
		MatchConfidence:            mc,
		ValueDateCheck:             vdc,
		AmountMatch:                am,

		ClientPayoutRef:            clientPayoutRef,
		Amount:                     amount,
		Currency:                   currency,
	}

	_, err = s.GeneratePack(ctx, req)
	if err != nil {
		return fmt.Errorf("generate pack from buffered leaves: %w", err)
	}

	// 7. Cleanup
	return s.pendingLeafRepo.DeleteForIntent(ctx, tenantID, intentID)
}

// HandleBatchLeafUpdate orchestrates buffered leaf ingestion and pack generation for batches.
func (s *EvidenceService) HandleBatchLeafUpdate(ctx context.Context, tenantID, batchID string, newLeaves []models.PendingLeafCandidate, isFinal bool) error {
	// 1. Upsert new leaves
	for i := range newLeaves {
		if err := s.pendingLeafRepo.UpsertLeaf(ctx, &newLeaves[i]); err != nil {
			return err
		}
	}

	if !isFinal {
		log.Printf("evidence.service.handle_batch_update batch=%s buffering leaves", batchID)
	}

	// 2. Check readiness
	leaves, err := s.pendingLeafRepo.GetLeavesForBatch(ctx, tenantID, batchID)
	if err != nil {
		return err
	}

	leafMap := make(map[string]models.PendingLeafCandidate)
	for _, l := range leaves {
		leafMap[l.LeafType] = l
	}

	allPresent := true
	var items []models.EvidenceItem
	var missing []string
	for _, requiredType := range models.RequiredBatchLeafTypes {
		if l, ok := leafMap[requiredType]; ok {
			items = append(items, models.EvidenceItem{
				Type:          l.LeafType,
				Ref:           l.ItemRef,
				Hash:          l.Hash,
				SchemaVersion: l.SchemaVersion,
			})
		} else {
			allPresent = false
			missing = append(missing, requiredType)
		}
	}

	if !allPresent {
		log.Printf("evidence.service.batch_readiness_check batch=%s missing_leaves=%v present_count=%d", batchID, missing, len(items))
		return nil // Not ready yet
	}

	// 3. Check if we already have a pack for this batch to prevent duplicate generation
	existing, err := s.repo.GetPackByBatchID(ctx, tenantID, batchID)
	if err == nil && existing != nil {
		log.Printf("evidence.service.batch_readiness_check batch=%s pack already exists — skipping generation", batchID)
		// Cleanup anyway as leaves are no longer needed
		return s.pendingLeafRepo.DeleteForBatch(ctx, tenantID, batchID)
	}

	// We only generate if all leaves are present AND we have received the final completion signal.
	if !isFinal {
		// Check if we already have the summary (which indicates completion)
		if _, ok := leafMap[models.LeafTypeBatchAttachmentSummary]; !ok {
			log.Printf("evidence.service.batch_readiness_check batch=%s leaves ready but waiting for final signal", batchID)
			return nil
		}
	}

	log.Printf("evidence.service.batch_readiness_check batch=%s ALL_LEAVES_PRESENT — triggering generation", batchID)

	// Extract traceability metadata from leaves
	var pir, cic *time.Time
	var mpu, gd *string
	var rfs, ts *bool
	var srr, csc *time.Time
	var br, cr, ad *string
	var mc *float64
	var vdc, am *bool

	var clientPayoutRef *string
	var amount decimal.Decimal
	var currency string

	for _, l := range leaves {
		if l.ClientPayoutRef != nil {
			clientPayoutRef = l.ClientPayoutRef
			amount = l.Amount
			currency = l.Currency
		}
		if l.PaymentInstructionReceived != nil {
			pir = l.PaymentInstructionReceived
			cic = l.CanonicalIntentCreated
			mpu = l.MappingProfileUsed
			rfs = l.RequiredFieldsStatus
			ts = l.TokenizationStatus
			gd = l.GovernanceDecision
		}
		if l.SettlementRecordReceived != nil {
			srr = l.SettlementRecordReceived
			csc = l.CanonicalSettlementCreated
			br = l.BankReference
			cr = l.ClientReference
			ad = l.AttachmentDecision
			mc = l.MatchConfidence
			vdc = l.ValueDateCheck
			am = l.AmountMatch
		}
	}

	// Generate the pack!
	req := models.GenerateEvidenceRequest{
		TenantID:                   tenantID,
		ClientBatchID:              batchID,
		TraceID:                    "00000000-0000-0000-0000-000000000000", // or fetch from context/leaf if available
		Mode:                       "BATCH_ATTACH",
		RulesetVersion:             "v1",
		SchemaVersions:             map[string]string{"intent_schema": "v1", "outcome_schema": "v1", "contract_schema": "v1", "attachment_schema": "v1"},
		Items:                      items,
		PaymentInstructionReceived: pir,
		CanonicalIntentCreated:     cic,
		MappingProfileUsed:         mpu,
		RequiredFieldsStatus:       rfs,
		TokenizationStatus:         ts,
		GovernanceDecision:         gd,

		SettlementRecordReceived:   srr,
		CanonicalSettlementCreated: csc,
		BankReference:              br,
		ClientReference:            cr,
		AttachmentDecision:         ad,
		MatchConfidence:            mc,
		ValueDateCheck:             vdc,
		AmountMatch:                am,

		ClientPayoutRef:            clientPayoutRef,
		Amount:                     amount,
		Currency:                   currency,
	}

	_, err = s.GenerateBatchPack(ctx, req)
	if err != nil {
		return fmt.Errorf("generate pack from buffered batch leaves: %w", err)
	}

	// Cleanup
	return s.pendingLeafRepo.DeleteForBatch(ctx, tenantID, batchID)
}

// GeneratePack is the core of Service 6 (spec §13 steps 1–11).
// evidence_pack_id is generated only here. All other IDs come from upstream.
func (s *EvidenceService) GeneratePack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
	// --- Step 2: validate scope ---
	if strings.TrimSpace(req.TenantID) == "" || strings.TrimSpace(req.IntentID) == "" {
		return nil, fmt.Errorf("tenant_id and intent_id are required")
	}
	if !slices.Contains(validModes, req.Mode) {
		return nil, fmt.Errorf("mode must be one of: %s", strings.Join(validModes, ", "))
	}
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("at least one evidence item is required")
	}

	now := time.Now().UTC()

	// --- Step (uuid): generate evidence_pack_id exclusively in this service ---
	packID := "ep_" + uuid.NewString()

	// --- Steps 5–6: compute typed leaf hashes, sort deterministically ---
	items := req.Items
	leaves := make([]utils.MerkleLeaf, 0, len(items)+1)
	for i := range items {
		// Spec §11.1: leaf_hash = SHA256(type || stable_ref || item_hash || version)
		stableHash := strings.TrimSpace(items[i].Hash)
		leafInput := strings.Join([]string{items[i].Type, items[i].Ref, stableHash, items[i].SchemaVersion}, "||")
		items[i].LeafHash = utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: items[i].LeafHash})
	}

	// --- Step 7: build Interim Merkle tree ---
	interimMerkleRoot := utils.BuildMerkleRoot(leaves)

	// --- Step 7.5: Auto-append FINAL_EVIDENCE_VIEW ---
	// Hash = SHA256(evidence_pack_id | interim_merkle_root)
	leafAutoInput := packID + "|" + interimMerkleRoot
	leafAutoHash := utils.SHA256Hex(leafAutoInput)

	leafAuto := models.EvidenceItem{
		Type:          models.LeafTypeFinalEvidenceView,
		Ref:           packID,
		Hash:          leafAutoHash,
		SchemaVersion: "v1",
	}

	// Final leaf hash for auto-added leaf
	leafAutoFinalInput := strings.Join([]string{leafAuto.Type, leafAuto.Ref, leafAuto.Hash, leafAuto.SchemaVersion}, "||")
	leafAuto.LeafHash = utils.SHA256Hex(leafAutoFinalInput)

	items = append(items, leafAuto)
	leaves = append(leaves, utils.MerkleLeaf{Index: len(items) - 1, LeafHash: leafAuto.LeafHash})

	// --- Step 8: build Final Merkle tree ---
	merkleRoot := utils.BuildMerkleRoot(leaves)

	// --- Step 9: sign the pack commitment ---
	// Spec §9.10: signature binds evidence_pack_id, merkle_root, intent_id, contract_id, created_at, ruleset_version
	signPayload := strings.Join([]string{
		packID, merkleRoot, req.IntentID, req.ContractID, now.Format(time.RFC3339Nano), req.RulesetVersion,
	}, "|")
	sig := s.signer.Sign(signPayload)

	pack := &models.EvidencePack{
		EvidencePackID:   packID,
		TenantID:         req.TenantID,
		IntentID:         req.IntentID,
		ContractID:       req.ContractID,
		ClientBatchID:    req.ClientBatchID,
		Mode:             req.Mode,
		PackStatus:       "ACTIVE",
		Items:            items,
		MerkleRoot:       merkleRoot,
		RulesetVersion:   req.RulesetVersion,
		SchemaVersions:   req.SchemaVersions,
		SupersedesPackID: req.SupersedesPackID,
		Signatures: []models.Signature{{
			Signer:   "zord_evidence",
			Alg:      "ed25519",
			Sig:      sig,
			SignedAt: now,
		}},
		ZordSignature:              sig,
		PaymentInstructionReceived: req.PaymentInstructionReceived,
		CanonicalIntentCreated:     req.CanonicalIntentCreated,
		MappingProfileUsed:         req.MappingProfileUsed,
		RequiredFieldsStatus:       req.RequiredFieldsStatus,
		TokenizationStatus:         req.TokenizationStatus,
		GovernanceDecision:         req.GovernanceDecision,

		SettlementRecordReceived:   req.SettlementRecordReceived,
		CanonicalSettlementCreated: req.CanonicalSettlementCreated,
		BankReference:              req.BankReference,
		ClientReference:            req.ClientReference,
		AttachmentDecision:         req.AttachmentDecision,
		MatchConfidence:            req.MatchConfidence,
		ValueDateCheck:             req.ValueDateCheck,
		AmountMatch:                req.AmountMatch,

		ClientPayoutRef:            req.ClientPayoutRef,
		Amount:                     req.Amount,
		Currency:                   req.Currency,

		CreatedAt: now,
	}

	pack.ComputeCompletenessMetadata()

	// --- Step 10a: encrypt and store archive body (§14.3 / §15.2) ---
	archive, err := json.Marshal(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(archive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}

	// Object key uses intent_id as primary path anchor (contract_id may be absent in pivot mode)
	anchorID := req.IntentID
	if req.ContractID != "" {
		anchorID = req.ContractID
	}
	objectKey := fmt.Sprintf("%s/%s/%s/%s.json.enc", s.archivePrefix, req.TenantID, anchorID, packID)
	objectRef, err := s.s3.PutObject(ctx, objectKey, encryptedArchive)
	if err != nil {
		return nil, fmt.Errorf("store archive: %w", err)
	}

	// --- Step 10b: persist metadata and outbox event to Postgres ---
	log.Printf("evidence.service.generate_pack saving metadata and outbox event pack=%s intent=%s", packID, req.IntentID)

	// --- Persist §14.3 archive metadata row ---
	archiveHash := sha256Hex(encryptedArchive)
	archiveRecord := &models.EvidenceArchive{
		ArchiveID:      "arc_" + uuid.NewString(),
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		ObjectRef:      objectRef,
		ArchiveHash:    archiveHash,
		ArchiveVersion: "v1",
		CreatedAt:      now,
	}
	if err := s.repo.SaveArchive(ctx, archiveRecord); err != nil {
		fmt.Printf("warn: save archive record failed: %v\n", err)
	}

	// --- Persist §14.4 inclusion proofs ---
	proofPaths := utils.BuildInclusionProofs(leaves)
	inclusionProofs := make([]models.InclusionProof, 0, len(leaves))
	for _, leaf := range leaves {
		inclusionProofs = append(inclusionProofs, models.InclusionProof{
			EvidencePackID: packID,
			LeafHash:       leaf.LeafHash,
			ProofPath:      proofPaths[leaf.LeafHash],
			CreatedAt:      now,
		})
	}
	if err := s.repo.SaveInclusionProofs(ctx, packID, inclusionProofs); err != nil {
		fmt.Printf("warn: save inclusion proofs failed: %v\n", err)
	}

	// --- Mark old pack superseded if this is a lifecycle version update (§23 Phase 5) ---
	if req.SupersedesPackID != "" {
		if err := s.repo.MarkPackSuperseded(ctx, req.SupersedesPackID, packID); err != nil {
			fmt.Printf("warn: mark superseded pack failed: %v\n", err)
		}
	}

	// --- Compute Completeness Metadata for Event ---
	hasRawSettlementFile := false
	hasRawSettlementLine := false
	hasCanonicalSettlementObs := false
	hasAttachmentDecision := false
	hasVarianceDecision := false
	hasBatchAttachmentSummary := false
	hasBatchVarianceSummary := false

	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeRawSettlementFile:
			hasRawSettlementFile = true
		case models.LeafTypeRawSettlementLine:
			hasRawSettlementLine = true
		case models.LeafTypeCanonicalSettlementObservation:
			hasCanonicalSettlementObs = true
		case models.LeafTypeAttachmentDecision:
			hasAttachmentDecision = true
		case models.LeafTypeVarianceDecision:
			hasVarianceDecision = true
		case models.LeafTypeBatchAttachmentSummary:
			hasBatchAttachmentSummary = true
		case models.LeafTypeBatchVarianceSummary:
			hasBatchVarianceSummary = true
		}
	}

	leafCount := len(pack.Items)
	var requiredLeafCount int
	var settlementLeafFlag, attachmentDecisionLeafFlag bool

	if req.IntentID != "" {
		requiredLeafCount = 9
		settlementLeafFlag = hasRawSettlementFile && hasRawSettlementLine && hasCanonicalSettlementObs
		attachmentDecisionLeafFlag = hasAttachmentDecision && hasVarianceDecision
	} else if req.ClientBatchID != "" {
		requiredLeafCount = 6
		settlementLeafFlag = hasRawSettlementFile
		attachmentDecisionLeafFlag = hasBatchAttachmentSummary && hasBatchVarianceSummary
	}

	var packCompletenessScore float64
	if requiredLeafCount > 0 {
		packCompletenessScore = float64(leafCount) / float64(requiredLeafCount)
		if packCompletenessScore > 1.0 {
			packCompletenessScore = 1.0
		}
	}

	// --- Step 11: prepare outbox event for relay polling ---
	eventType := kafka.EventPackCreated
	if req.SupersedesPackID != "" {
		eventType = kafka.EventPackReversalSupersed
	}

	packEvent := kafka.PackEvent{
		EventType:                         eventType,
		EvidencePackID:                    packID,
		TenantID:                          req.TenantID,
		IntentID:                          req.IntentID,
		ContractID:                        req.ContractID,
		Mode:                              req.Mode,
		MerkleRoot:                        merkleRoot,
		RulesetVersion:                    req.RulesetVersion,
		OccurredAt:                        now,
		PackCompletenessScore:             packCompletenessScore,
		LeafCount:                         leafCount,
		RequiredLeafCount:                 requiredLeafCount,
		SettlementLeafPresentFlag:         settlementLeafFlag,
		AttachmentDecisionLeafPresentFlag: attachmentDecisionLeafFlag,
	}
	payloadBytes, _ := json.Marshal(packEvent)

	outboxEvt := &models.OutboxEvent{
		TraceID:       req.TraceID,
		EnvelopeID:    req.EnvelopeID,
		TenantID:      req.TenantID,
		ContractID:    req.ContractID,
		AggregateType: "evidence_pack",
		AggregateID:   req.IntentID,
		EventType:     eventType,
		Payload:       payloadBytes,
		Status:        "PENDING",
		CreatedAt:     now,
	}

	if err := s.repo.SavePack(ctx, pack, objectRef, outboxEvt); err != nil {
		log.Printf("evidence.service.generate_pack save_failed pack=%s err=%v", packID, err)
		return nil, fmt.Errorf("save pack metadata: %w", err)
	}
	log.Printf("evidence.service.generate_pack save_ok pack=%s", packID)

	// Persist proof enrichment columns (status, score, components, signatures) immediately.
	// This ensures proof_status, proof_score, and proof_components_json are never stale.
	s.writeProofEnrichment(ctx, pack)

	return pack, nil
}

// GenerateBatchPack generates an evidence pack bound to a batch.
func (s *EvidenceService) GenerateBatchPack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
	if strings.TrimSpace(req.TenantID) == "" || strings.TrimSpace(req.ClientBatchID) == "" {
		return nil, fmt.Errorf("tenant_id and batch_id are required")
	}
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("at least one evidence item is required")
	}

	now := time.Now().UTC()
	packID := "bep_" + uuid.NewString()

	items := req.Items
	leaves := make([]utils.MerkleLeaf, 0, len(items)+1)
	for i := range items {
		stableHash := strings.TrimSpace(items[i].Hash)
		leafInput := strings.Join([]string{items[i].Type, items[i].Ref, stableHash, items[i].SchemaVersion}, "||")
		items[i].LeafHash = utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: items[i].LeafHash})
	}

	interimMerkleRoot := utils.BuildMerkleRoot(leaves)

	leafAutoInput := packID + "|" + interimMerkleRoot
	leafAutoHash := utils.SHA256Hex(leafAutoInput)

	leafAuto := models.EvidenceItem{
		Type:          models.LeafTypeFinalEvidenceView,
		Ref:           packID,
		Hash:          leafAutoHash,
		SchemaVersion: "v1",
	}

	leafAutoFinalInput := strings.Join([]string{leafAuto.Type, leafAuto.Ref, leafAuto.Hash, leafAuto.SchemaVersion}, "||")
	leafAuto.LeafHash = utils.SHA256Hex(leafAutoFinalInput)

	items = append(items, leafAuto)
	leaves = append(leaves, utils.MerkleLeaf{Index: len(items) - 1, LeafHash: leafAuto.LeafHash})

	merkleRoot := utils.BuildMerkleRoot(leaves)

	signPayload := strings.Join([]string{
		packID, merkleRoot, req.ClientBatchID, now.Format(time.RFC3339Nano), req.RulesetVersion,
	}, "|")
	sig := s.signer.Sign(signPayload)

	pack := &models.EvidencePack{
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		ClientBatchID:  req.ClientBatchID,
		Mode:           req.Mode,
		PackStatus:     "ACTIVE",
		Items:          items,
		MerkleRoot:     merkleRoot,
		RulesetVersion: req.RulesetVersion,
		SchemaVersions: req.SchemaVersions,
		Signatures: []models.Signature{{
			Signer:   "zord_evidence",
			Alg:      "ed25519",
			Sig:      sig,
			SignedAt: now,
		}},
		ZordSignature:   sig,
		ClientPayoutRef: req.ClientPayoutRef,
		Amount:          req.Amount,
		Currency:        req.Currency,
		CreatedAt:       now,
	}

	pack.ComputeCompletenessMetadata()

	archive, err := json.Marshal(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(archive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}

	objectKey := fmt.Sprintf("%s/%s/batch/%s/%s.json.enc", s.archivePrefix, req.TenantID, req.ClientBatchID, packID)
	objectRef, err := s.s3.PutObject(ctx, objectKey, encryptedArchive)
	if err != nil {
		return nil, fmt.Errorf("store archive: %w", err)
	}

	log.Printf("evidence.service.generate_batch_pack saving metadata and outbox event pack=%s batch=%s", packID, req.ClientBatchID)

	archiveHash := sha256Hex(encryptedArchive)
	archiveRecord := &models.EvidenceArchive{
		ArchiveID:      "arc_" + uuid.NewString(),
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		ObjectRef:      objectRef,
		ArchiveHash:    archiveHash,
		ArchiveVersion: "v1",
		CreatedAt:      now,
	}
	if err := s.repo.SaveArchive(ctx, archiveRecord); err != nil {
		fmt.Printf("warn: save archive record failed: %v\n", err)
	}

	proofPaths := utils.BuildInclusionProofs(leaves)
	inclusionProofs := make([]models.InclusionProof, 0, len(leaves))
	for _, leaf := range leaves {
		inclusionProofs = append(inclusionProofs, models.InclusionProof{
			EvidencePackID: packID,
			LeafHash:       leaf.LeafHash,
			ProofPath:      proofPaths[leaf.LeafHash],
			CreatedAt:      now,
		})
	}
	if err := s.repo.SaveInclusionProofs(ctx, packID, inclusionProofs); err != nil {
		fmt.Printf("warn: save inclusion proofs failed: %v\n", err)
	}

	packEvent := kafka.PackEvent{
		EventType:      kafka.EventPackCreated,
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		Mode:           req.Mode,
		MerkleRoot:     merkleRoot,
		RulesetVersion: req.RulesetVersion,
		OccurredAt:     now,
		Extra: map[string]any{
			"batch_id": req.ClientBatchID,
		},
	}
	payloadBytes, _ := json.Marshal(packEvent)

	outboxEvt := &models.OutboxEvent{
		TraceID:       req.TraceID,
		TenantID:      req.TenantID,
		AggregateType: "evidence_pack",
		AggregateID:   req.ClientBatchID, // using batchID as the aggregate_id since it's a batch pack
		EventType:     "evidence.batch.pack.created",
		Payload:       payloadBytes,
		Status:        "PENDING",
		CreatedAt:     now,
	}

	if err := s.repo.SavePack(ctx, pack, objectRef, outboxEvt); err != nil {
		log.Printf("evidence.service.generate_batch_pack save_failed pack=%s err=%v", packID, err)
		return nil, fmt.Errorf("save batch pack metadata: %w", err)
	}
	log.Printf("evidence.service.generate_batch_pack save_ok pack=%s", packID)

	// Persist proof enrichment columns immediately after batch pack generation.
	s.writeProofEnrichment(ctx, pack)

	return pack, nil
}

// GetPack fetches an evidence pack by ID.
func (s *EvidenceService) GetPack(ctx context.Context, packID string) (*models.EvidencePack, error) {
	pack, _, err := s.repo.GetPackByID(ctx, packID)
	if err != nil {
		return nil, err
	}
	return pack, nil
}

// ListPacksByIntentID returns all packs for a given intent (spec §17).
func (s *EvidenceService) ListPacksByIntentID(ctx context.Context, tenantID, intentID string) (*models.ListPacksResponse, error) {
	packs, err := s.repo.ListByIntentID(ctx, tenantID, intentID)
	if err != nil {
		return nil, err
	}
	return &models.ListPacksResponse{Packs: packs, Total: len(packs)}, nil
}

// ListPacksByBatchID returns all packs for a given batch.
func (s *EvidenceService) ListPacksByBatchID(ctx context.Context, tenantID, clientBatchID string) (*models.ListPacksResponse, error) {
	packs, err := s.repo.ListByBatchID(ctx, tenantID, clientBatchID)
	if err != nil {
		return nil, err
	}
	return &models.ListPacksResponse{Packs: packs, Total: len(packs)}, nil
}

func (s *EvidenceService) GetPackForBatch(ctx context.Context, tenantID, clientBatchID string) (*models.EvidencePack, error) {
	pack, err := s.repo.GetPackByBatchID(ctx, tenantID, clientBatchID)
	if err != nil {
		return nil, err
	}
	pack.ComputeCompletenessMetadata()
	return pack, nil
}

func (s *EvidenceService) ListIntentPacksByBatchID(ctx context.Context, tenantID, clientBatchID string) (*models.ListPacksResponse, error) {
	packs, err := s.repo.ListIntentPacksByBatchID(ctx, tenantID, clientBatchID)
	if err != nil {
		return nil, err
	}
	return &models.ListPacksResponse{Packs: packs, Total: len(packs)}, nil
}

// GetInclusionProofs returns all Merkle inclusion proofs for a pack (§14.4).
func (s *EvidenceService) GetInclusionProofs(ctx context.Context, packID string) ([]models.InclusionProof, error) {
	return s.repo.GetInclusionProofs(ctx, packID)
}

// ReplayPack implements §17 replay: rebuild the pack and compare Merkle roots.
// A §14.5 replay job is created and tracked through PENDING → COMPLETED.
func (s *EvidenceService) ReplayPack(ctx context.Context, req models.ReplayRequest) (*models.ReplayResponse, error) {
	now := time.Now().UTC()
	jobID := "rj_" + uuid.NewString()

	// --- Create replay job in PENDING state ---
	job := &models.ReplayJob{
		ReplayJobID:          jobID,
		TenantID:             req.TenantID,
		SourceEvidencePackID: req.OriginalPackID,
		IntentID:             req.IntentID,
		ContractID:           req.ContractID,
		RulesetVersion:       req.RulesetVersion,
		MappingVersions:      req.MappingVersions,
		RequestedBy:          req.RequestedBy,
		Status:               "PENDING",
		CreatedAt:            now,
	}
	if err := s.repo.CreateReplayJob(ctx, job); err != nil {
		return nil, fmt.Errorf("create replay job: %w", err)
	}

	oldPack, err := s.GetPack(ctx, req.OriginalPackID)
	if err != nil {
		return nil, fmt.Errorf("fetch original pack: %w", err)
	}

	newPack, err := s.GeneratePack(ctx, models.GenerateEvidenceRequest{
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		// Preserve the original pack's batch lineage on the replay so the new
		// pack remains queryable via GET /v1/evidence/packs?batch_id=.
		ClientBatchID:  oldPack.ClientBatchID,
		Mode:           req.Mode,
		RulesetVersion: req.RulesetVersion,
		SchemaVersions: req.SchemaVersions,
		Items:          req.Items,
	})
	if err != nil {
		return nil, err
	}

	equivalent := oldPack.MerkleRoot == newPack.MerkleRoot
	explanation := "same-root: Merkle root reproduced exactly"
	comparison := "strict-root-match"
	diffSummary := map[string]any{}

	if !equivalent {
		explanation = "merkle-root-different: inputs, version pins, or artifact hashes have changed"
		diffSummary["old_root"] = oldPack.MerkleRoot
		diffSummary["new_root"] = newPack.MerkleRoot
		diffSummary["old_leaf_count"] = len(oldPack.Items)
		diffSummary["new_leaf_count"] = len(newPack.Items)
		if !s.replayCompareStrict {
			comparison = "loose-mode-enabled"
		}
	}

	equivalenceResult := "EQUIVALENT"
	if !equivalent {
		equivalenceResult = "DIFFERENT"
	}

	// --- Complete the replay job ---
	_ = s.repo.CompleteReplayJob(ctx, jobID, newPack.EvidencePackID, equivalenceResult, diffSummary)

	// --- Publish evidence.pack.replayed event ---
	_ = s.publisher.Publish(ctx, kafka.PackEvent{
		EventType:      kafka.EventPackReplayed,
		EvidencePackID: newPack.EvidencePackID,
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		Mode:           req.Mode,
		MerkleRoot:     newPack.MerkleRoot,
		RulesetVersion: req.RulesetVersion,
		OccurredAt:     time.Now().UTC(),
		Extra: map[string]any{
			"replay_job_id":      jobID,
			"equivalence_result": equivalenceResult,
			"original_pack_id":   req.OriginalPackID,
		},
	})

	return &models.ReplayResponse{
		ReplayJobID:      jobID,
		NewPackID:        newPack.EvidencePackID,
		Equivalent:       equivalent,
		OldMerkleRoot:    oldPack.MerkleRoot,
		NewMerkleRoot:    newPack.MerkleRoot,
		Explanation:      explanation,
		RulesetVersion:   req.RulesetVersion,
		ReplayComparison: comparison,
	}, nil
}

// GetPackView returns a role-specific projection of the canonical pack (spec §18).
// One canonical pack → many projections. Same underlying truth, different highlights.
func (s *EvidenceService) GetPackView(ctx context.Context, packID, viewType string) (*models.EvidenceViewResponse, error) {
	pack, err := s.GetPack(ctx, packID)
	if err != nil {
		return nil, err
	}

	view := strings.ToLower(strings.TrimSpace(viewType))
	supported := []string{"merchant", "psp", "bank", "nbfc"}
	if !slices.Contains(supported, view) {
		return nil, fmt.Errorf("unsupported view_type %q", viewType)
	}

	// Summarize leaf types for the view
	itemRefs := make([]string, 0, len(pack.Items))
	typeCount := map[string]int{}
	for _, it := range pack.Items {
		itemRefs = append(itemRefs, fmt.Sprintf("%s:%s", it.Type, it.Ref))
		typeCount[it.Type]++
	}

	highlights := map[string]any{
		"leaf_count":    len(pack.Items),
		"leaf_types":    typeCount,
		"signature_alg": pack.Signatures[0].Alg,
		"mode":          pack.Mode,
		"pack_status":   pack.PackStatus,
		"item_refs":     itemRefs,
	}

	// §18 view-specific focus
	switch view {
	case "merchant":
		// §18.1: final status, settlement refs, failure reasons
		highlights["focus"] = "final status, attachment status, settlement refs, downloadable evidence artifacts"
		highlights["show"] = []string{"FINAL_EVIDENCE_VIEW", "ATTACHMENT_DECISION", "VARIANCE_DECISION", "CANONICAL_SETTLEMENT_OBSERVATION"}
	case "psp":
		// §18.2: event timeline, webhook correlation, mapping versions
		highlights["focus"] = "full event timeline, webhook/connector correlation traces, retry history, mapping profile versions"
		highlights["show"] = []string{"RAW_SETTLEMENT_ENVELOPE", "OUTCOME_SIGNAL", "CANONICAL_SETTLEMENT_OBSERVATION"}
	case "bank":
		// §18.3: finality proof, signature chain, PII tokenization proof
		highlights["focus"] = "finality proof, merkle root, signature verification, PII tokenized proof, deterministic replay"
		highlights["show"] = []string{"FINALITY_CERT", "FINAL_CONTRACT", "GOVERNANCE_DECISION_AT_CANONICAL"}
	case "nbfc":
		// §18.4: contract graph, ledger-truth projection
		highlights["focus"] = "contract graph, ledger-truth projection, disbursal-repayment-reversal chain"
		highlights["show"] = []string{"FINAL_CONTRACT", "CANONICAL_INTENT", "ATTACHMENT_DECISION"}
	}

	return &models.EvidenceViewResponse{
		ViewType:       view,
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
		ContractID:     pack.ContractID,
		ClientBatchID:  pack.ClientBatchID,
		Mode:           pack.Mode,
		MerkleRoot:     pack.MerkleRoot,
		RulesetVersion: pack.RulesetVersion,
		CreatedAt:      pack.CreatedAt,
		Highlights:     highlights,
	}, nil
}

// writeProofEnrichment computes and persists proof_status, proof_score, proof_components,
// cryptographic_signatures, and score_breakdown immediately after a pack is saved.
// This keeps the enrichment columns always in sync with the pack at generation time.
func (s *EvidenceService) writeProofEnrichment(ctx context.Context, pack *models.EvidencePack) {
	if s.enrichRepo == nil {
		return
	}
	comp := deriveComponentsFromPack(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)
	status := DeriveProofStatus(comp, sealExists, pack.PackStatus == "SUPERSEDED", false)
	sigs := enrichPackSigsFromPack(pack)

	if err := s.enrichRepo.UpdateProofEnrichment(
		ctx, pack.EvidencePackID,
		status, score.Score,
		comp, sigs, score,
		nil, nil, // svc2/svc5 JSONB not used — data lives directly on pack columns
	); err != nil {
		log.Printf("evidence.service.write_proof_enrichment failed pack=%s err=%v", pack.EvidencePackID, err)
	}
}

// deriveComponentsFromPack derives ProofComponents from a fully-built EvidencePack's leaf set.
func deriveComponentsFromPack(pack *models.EvidencePack) models.ProofComponents {
	var c models.ProofComponents
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeEnvelopeHash, models.LeafTypeCanonicalIntentHash:
			c.PaymentInstructionAvailable = true
		case models.LeafTypeRawSettlementFile, models.LeafTypeRawSettlementLine, models.LeafTypeCanonicalSettlementObservation:
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

// enrichPackSigsFromPack builds CryptographicSignatures from pack items.
func enrichPackSigsFromPack(pack *models.EvidencePack) models.CryptographicSignatures {
	sigs := models.CryptographicSignatures{}
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeEnvelopeHash:
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
		case models.LeafTypeFinalEvidenceView:
			sigs.FinalEvidenceViewHash = item.Hash
		}
	}
	return sigs
}

// sha256Hex is a local helper for non-text bytes (archive body hash).
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
