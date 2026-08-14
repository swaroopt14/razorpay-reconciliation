package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"zord-evidence/kafka"
	"zord-evidence/models"
	"zord-evidence/repositories"
	"zord-evidence/storage"
	"zord-evidence/utils"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// validModes are the lifecycle operating modes defined in spec §3.2.
// BATCH_ATTACH is valid for batch-level packs; it is handled by GenerateBatchPackInTx
// which does not call GeneratePack (and therefore does not hit the validModes check).
// It is listed here for documentation and for any future consolidated validation path.
var validModes = []string{"INTELLIGENCE_ATTACH", "SECONDARY_DISPATCH", "FULL_CONTROL", "BATCH_ATTACH"}

type IntentJob struct {
	TenantID   string
	EnvelopeID string
	IntentID   string
	ContractID string
	TraceID    string
}

// IntentCheckJob is enqueued after leaves are persisted. Workers run readiness
// checks and pack generation — keeping the Kafka consumer on the fast path.
type IntentCheckJob struct {
	TenantID   string
	EnvelopeID string
	IntentID   string
	ContractID string
	TraceID    string
}

type BatchJob struct {
	TenantID string
	BatchID  string
	IsFinal  bool
}

// BatchCheckJob is enqueued after batch leaves are persisted.
type BatchCheckJob struct {
	TenantID string
	BatchID  string
	IsFinal  bool
}

type EvidenceService struct {
	repo                *repositories.EvidenceRepository
	pendingLeafRepo     repositories.PendingLeafRepository
	leafReceiptRepo     *repositories.PostgresLeafReceiptRepo
	enrichRepo          *repositories.EnrichmentRepository
	s3                  storage.S3Store
	signer              *Signer
	archiveCrypto       *ArchiveCrypto
	archivePrefix       string
	replayCompareStrict bool
	publisher           kafka.EventPublisher

	intentCheckQueue chan IntentCheckJob
	batchCheckQueue  chan BatchCheckJob
	workerWG         sync.WaitGroup
	shutdownQueues   sync.Once // closes s.done — used by PrepareShutdown
	shutdownChans    sync.Once // closes queue channels — used by ShutdownWorkers
	shuttingDown     atomic.Bool
	// done is closed by PrepareShutdown to signal all enqueue helpers to stop
	// sending. This eliminates the TOCTOU race between shuttingDown.Load() and
	// a channel send that could panic if ShutdownWorkers closes the channel
	// between the check and the send.
	done chan struct{}
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
	leafReceiptRepo *repositories.PostgresLeafReceiptRepo,
) *EvidenceService {
	return &EvidenceService{
		repo:                repo,
		pendingLeafRepo:     pendingLeafRepo,
		leafReceiptRepo:     leafReceiptRepo,
		enrichRepo:          enrichRepo,
		s3:                  s3,
		signer:              signer,
		archiveCrypto:       archiveCrypto,
		archivePrefix:       archivePrefix,
		replayCompareStrict: strict,
		publisher:           publisher,
		intentCheckQueue:    make(chan IntentCheckJob, 10000),
		batchCheckQueue:     make(chan BatchCheckJob, 10000),
		done:                make(chan struct{}),
	}
}

type vectorIndexPublisher interface {
	PublishVectorIndexRequest(ctx context.Context, event kafka.VectorIndexRequestEvent) error
}

func (s *EvidenceService) emitVectorIndexRequest(pack *models.EvidencePack, sourceEventType string) {
	if s == nil || s.publisher == nil || pack == nil {
		return
	}

	publisher, ok := s.publisher.(vectorIndexPublisher)
	if !ok {
		return
	}

	tenantID := strings.TrimSpace(pack.TenantID)
	batchID := strings.TrimSpace(pack.ClientBatchID)
	entityType := "evidence_pack"
	entityID := strings.TrimSpace(pack.EvidencePackID)

	if batchID != "" && strings.Contains(strings.ToLower(sourceEventType), "batch") {
		entityType = "evidence_batch_summary"
		entityID = batchID
	}

	if tenantID == "" || entityID == "" {
		return
	}

	event := kafka.VectorIndexRequestEvent{
		EventID:         uuid.NewString(),
		SchemaVersion:   "v1",
		EventType:       kafka.VectorIndexEventRequested,
		SourceService:   "zord-evidence",
		SourceEventType: sourceEventType,
		TenantID:        tenantID,
		EntityType:      entityType,
		EntityID:        entityID,
		BatchID:         batchID,
		Operation:       kafka.VectorIndexOperationUpsert,
		OccurredAt:      time.Now().UTC(),
		ContentVersion:  "v1",
		Metadata: map[string]string{
			"pack_status": pack.PackStatus,
			"mode":        pack.Mode,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := publisher.PublishVectorIndexRequest(ctx, event); err != nil {
		log.Printf("[evidence][vector-index] publish failed tenant=%s entity=%s id=%s err=%v", tenantID, entityType, entityID, err)
		return
	}

	log.Printf("[evidence][vector-index] publish ok tenant=%s entity=%s id=%s batch_id=%s source_event=%s", tenantID, entityType, entityID, batchID, sourceEventType)
}

// HandleLeafUpdate persists incoming leaves on the Kafka fast path and delegates
// readiness checks plus pack generation to the worker pool.
//
// P1-04: Before each UpsertLeaf call, WriteReceipt classifies the event as
// ACCEPTED / DUPLICATE / CONFLICT and writes an immutable receipt row.
//
//	ACCEPTED  → upsert proceeds normally.
//	DUPLICATE → skip upsert (idempotent Kafka re-delivery, leaf unchanged).
//	CONFLICT  → upsert proceeds (latest wins) + WARNING log so ops can investigate.
func (s *EvidenceService) HandleLeafUpdate(ctx context.Context, tenantID, envelopeID, intentID, contractID, traceID string, newLeaves []models.PendingLeafCandidate) error {
	// 0. If intentID is missing but envelopeID is present, try to resolve it from existing leaves
	if intentID == "" && envelopeID != "" {
		resolved, err := s.pendingLeafRepo.ResolveIntentID(ctx, tenantID, envelopeID)
		if err != nil {
			log.Printf("evidence.service.resolve_intent_failed env=%s err=%v", envelopeID, err)
		} else if resolved != "" {
			intentID = resolved
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

	// 2. Write receipt then upsert each leaf.
	var lastBatchID string
	for i := range newLeaves {
		outcome, receiptErr := s.leafReceiptRepo.WriteReceipt(ctx, &newLeaves[i])
		if receiptErr != nil {
			// Receipt write failure is logged but does not block the upsert —
			// losing a receipt is less harmful than losing the leaf itself.
			log.Printf("[ERROR] evidence.service.leaf_receipt_failed tenant=%s intent=%s leaf_type=%s err=%v",
				tenantID, intentID, newLeaves[i].LeafType, receiptErr)
		}

		switch outcome {
		case models.LeafReceiptDuplicate:
			// Kafka at-least-once re-delivery. Leaf already stored; skip upsert.
			log.Printf("evidence.service.leaf_duplicate tenant=%s intent=%s leaf_type=%s source_event_id=%s — skipping upsert",
				tenantID, intentID, newLeaves[i].LeafType, newLeaves[i].SourceEventID)
			continue

		case models.LeafReceiptConflict:
			// Two different upstream events claim the same leaf slot.
			// Latest wins (upsert proceeds) but this is a data quality issue.
			log.Printf("[WARN] evidence.service.leaf_conflict tenant=%s intent=%s leaf_type=%s source_event_id=%s — conflicting leaf overwrite detected, proceeding with upsert",
				tenantID, intentID, newLeaves[i].LeafType, newLeaves[i].SourceEventID)
		}

		// ACCEPTED or CONFLICT — proceed with upsert.
		if err := s.pendingLeafRepo.UpsertLeaf(ctx, &newLeaves[i]); err != nil {
			return err
		}
		if newLeaves[i].ClientBatchID != nil && *newLeaves[i].ClientBatchID != "" {
			lastBatchID = *newLeaves[i].ClientBatchID
		}
	}

	// 2b. Schedule batch readiness check when leaves carry a batch ID.
	if lastBatchID != "" {
		s.enqueueBatchCheck(BatchCheckJob{TenantID: tenantID, BatchID: lastBatchID})
	}

	// 3. Schedule intent readiness check (worker pool handles readiness + generation).
	if intentID != "" {
		s.enqueueIntentCheck(IntentCheckJob{
			TenantID:   tenantID,
			EnvelopeID: envelopeID,
			IntentID:   intentID,
			ContractID: contractID,
			TraceID:    traceID,
		})
	}

	return nil
}

// enqueueIntentCheck sends a job to the intent worker queue.
// FIX-06a: The previous implementation had a TOCTOU race: shuttingDown.Load()
// could return false, then ShutdownWorkers could close the channel before the
// send, causing a panic ("send on closed channel").
// Fixed by using a select with a default case on the done channel. The done
// channel is closed by ShutdownWorkers before the queue channels are closed,
// so any send that races with shutdown is safely dropped instead of panicking.
func (s *EvidenceService) enqueueIntentCheck(job IntentCheckJob) {
	select {
	case <-s.done:
		log.Printf("evidence.service.enqueue_intent_check intent=%s skipped during shutdown", job.IntentID)
	default:
		select {
		case s.intentCheckQueue <- job:
		case <-s.done:
			log.Printf("evidence.service.enqueue_intent_check intent=%s dropped during shutdown", job.IntentID)
		}
	}
}

// enqueueBatchCheck sends a job to the batch worker queue.
// Same TOCTOU fix as enqueueIntentCheck.
func (s *EvidenceService) enqueueBatchCheck(job BatchCheckJob) {
	select {
	case <-s.done:
		log.Printf("evidence.service.enqueue_batch_check batch=%s skipped during shutdown", job.BatchID)
	default:
		select {
		case s.batchCheckQueue <- job:
		case <-s.done:
			log.Printf("evidence.service.enqueue_batch_check batch=%s dropped during shutdown", job.BatchID)
		}
	}
}

// HandleBatchLeafUpdate persists batch leaves on the Kafka fast path and delegates
// readiness checks plus pack generation to the worker pool.
//
// P1-04: Same receipt-before-upsert pattern as HandleLeafUpdate.
func (s *EvidenceService) HandleBatchLeafUpdate(ctx context.Context, tenantID, batchID string, newLeaves []models.PendingLeafCandidate, isFinal bool) error {
	for i := range newLeaves {
		outcome, receiptErr := s.leafReceiptRepo.WriteReceipt(ctx, &newLeaves[i])
		if receiptErr != nil {
			log.Printf("[ERROR] evidence.service.batch_leaf_receipt_failed tenant=%s batch=%s leaf_type=%s err=%v",
				tenantID, batchID, newLeaves[i].LeafType, receiptErr)
		}

		switch outcome {
		case models.LeafReceiptDuplicate:
			log.Printf("evidence.service.batch_leaf_duplicate tenant=%s batch=%s leaf_type=%s source_event_id=%s — skipping upsert",
				tenantID, batchID, newLeaves[i].LeafType, newLeaves[i].SourceEventID)
			continue
		case models.LeafReceiptConflict:
			log.Printf("[WARN] evidence.service.batch_leaf_conflict tenant=%s batch=%s leaf_type=%s source_event_id=%s — conflicting leaf overwrite",
				tenantID, batchID, newLeaves[i].LeafType, newLeaves[i].SourceEventID)
		}

		if err := s.pendingLeafRepo.UpsertLeaf(ctx, &newLeaves[i]); err != nil {
			return err
		}
	}

	if !isFinal && len(newLeaves) > 0 {
		log.Printf("evidence.service.handle_batch_update batch=%s buffering leaves", batchID)
	}

	s.enqueueBatchCheck(BatchCheckJob{
		TenantID: tenantID,
		BatchID:  batchID,
		IsFinal:  isFinal,
	})

	return nil
}

// RecordMalformedEvent records a malformed event as an immutable receipt
// so auditors can see why a leaf never arrived. This is called when
// Kafka consumers encounter parse failures or missing required fields.
func (s *EvidenceService) RecordMalformedEvent(ctx context.Context, tenantID, topic, eventID, traceID, reason string) error {
	return s.leafReceiptRepo.WriteMalformedReceipt(ctx, tenantID, topic, eventID, traceID, reason)
}

// StartWorkers spins up the async generation workers.
// Workers run until ShutdownWorkers closes the job queues and in-flight jobs finish.
func (s *EvidenceService) StartWorkers(workers int) {
	for i := 0; i < workers; i++ {
		s.workerWG.Add(1)
		go func(workerID int) {
			defer s.workerWG.Done()
			s.runWorker(workerID)
		}(i)
	}
}

func (s *EvidenceService) runWorker(workerID int) {
	intentQ := s.intentCheckQueue
	batchQ := s.batchCheckQueue

	for intentQ != nil || batchQ != nil {
		select {
		case job, ok := <-intentQ:
			if !ok {
				intentQ = nil
				continue
			}
			jobCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			err := s.processIntentCheckJob(jobCtx, job)
			cancel()
			if err != nil {
				log.Printf("evidence.service.worker id=%d intent_check=%s err=%v", workerID, job.IntentID, err)
			}
		case job, ok := <-batchQ:
			if !ok {
				batchQ = nil
				continue
			}
			jobCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			err := s.processBatchCheckJob(jobCtx, job)
			cancel()
			if err != nil {
				log.Printf("evidence.service.worker id=%d batch_check=%s err=%v", workerID, job.BatchID, err)
			}
		}
	}
}

// PrepareShutdown signals that the process is stopping. Kafka handlers may still
// persist leaves, but no new readiness checks are enqueued. Pending leaves
// remain in the DB and will be picked up on the next process start.
// FIX-06a: Closes the done channel first so enqueue helpers stop safely, then
// sets the atomic bool for any legacy callers. Order matters: done must be
// closed before the queue channels are closed by ShutdownWorkers.
func (s *EvidenceService) PrepareShutdown() {
	s.shutdownQueues.Do(func() {
		close(s.done)
	})
	s.shuttingDown.Store(true)
}

// ShutdownWorkers closes the job queues and waits for all in-flight readiness
// checks and pack generation to complete, or until ctx is cancelled.
// FIX-06a: Queue channel close is now in a separate sync.Once (shutdownChans)
// so it doesn't conflict with PrepareShutdown's Once that closes s.done.
// The done channel must already be closed before this runs so workers see the
// shutdown signal and don't attempt to send on a closed queue channel.
func (s *EvidenceService) ShutdownWorkers(ctx context.Context) error {
	s.shutdownChans.Do(func() {
		log.Printf("evidence.service.shutdown closing worker queues")
		close(s.intentCheckQueue)
		close(s.batchCheckQueue)
	})

	done := make(chan struct{})
	go func() {
		s.workerWG.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Printf("evidence.service.shutdown workers drained")
		return nil
	case <-ctx.Done():
		return fmt.Errorf("worker drain: %w", ctx.Err())
	}
}

// processIntentCheckJob loads buffered leaves, checks readiness, and generates
// a pack when all required leaves are present.
func (s *EvidenceService) processIntentCheckJob(ctx context.Context, job IntentCheckJob) error {
	leaves, err := s.pendingLeafRepo.GetLeavesForIntent(ctx, job.TenantID, job.IntentID)
	if err != nil {
		return err
	}

	leafMap := make(map[string]models.PendingLeafCandidate, len(leaves))
	for _, l := range leaves {
		leafMap[l.LeafType] = l
	}

	var missing []string
	allPresent := true
	for _, requiredType := range models.RequiredLeafTypes {
		if _, ok := leafMap[requiredType]; !ok {
			allPresent = false
			missing = append(missing, requiredType)
		}
	}

	if !allPresent {
		log.Printf("evidence.service.readiness_check intent=%s missing_leaves=%v present_count=%d",
			job.IntentID, missing, len(leaves))
		return nil
	}

	resolvedContractID := resolveContractIDFromLeaves(leaves, job.ContractID)
	// FIX-06b: Pass the already-fetched leaves directly to processIntentJob.
	// Previously processIntentJob re-fetched leaves from the DB, creating a
	// redundant round-trip and a TOCTOU window where leaves could change between
	// the readiness check and the generation fetch.
	return s.processIntentJob(ctx, IntentJob{
		TenantID:   job.TenantID,
		EnvelopeID: job.EnvelopeID,
		IntentID:   job.IntentID,
		ContractID: resolvedContractID,
		TraceID:    job.TraceID,
	}, leaves)
}

// processBatchCheckJob loads buffered batch leaves, checks readiness, and generates
// a pack when all required batch leaves are present.
func (s *EvidenceService) processBatchCheckJob(ctx context.Context, job BatchCheckJob) error {
	leaves, err := s.pendingLeafRepo.GetLeavesForBatch(ctx, job.TenantID, job.BatchID)
	if err != nil {
		return err
	}

	leafMap := make(map[string]models.PendingLeafCandidate, len(leaves))
	for _, l := range leaves {
		leafMap[l.LeafType] = l
	}

	var missing []string
	allPresent := true
	for _, requiredType := range models.RequiredBatchLeafTypes {
		if _, ok := leafMap[requiredType]; !ok {
			allPresent = false
			missing = append(missing, requiredType)
		}
	}

	if !allPresent {
		log.Printf("evidence.service.batch_readiness_check batch=%s missing_leaves=%v present_count=%d",
			job.BatchID, missing, len(leaves))
		return nil
	}

	return s.processBatchJob(ctx, BatchJob{
		TenantID: job.TenantID,
		BatchID:  job.BatchID,
		IsFinal:  job.IsFinal,
	})
}

// processIntentJob executes the pack generation for a ready intent.
// processIntentJob executes pack generation for a ready intent.
// FIX-06b: The leaves parameter is the already-fetched, readiness-confirmed slice
// passed from processIntentCheckJob. This eliminates the previous redundant
// GetLeavesForIntent call and the TOCTOU window between readiness check and generation.
func (s *EvidenceService) processIntentJob(ctx context.Context, job IntentJob, leaves []models.PendingLeafCandidate) error {
	// Build items from the provided leaves
	var items []models.EvidenceItem
	for _, l := range leaves {
		if slices.Contains(models.RequiredLeafTypes, l.LeafType) {
			items = append(items, models.EvidenceItem{
				Type:          l.LeafType,
				Ref:           l.ItemRef,
				Hash:          l.Hash,
				SchemaVersion: l.SchemaVersion,
				EventVersion:  l.EventVersion,
				TraceID:       l.TraceID,
				SourceEventID: l.SourceEventID,
			})
		}
	}

	// ── CONCURRENCY GUARD ────────────────────────────────────────────────────
	lockTx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return fmt.Errorf("begin advisory lock tx: %w", err)
	}
	defer lockTx.Rollback() //nolint:errcheck

	acquired, err := s.repo.AcquireIntentAdvisoryLock(ctx, lockTx, job.TenantID, job.IntentID)
	if err != nil {
		return fmt.Errorf("advisory lock: %w", err)
	}
	if !acquired {
		log.Printf("evidence.service.process_intent intent=%s advisory_lock_not_acquired — another goroutine is generating, skipping", job.IntentID)
		return nil
	}

	existingPacks, checkErr := s.repo.ListByIntentID(ctx, job.TenantID, job.IntentID)
	if checkErr == nil {
		for _, ep := range existingPacks {
			if ep.PackStatus == models.PackStatusActive {
				log.Printf("evidence.service.process_intent intent=%s pack already exists ep=%s — skipping generation", job.IntentID, ep.EvidencePackID)
				if delErr := s.pendingLeafRepo.DeleteForIntent(ctx, job.TenantID, job.IntentID); delErr != nil {
					log.Printf("evidence.service.process_intent intent=%s delete_pending_leaves_failed err=%v — leaves will accumulate until next cycle", job.IntentID, delErr)
				}
				return nil
			}
		}
	}
	// ─────────────────────────────────────────────────────────────────────────

	// Extract traceability metadata
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
	var batchID string
	var artifactID, artifactVersionID string
	contractID := resolveContractIDFromLeaves(leaves, job.ContractID)

	for _, l := range leaves {
		if l.ClientBatchID != nil && *l.ClientBatchID != "" {
			batchID = *l.ClientBatchID
		}
		if l.ArtifactID != nil && *l.ArtifactID != "" {
			artifactID = *l.ArtifactID
		}
		if l.ArtifactVersionID != nil && *l.ArtifactVersionID != "" {
			artifactVersionID = *l.ArtifactVersionID
		}
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

	req := models.GenerateEvidenceRequest{
		TenantID:                   job.TenantID,
		IntentID:                   job.IntentID,
		ClientBatchID:              batchID,
		EnvelopeID:                 job.EnvelopeID,
		TraceID:                    job.TraceID,
		ContractID:                 contractID,
		ArtifactID:                 artifactID,
		ArtifactVersionID:          artifactVersionID,
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

		ClientPayoutRef: clientPayoutRef,
		Amount:          amount,
		Currency:        currency,
	}

	pack, err := s.GeneratePackInTx(ctx, lockTx, req)
	if err != nil {
		if errors.Is(err, repositories.ErrPackAlreadyExists) {
			log.Printf("evidence.service.process_intent intent=%s duplicate_pack_detected_at_insert — treating as success", job.IntentID)
			if delErr := s.pendingLeafRepo.DeleteForIntent(ctx, job.TenantID, job.IntentID); delErr != nil {
				log.Printf("evidence.service.process_intent intent=%s delete_pending_leaves_failed err=%v — leaves will accumulate until next cycle", job.IntentID, delErr)
			}
			return nil
		}
		return fmt.Errorf("generate pack from buffered leaves: %w", err)
	}

	if err := lockTx.Commit(); err != nil {
		return fmt.Errorf("commit advisory lock tx: %w", err)
	}

	// Enrichment UPDATE uses a separate pool connection; it must run after commit
	// so the pack row is visible (same issue as advisory-lock tx holding the INSERT).
	s.writeProofEnrichment(ctx, pack)

	return s.pendingLeafRepo.DeleteForIntent(ctx, job.TenantID, job.IntentID)
}

// resolveContractIDFromLeaves returns contractID from the Kafka handler when present,
// otherwise the first non-empty contract_id stored on buffered pending leaves.
// Readiness is often triggered by the outcome consumer, whose relay envelope may omit
// contract_id even though intent/edge leaves already captured it in Postgres.
// packEnvelopeVersions maps the evidence.pack.* event's schema_version/
// event_version from the pack's own upstream-sourced items rather than
// hardcoding them here — items[0] is the first leaf actually received from
// an upstream service, before the synthetic FINAL_EVIDENCE_VIEW leaf (which
// zord-evidence generates itself, so it has no upstream version to map).
func packEnvelopeVersions(items []models.EvidenceItem) (schemaVersion, eventVersion string) {
	if len(items) == 0 {
		return "", ""
	}
	return items[0].SchemaVersion, items[0].EventVersion
}

func resolveContractIDFromLeaves(leaves []models.PendingLeafCandidate, fromHandler string) string {
	if strings.TrimSpace(fromHandler) != "" {
		return strings.TrimSpace(fromHandler)
	}
	for _, l := range leaves {
		if l.ContractID != nil && strings.TrimSpace(*l.ContractID) != "" {
			return strings.TrimSpace(*l.ContractID)
		}
	}
	return ""
}

// processBatchJob executes the pack generation for a ready batch.
func (s *EvidenceService) processBatchJob(ctx context.Context, job BatchJob) error {
	leaves, err := s.pendingLeafRepo.GetLeavesForBatch(ctx, job.TenantID, job.BatchID)
	if err != nil {
		return err
	}

	var items []models.EvidenceItem
	for _, l := range leaves {
		if slices.Contains(models.RequiredBatchLeafTypes, l.LeafType) {
			items = append(items, models.EvidenceItem{
				Type:          l.LeafType,
				Ref:           l.ItemRef,
				Hash:          l.Hash,
				SchemaVersion: l.SchemaVersion,
				EventVersion:  l.EventVersion,
				TraceID:       l.TraceID,
				SourceEventID: l.SourceEventID,
			})
		}
	}

	// ── CONCURRENCY GUARD ────────────────────────────────────────────────────
	lockTx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return fmt.Errorf("begin batch advisory lock tx: %w", err)
	}
	defer lockTx.Rollback() //nolint:errcheck

	acquired, err := s.repo.AcquireBatchAdvisoryLock(ctx, lockTx, job.TenantID, job.BatchID)
	if err != nil {
		return fmt.Errorf("batch advisory lock: %w", err)
	}
	if !acquired {
		log.Printf("evidence.service.process_batch batch=%s advisory_lock_not_acquired — another goroutine is generating, skipping", job.BatchID)
		return nil
	}

	existing, existErr := s.repo.GetPackByBatchID(ctx, job.TenantID, job.BatchID)
	if existErr == nil && existing != nil {
		log.Printf("evidence.service.process_batch batch=%s pack already exists — publishing batch vector summary and skipping generation", job.BatchID)

		s.emitVectorIndexRequest(existing, "evidence_batch_pack.generated.v1")

		if delErr := s.pendingLeafRepo.DeleteForBatch(ctx, job.TenantID, job.BatchID); delErr != nil {
			log.Printf("evidence.service.process_batch batch=%s delete_pending_leaves_failed err=%v — leaves will accumulate until next cycle", job.BatchID, delErr)
		}
		return nil
	}
	// ─────────────────────────────────────────────────────────────────────────

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
	var traceID string

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
		if traceID == "" && l.TraceID != "" {
			traceID = l.TraceID
		}
	}
	if traceID == "" {
		log.Printf("evidence.service.process_batch batch=%s no leaf in this batch carried a trace_id — pack will have an empty generation trace", job.BatchID)
	}

	req := models.GenerateEvidenceRequest{
		TenantID:                   job.TenantID,
		ClientBatchID:              job.BatchID,
		TraceID:                    traceID,
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

		ClientPayoutRef: clientPayoutRef,
		Amount:          amount,
		Currency:        currency,
	}

	pack, err := s.GenerateBatchPackInTx(ctx, lockTx, req)
	if err != nil {
		if errors.Is(err, repositories.ErrPackAlreadyExists) {
			log.Printf("evidence.service.process_batch batch=%s duplicate_pack_detected_at_insert — treating as success", job.BatchID)
			if delErr := s.pendingLeafRepo.DeleteForBatch(ctx, job.TenantID, job.BatchID); delErr != nil {
				log.Printf("evidence.service.process_batch batch=%s delete_pending_leaves_failed err=%v — leaves will accumulate until next cycle", job.BatchID, delErr)
			}
			return nil
		}
		return fmt.Errorf("generate pack from buffered batch leaves: %w", err)
	}

	if err := lockTx.Commit(); err != nil {
		return fmt.Errorf("commit batch advisory lock tx: %w", err)
	}

	s.writeProofEnrichment(ctx, pack)
	s.emitVectorIndexRequest(pack, "evidence_batch_pack.generated.v1")
	return s.pendingLeafRepo.DeleteForBatch(ctx, job.TenantID, job.BatchID)
}

// GeneratePackFromTrustedLeaves generates a pack from the trusted pending-leaf
// set already committed to the DB. It does not accept arbitrary caller-supplied
// leaves. It is used by the admin recovery endpoint.
func (s *EvidenceService) GeneratePackFromTrustedLeaves(ctx context.Context, tenantID, intentID string) (*models.EvidencePack, error) {
	leaves, err := s.pendingLeafRepo.GetLeavesForIntent(ctx, tenantID, intentID)
	if err != nil {
		return nil, fmt.Errorf("fetch trusted leaves: %w", err)
	}
	if len(leaves) == 0 {
		return nil, fmt.Errorf("no trusted leaves found for intent %s", intentID)
	}

	// We format the req using the exact same logic processIntentJob does
	var items []models.EvidenceItem
	for _, l := range leaves {
		items = append(items, models.EvidenceItem{
			Type:          l.LeafType,
			Ref:           l.ItemRef,
			Hash:          l.Hash,
			SchemaVersion: l.SchemaVersion,
		})
	}

	var batchID, artifactID, artifactVersionID string
	var clientPayoutRef *string
	var amount decimal.Decimal
	var currency string

	var pir, cic *time.Time
	var mpu, gd *string
	var rfs, ts *bool
	var srr, csc *time.Time
	var br, cr, ad *string
	var mc *float64
	var vdc, am *bool

	// Use contractID from the first leaf that has it
	var contractID string
	for _, l := range leaves {
		if l.ContractID != nil && *l.ContractID != "" && contractID == "" {
			contractID = *l.ContractID
		}
		if l.ClientBatchID != nil && *l.ClientBatchID != "" {
			batchID = *l.ClientBatchID
		}
		if l.ArtifactID != nil && *l.ArtifactID != "" {
			artifactID = *l.ArtifactID
		}
		if l.ArtifactVersionID != nil && *l.ArtifactVersionID != "" {
			artifactVersionID = *l.ArtifactVersionID
		}
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

	// It's possible EnvelopeID is not in the leaves, so we resolve it from traceID/etc if possible?
	// The DB just needs a GenerateEvidenceRequest.
	// Actually, envelopeID usually comes from the job, but we'll leave it empty here if not present.
	// It's just metadata in the pack.
	req := models.GenerateEvidenceRequest{
		TenantID:                   tenantID,
		IntentID:                   intentID,
		ClientBatchID:              batchID,
		ContractID:                 contractID,
		ArtifactID:                 artifactID,
		ArtifactVersionID:          artifactVersionID,
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

	return s.GeneratePackInTx(ctx, nil, req)
}

// GeneratePackInTx is the transaction-aware core of GeneratePack.
// When packTx is non-nil (advisory lock path), SavePackInTx reuses the transaction
// keeping the lock held atomically through the INSERT. Caller must call tx.Commit().
// When packTx is nil, SavePackInTx opens and commits its own transaction.
func (s *EvidenceService) GeneratePackInTx(ctx context.Context, packTx *sql.Tx, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
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
	packSig := buildPackSignature(s.signer, models.CanonicalIntentPackCommitmentV1, signPayload, now)

	pack := &models.EvidencePack{
		EvidencePackID:             packID,
		TenantID:                   req.TenantID,
		TraceID:                    req.TraceID,
		IntentID:                   req.IntentID,
		ContractID:                 req.ContractID,
		ClientBatchID:              req.ClientBatchID,
		ArtifactID:                 req.ArtifactID,
		ArtifactVersionID:          req.ArtifactVersionID,
		Mode:                       req.Mode,
		PackStatus:                 models.PackStatusDraft,
		Items:                      items,
		MerkleRoot:                 merkleRoot,
		RulesetVersion:             req.RulesetVersion,
		SchemaVersions:             req.SchemaVersions,
		SupersedesPackID:           req.SupersedesPackID,
		RevisionReason:             req.RevisionReason,
		BasedOnVersions:            req.BasedOnVersions,
		Signatures:                 []models.Signature{packSig},
		ZordSignature:              packSig.Sig,
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

		ClientPayoutRef: req.ClientPayoutRef,
		Amount:          req.Amount,
		Currency:        req.Currency,

		CreatedAt: now,
	}

	pack.ComputeCompletenessMetadata()

	// --- Step 10: encrypt archive (in memory); persist DB-first, then S3, then activate ---
	plaintextArchive, err := utils.MarshalCanonicalJSON(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(plaintextArchive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}

	anchorID := req.IntentID
	if req.ContractID != "" {
		anchorID = req.ContractID
	}
	objectKey := fmt.Sprintf("%s/%s/%s/%s.json.enc", s.archivePrefix, req.TenantID, anchorID, packID)

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

	// FIX-06c: Use package-level constants so this function and
	// ComputeCompletenessMetadata always agree on the denominator.
	// Previously this function used 6 for batch (wrong) while the model used 5
	// (correct), producing different completeness scores for the same pack.
	if req.IntentID != "" {
		requiredLeafCount = models.RequiredIntentLeafCount // 9
		settlementLeafFlag = hasRawSettlementFile && hasRawSettlementLine && hasCanonicalSettlementObs
		attachmentDecisionLeafFlag = hasAttachmentDecision && hasVarianceDecision
	} else if req.ClientBatchID != "" {
		requiredLeafCount = models.RequiredBatchLeafCount // 5
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

	eventType := kafka.EventPackCreated
	if req.SupersedesPackID != "" {
		eventType = kafka.EventPackReversalSupersed
	}

	packSchemaVersion, packEventVersion := packEnvelopeVersions(items)

	packEvent := kafka.PackEvent{
		EventType:                         eventType,
		EventVersion:                      packEventVersion,
		SchemaVersion:                     packSchemaVersion,
		EvidencePackID:                    packID,
		TenantID:                          req.TenantID,
		BatchID:                           req.ClientBatchID,
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
	// FIX-15a: json.Marshal on a well-typed struct will not fail in practice,
	// but silently discarding the error hides future schema issues. Log and
	// fall back to an empty payload rather than silently proceeding.
	payloadBytes, marshalErr := json.Marshal(packEvent)
	if marshalErr != nil {
		log.Printf("evidence.service.generate_pack marshal_event_failed pack=%s err=%v — outbox event will have empty payload", packID, marshalErr)
		payloadBytes = []byte("{}")
	}

	// FIX-17: EvidencePackID and PayloadHash are now written to the outbox row.
	// PayloadHash is SHA-256(payload bytes) so relay consumers can verify integrity
	// without re-fetching the pack from the DB.
	outboxEvt := &models.OutboxEvent{
		TraceID:        req.TraceID,
		EnvelopeID:     req.EnvelopeID,
		TenantID:       req.TenantID,
		ContractID:     req.ContractID,
		AggregateType:  "evidence_pack",
		AggregateID:    req.IntentID,
		EventType:      eventType,
		Payload:        payloadBytes,
		Status:         "PENDING",
		CreatedAt:      now,
		EvidencePackID: packID,
		PayloadHash:    utils.SHA256Hex(string(payloadBytes)),
	}

	log.Printf("evidence.service.generate_pack persisting draft pack=%s intent=%s", packID, req.IntentID)
	if err := s.persistPackDBFirst(ctx, packTx, pack, leaves, objectKey, plaintextArchive, encryptedArchive, now, outboxEvt, req.SupersedesPackID); err != nil {
		log.Printf("evidence.service.generate_pack save_failed pack=%s err=%v", packID, err)
		return nil, err
	}
	log.Printf("evidence.service.generate_pack save_ok pack=%s", packID)

	// When packTx is non-nil the caller holds an uncommitted advisory-lock tx;
	// proof enrichment runs after Commit in processIntentJob.
	if packTx == nil {
		s.emitVectorIndexRequest(pack, "evidence_pack.generated.v1")
		s.writeProofEnrichment(ctx, pack)
	}

	return pack, nil
}

func (s *EvidenceService) persistPackDBFirst(
	ctx context.Context,
	packTx *sql.Tx,
	pack *models.EvidencePack,
	leaves []utils.MerkleLeaf,
	objectKey string,
	plaintextArchive []byte,
	encryptedArchive []byte,
	now time.Time,
	outboxEvt *models.OutboxEvent,
	supersedesPackID string,
) error {
	plannedRef := s.s3.ObjectRef(objectKey)
	pack.PackStatus = models.PackStatusDraft
	ciphertextHash := sha256Hex(encryptedArchive)
	plaintextHash := sha256Hex(plaintextArchive)

	archiveRecord := &models.EvidenceArchive{
		ArchiveID:             "arc_" + uuid.NewString(),
		EvidencePackID:        pack.EvidencePackID,
		TenantID:              pack.TenantID,
		ObjectRef:             plannedRef,
		EncryptionKeyID:       s.archiveCrypto.KeyID(),
		ArchiveCiphertextHash: ciphertextHash,
		PlaintextManifestHash: plaintextHash,
		ArchiveSizeBytes:      int64(len(encryptedArchive)),
		ArchiveVersion:        "v1",
		CreatedAt:             now,
	}

	proofPaths := utils.BuildInclusionProofs(leaves)
	inclusionProofs := make([]models.InclusionProof, 0, len(leaves))
	for _, leaf := range leaves {
		inclusionProofs = append(inclusionProofs, models.InclusionProof{
			EvidencePackID: pack.EvidencePackID,
			LeafIndex:      leaf.Index,
			LeafHash:       leaf.LeafHash,
			ProofPath:      proofPaths[leaf.Index],
			CreatedAt:      now,
		})
	}

	if err := s.repo.SavePackDraftInTx(ctx, packTx, pack, plannedRef, archiveRecord, inclusionProofs); err != nil {
		if errors.Is(err, repositories.ErrPackAlreadyExists) {
			return err
		}
		return fmt.Errorf("save pack draft: %w", err)
	}

	objectRef, err := s.s3.PutObject(ctx, objectKey, encryptedArchive)
	if err != nil {
		return fmt.Errorf("store archive: %w", err)
	}

	if err := s.repo.ActivatePackInTx(ctx, packTx, pack.EvidencePackID, objectRef, ciphertextHash, outboxEvt); err != nil {
		if errors.Is(err, repositories.ErrPackAlreadyExists) {
			return err
		}
		return fmt.Errorf("activate pack: %w", err)
	}

	pack.PackStatus = models.PackStatusActive

	if supersedesPackID != "" {
		var err error
		if packTx != nil {
			err = s.repo.MarkPackSupersededInTx(ctx, packTx, supersedesPackID, pack.EvidencePackID)
		} else {
			err = s.repo.MarkPackSuperseded(ctx, supersedesPackID, pack.EvidencePackID)
		}
		if err != nil {
			// P0-1.4: supersession failure must be surfaced — leaving two ACTIVE
			// packs for the same intent violates pack immutability guarantees.
			return fmt.Errorf("mark superseded pack %s: %w", supersedesPackID, err)
		}
	}

	return nil
}

// GenerateBatchPack generates an evidence pack bound to a batch.
func (s *EvidenceService) GenerateBatchPack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
	return s.GenerateBatchPackInTx(ctx, nil, req)
}

// GenerateBatchPackInTx is the transaction-aware variant of GenerateBatchPack.
func (s *EvidenceService) GenerateBatchPackInTx(ctx context.Context, packTx *sql.Tx, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
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
	packSig := buildPackSignature(s.signer, models.CanonicalBatchPackCommitmentV1, signPayload, now)

	pack := &models.EvidencePack{
		EvidencePackID:  packID,
		TenantID:        req.TenantID,
		TraceID:         req.TraceID,
		ClientBatchID:   req.ClientBatchID,
		Mode:            req.Mode,
		PackStatus:      models.PackStatusDraft,
		Items:           items,
		MerkleRoot:      merkleRoot,
		RulesetVersion:  req.RulesetVersion,
		SchemaVersions:  req.SchemaVersions,
		Signatures:      []models.Signature{packSig},
		ZordSignature:   packSig.Sig,
		ClientPayoutRef: req.ClientPayoutRef,
		Amount:          req.Amount,
		Currency:        req.Currency,
		CreatedAt:       now,
	}

	pack.ComputeCompletenessMetadata()

	plaintextArchive, err := utils.MarshalCanonicalJSON(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(plaintextArchive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}

	objectKey := fmt.Sprintf("%s/%s/batch/%s/%s.json.enc", s.archivePrefix, req.TenantID, req.ClientBatchID, packID)

	batchSchemaVersion, batchEventVersion := packEnvelopeVersions(items)

	packEvent := kafka.PackEvent{
		EventType:      kafka.EventPackCreated,
		EventVersion:   batchEventVersion,
		SchemaVersion:  batchSchemaVersion,
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		BatchID:        req.ClientBatchID,
		Mode:           req.Mode,
		MerkleRoot:     merkleRoot,
		RulesetVersion: req.RulesetVersion,
		OccurredAt:     now,
	}
	// FIX-15a: Handle marshal error explicitly.
	payloadBytes, marshalErr := json.Marshal(packEvent)
	if marshalErr != nil {
		log.Printf("evidence.service.generate_batch_pack marshal_event_failed pack=%s err=%v — outbox event will have empty payload", packID, marshalErr)
		payloadBytes = []byte("{}")
	}

	// FIX-17: EvidencePackID and PayloadHash written to outbox for relay correlation and integrity.
	outboxEvt := &models.OutboxEvent{
		TraceID:        req.TraceID,
		TenantID:       req.TenantID,
		AggregateType:  "evidence_pack",
		AggregateID:    req.ClientBatchID,
		EventType:      "evidence.batch.pack.created",
		Payload:        payloadBytes,
		Status:         "PENDING",
		CreatedAt:      now,
		EvidencePackID: packID,
		PayloadHash:    utils.SHA256Hex(string(payloadBytes)),
	}

	log.Printf("evidence.service.generate_batch_pack persisting draft pack=%s batch=%s", packID, req.ClientBatchID)
	if err := s.persistPackDBFirst(ctx, packTx, pack, leaves, objectKey, plaintextArchive, encryptedArchive, now, outboxEvt, ""); err != nil {
		log.Printf("evidence.service.generate_batch_pack save_failed pack=%s err=%v", packID, err)
		return nil, err
	}
	log.Printf("evidence.service.generate_batch_pack save_ok pack=%s", packID)

	if packTx == nil {
		s.emitVectorIndexRequest(pack, "evidence_batch_pack.generated.v1")
		s.writeProofEnrichment(ctx, pack)
	}

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

// ListPackExports returns the audit trail of dispute exports for a pack (P2-02).
func (s *EvidenceService) ListPackExports(ctx context.Context, packID string) (*models.ListPackExportsResponse, error) {
	if _, err := s.GetPack(ctx, packID); err != nil {
		return nil, err
	}
	exports, err := s.repo.ListExportLogsByPackID(ctx, packID)
	if err != nil {
		return nil, err
	}
	if exports == nil {
		exports = []models.EvidenceExportLogEntry{}
	}
	return &models.ListPackExportsResponse{
		EvidencePackID: packID,
		Exports:        exports,
		Count:          len(exports),
	}, nil
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

	newPack, err := s.GeneratePackInTx(ctx, nil, models.GenerateEvidenceRequest{
		TenantID:   req.TenantID,
		IntentID:   req.IntentID,
		ContractID: req.ContractID,
		// Preserve the original pack's batch lineage on the replay so the new
		// pack remains queryable via GET /v1/evidence/packs?batch_id=.
		ClientBatchID: oldPack.ClientBatchID,
		// Preserve artifact identity too — a replay rebuilds the pack from the
		// same inputs, not a new source artifact.
		ArtifactID:        oldPack.ArtifactID,
		ArtifactVersionID: oldPack.ArtifactVersionID,
		Mode:              req.Mode,
		RulesetVersion:    req.RulesetVersion,
		SchemaVersions:    req.SchemaVersions,
		// FIX-16: Set SupersedesPackID so GeneratePack marks the original pack
		// as REVOKED_SUPERSEDED inside the same DB transaction. Without this, every
		// ReplayPack call created a new ACTIVE pack for the same intent, making it
		// impossible to determine the canonical pack from a list query.
		SupersedesPackID: req.OriginalPackID,
		// P0-1.4: carry revision context onto the superseding pack.
		RevisionReason: req.RevisionReason,
		// BasedOnVersions captures the version snapshot of the pack being replaced
		// so auditors can compare what changed between the two generations.
		BasedOnVersions: buildBasedOnVersions(oldPack, req),
		Items:           req.Items,
	})
	if err != nil {
		// FIX-16: If generation fails, update the job to FAILED status so callers
		// can distinguish a failed replay from a pending or completed one.
		if failErr := s.repo.FailReplayJob(ctx, jobID, err.Error()); failErr != nil {
			log.Printf("evidence.service.replay fail_replay_job_failed job=%s err=%v", jobID, failErr)
		}
		return nil, fmt.Errorf("replay pack generation failed: %w", err)
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
	// FIX-15c: Log errors instead of silently discarding them.
	if completeErr := s.repo.CompleteReplayJob(ctx, jobID, newPack.EvidencePackID, equivalenceResult, diffSummary); completeErr != nil {
		log.Printf("evidence.service.replay complete_replay_job_failed job=%s err=%v", jobID, completeErr)
	}

	// --- Publish evidence.pack.replayed event ---
	replaySchemaVersion, replayEventVersion := packEnvelopeVersions(newPack.Items)
	if pubErr := s.publisher.Publish(ctx, kafka.PackEvent{
		EventType:      kafka.EventPackReplayed,
		EventVersion:   replayEventVersion,
		SchemaVersion:  replaySchemaVersion,
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
	}); pubErr != nil {
		log.Printf("evidence.service.replay publish_event_failed job=%s pack=%s err=%v", jobID, newPack.EvidencePackID, pubErr)
	}

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

// buildBasedOnVersions captures the version snapshot of the original pack
// being replaced by a superseding pack or replay operation.
func buildBasedOnVersions(oldPack *models.EvidencePack, req models.ReplayRequest) map[string]string {
	versions := map[string]string{
		"ruleset_version": oldPack.RulesetVersion,
	}
	for k, v := range oldPack.SchemaVersions {
		versions["schema_"+k] = v
	}
	// Replay request can bring new mapping versions. If we want to capture
	// what the old pack was based on, we should try to extract it.
	// Since mapping versions are not directly stored on EvidencePack natively in this implementation,
	// we will record what was explicitly passed in the original pack creation, if available,
	// or what is in the replay request as a fallback/record of the new version.
	// Note: P0-1.4 spec says "what the original pack was built from", so we rely on schema and ruleset.
	return versions
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
	sealExists := pack.PackStatus == models.PackStatusActive
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
