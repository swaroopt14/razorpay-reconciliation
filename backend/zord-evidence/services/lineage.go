package services

import (
	"fmt"
	"sort"
	"time"
	"zord-evidence/models"
)

// BuildTimeline converts the EvidencePack into a chronological array of
// real-world operational milestones (spec §5 Engine A).
//
// Timestamps use the actual upstream signal fields carried on the pack
// (PaymentInstructionReceived, SettlementRecordReceived, etc.) so the
// timeline reflects the true payment lifecycle, not an artificial offset.
// Leaves without a real timestamp fall back to pack.CreatedAt with a
// stable positional offset so the ordering is always correct.
func BuildTimeline(pack *models.EvidencePack) []models.TimelineEvent {
	// Real timestamps from upstream signals, keyed by leaf type.
	// These are populated by intent/outcome consumers from relay events.
	realTimestamps := map[string]time.Time{}

	if pack.PaymentInstructionReceived != nil {
		realTimestamps[models.LeafTypeEnvelopeHash] = *pack.PaymentInstructionReceived
	}
	if pack.CanonicalIntentCreated != nil {
		realTimestamps[models.LeafTypeCanonicalIntentHash] = *pack.CanonicalIntentCreated
		realTimestamps[models.LeafTypeGovernanceDecision] = *pack.CanonicalIntentCreated
	}
	if pack.SettlementRecordReceived != nil {
		realTimestamps[models.LeafTypeRawSettlementFile] = *pack.SettlementRecordReceived
		realTimestamps[models.LeafTypeRawSettlementLine] = *pack.SettlementRecordReceived

	}
	if pack.CanonicalSettlementCreated != nil {
		realTimestamps[models.LeafTypeCanonicalSettlementObservation] = *pack.CanonicalSettlementCreated
		realTimestamps[models.LeafTypeAttachmentDecision] = *pack.CanonicalSettlementCreated
		realTimestamps[models.LeafTypeVarianceDecision] = *pack.CanonicalSettlementCreated
	}
	// FINAL_EVIDENCE_VIEW is always the pack creation time — that's when it was sealed.
	realTimestamps[models.LeafTypeFinalEvidenceView] = pack.CreatedAt

	// Human-readable milestone labels per leaf type.
	leafEvents := map[string]string{
		models.LeafTypeEnvelopeHash:                   "Payment instruction fingerprint recorded",
		models.LeafTypeCanonicalIntentHash:            "Structured payment intent created",
		models.LeafTypeGovernanceDecision:             "Governance and duplicate-risk checks passed",
		models.LeafTypeRawSettlementLine:              "Bank settlement record received",
		models.LeafTypeRawSettlementFile:              "Bank settlement file received via SFTP",
		models.LeafTypeCanonicalSettlementObservation: "Settlement record matched to payment intent using UTR",
		models.LeafTypeAttachmentDecision:             "Match decision created — intent attached to settlement",
		models.LeafTypeVarianceDecision:               "Variance, value-date, and amount checks completed",
		models.LeafTypeBatchAttachmentSummary:         "Batch attachment summary computed across all intents",
		models.LeafTypeBatchVarianceSummary:           "Batch variance summary computed",
		models.LeafTypeCanonicalBatch:                 "Canonical batch record anchored",
		models.LeafTypeFileContentHash:                "Raw file content hash verified and recorded",
		models.LeafTypeFinalEvidenceView:              "Evidence pack compiled and sealed",
	}

	// Stable display order — mirrors the Zord payment lifecycle sequence.
	leafOrder := map[string]int{
		models.LeafTypeEnvelopeHash:                   0,
		models.LeafTypeCanonicalIntentHash:            1,
		models.LeafTypeGovernanceDecision:             2,
		models.LeafTypeRawSettlementLine:              3,
		models.LeafTypeRawSettlementFile:              4,
		models.LeafTypeCanonicalSettlementObservation: 5,
		models.LeafTypeAttachmentDecision:             6,
		models.LeafTypeVarianceDecision:               7,
		models.LeafTypeBatchAttachmentSummary:         8,
		models.LeafTypeBatchVarianceSummary:           9,
		models.LeafTypeCanonicalBatch:                 10,
		models.LeafTypeFileContentHash:                11,
		models.LeafTypeFinalEvidenceView:              99,
	}

	type orderedItem struct {
		order int
		item  models.EvidenceItem
	}
	ordered := make([]orderedItem, 0, len(pack.Items))
	for _, item := range pack.Items {
		o := 50
		if v, ok := leafOrder[item.Type]; ok {
			o = v
		}
		ordered = append(ordered, orderedItem{order: o, item: item})
	}
	sort.Slice(ordered, func(i, j int) bool {
		ti := realTimestamps[ordered[i].item.Type]
		tj := realTimestamps[ordered[j].item.Type]
		if !ti.Equal(tj) {
			return ti.Before(tj)
		}
		return ordered[i].order < ordered[j].order
	})

	events := make([]models.TimelineEvent, 0, len(ordered))
	for i, oi := range ordered {
		ts, hasReal := realTimestamps[oi.item.Type]
		if !hasReal || ts.IsZero() {
			// Fallback: position-based offset from pack creation
			ts = pack.CreatedAt.Add(-time.Duration(len(ordered)-i) * time.Second)
		}
		label, ok := leafEvents[oi.item.Type]
		if !ok {
			label = fmt.Sprintf("Artifact recorded: %s", oi.item.Type)
		}
		events = append(events, models.TimelineEvent{
			Timestamp: ts.UTC(),
			Event:     label,
			NodeID:    oi.item.LeafHash,
		})
	}

	return events
}

// BuildLineageGraph constructs the auditor-facing Merkle DAG (spec §5 Engine B).
// Nodes represent pipeline stages; edges show data provenance direction.
func BuildLineageGraph(pack *models.EvidencePack) models.LineageGraph {
	nodes := make([]models.LineageNode, 0, len(pack.Items)+4)
	edges := make([]models.LineageEdge, 0, len(pack.Items)+4)

	// Node labels — covers both single-intent and batch pack leaf types
	labelOf := map[string]string{
		models.LeafTypeRawSettlementLine:              "Original Payment File",
		models.LeafTypeCanonicalSettlementObservation: "Structured Payment Intent",
		models.LeafTypeGovernanceDecision:             "Governance Check",
		models.LeafTypeRawSettlementFile:              "Original Settlement File",
		models.LeafTypeAttachmentDecision:             "Match Decision",
		models.LeafTypeVarianceDecision:               "Variance Decision",
		models.LeafTypeCanonicalIntentHash:            "Canonical Intent",
		models.LeafTypeEnvelopeHash:                   "Envelope Hash",
		models.LeafTypeFinalEvidenceView:              "Evidence Summary",
		models.LeafTypeBatchAttachmentSummary:         "Batch Attachment Summary",
		models.LeafTypeBatchVarianceSummary:           "Batch Variance Summary",
		models.LeafTypeCanonicalBatch:                 "Canonical Batch",
		models.LeafTypeFileContentHash:                "File Content Hash",
	}

	nodeTypeOf := map[string]string{
		models.LeafTypeRawSettlementLine:              "SOURCE",
		models.LeafTypeRawSettlementFile:              "SOURCE",
		models.LeafTypeEnvelopeHash:                   "SOURCE",
		models.LeafTypeFileContentHash:                "SOURCE",
		models.LeafTypeCanonicalSettlementObservation: "TRANSFORM",
		models.LeafTypeCanonicalIntentHash:            "TRANSFORM",
		models.LeafTypeCanonicalBatch:                 "TRANSFORM",
		models.LeafTypeGovernanceDecision:             "DECISION",
		models.LeafTypeAttachmentDecision:             "DECISION",
		models.LeafTypeVarianceDecision:               "DECISION",
		models.LeafTypeBatchAttachmentSummary:         "DECISION",
		models.LeafTypeBatchVarianceSummary:           "DECISION",
		models.LeafTypeFinalEvidenceView:              "SEAL",
	}

	leafIDByType := make(map[string]string)
	for _, item := range pack.Items {
		nodeID := item.LeafHash
		leafIDByType[item.Type] = nodeID

		label, ok := labelOf[item.Type]
		if !ok {
			label = item.Type
		}
		nType, ok := nodeTypeOf[item.Type]
		if !ok {
			nType = "TRANSFORM"
		}
		nodes = append(nodes, models.LineageNode{
			ID:            nodeID,
			Label:         label,
			NodeType:      nType,
			LeafHash:      item.LeafHash,
			ItemRef:       item.Ref,
			SchemaVersion: item.SchemaVersion,
		})
	}

	// Proof root node
	rootNodeID := "merkle_root"
	nodes = append(nodes, models.LineageNode{
		ID:       rootNodeID,
		Label:    "Proof Root",
		NodeType: "SEAL",
		LeafHash: pack.MerkleRoot,
	})

	maybeEdge := func(fromType, toType, label string) {
		from, fok := leafIDByType[fromType]
		to, tok := leafIDByType[toType]
		if fok && tok {
			edges = append(edges, models.LineageEdge{From: from, To: to, Label: label})
		}
	}

	// Single-intent pack edges
	maybeEdge(models.LeafTypeRawSettlementLine, models.LeafTypeCanonicalSettlementObservation, "canonicalise")
	maybeEdge(models.LeafTypeEnvelopeHash, models.LeafTypeCanonicalIntentHash, "hash intent")
	maybeEdge(models.LeafTypeCanonicalSettlementObservation, models.LeafTypeGovernanceDecision, "policy check")
	maybeEdge(models.LeafTypeCanonicalIntentHash, models.LeafTypeGovernanceDecision, "policy check")
	maybeEdge(models.LeafTypeRawSettlementFile, models.LeafTypeAttachmentDecision, "reconcile")
	maybeEdge(models.LeafTypeCanonicalSettlementObservation, models.LeafTypeAttachmentDecision, "reconcile")
	maybeEdge(models.LeafTypeGovernanceDecision, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeAttachmentDecision, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeVarianceDecision, models.LeafTypeFinalEvidenceView, "")
	// Batch pack edges
	maybeEdge(models.LeafTypeFileContentHash, models.LeafTypeCanonicalBatch, "canonicalise batch")
	maybeEdge(models.LeafTypeRawSettlementFile, models.LeafTypeCanonicalBatch, "canonicalise batch")
	maybeEdge(models.LeafTypeCanonicalBatch, models.LeafTypeBatchAttachmentSummary, "summarise")
	maybeEdge(models.LeafTypeCanonicalBatch, models.LeafTypeBatchVarianceSummary, "summarise")
	maybeEdge(models.LeafTypeBatchAttachmentSummary, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeBatchVarianceSummary, models.LeafTypeFinalEvidenceView, "")

	if fev, ok := leafIDByType[models.LeafTypeFinalEvidenceView]; ok {
		edges = append(edges, models.LineageEdge{From: fev, To: rootNodeID, Label: "seal"})
	}

	return models.LineageGraph{
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
		MerkleRoot:     pack.MerkleRoot,
		Nodes:          nodes,
		Edges:          edges,
	}
}
