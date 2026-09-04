package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

func HandleDispatchEvent(msg []byte) error {
	var event models.DispatchEvent
	ctx := context.Background()
	if err := json.Unmarshal(msg, &event); err != nil {
		return err
	}

	switch event.EventType {
	case "DispatchCreated":
		var payload models.DispatchCreatedPayload
		json.Unmarshal(event.Payload, &payload)
		log.Println("Received Dispatch Event")
		return handleDispatchCreated(ctx, payload, event)

	case "AttemptSent":
		var payload models.AttemptSentPayload
		json.Unmarshal(event.Payload, &payload)
		log.Println("Received Attempt Sent Event")
		return handleAttemptSent(ctx, payload)

	case "ProviderAcked":
		var payload models.ProviderAckedPayload
		json.Unmarshal(event.Payload, &payload)
		log.Println("Received Provider Ack Event")
		return handleProviderAcked(ctx, payload)

	}
	return nil
}

func handleDispatchCreated(ctx context.Context, payload models.DispatchCreatedPayload, data models.DispatchEvent) error {
	log.Println("DispatchCreated Event Processing started")
	if payload.DispatchID == "" {
		return errors.New("dispatch_id missing in DispatchCreated Event")
	}
	if data.ContractID == "" || data.IntentID == "" || data.TenantID == "" {
		return errors.New("invalid dispatch event metadata")
	}

	carriersJSON, err := json.Marshal(payload.CorrelationCarriers)
	if err != nil {
		return err
	}

	var providerRefHashes []string
	if payload.CorrelationCarriers.ReferenceID != "" {
		h := sha256.Sum256([]byte(payload.CorrelationCarriers.ReferenceID))
		providerRefHashes = append(providerRefHashes, hex.EncodeToString(h[:]))
	}
	if payload.CorrelationCarriers.Narration != "" {
		h := sha256.Sum256([]byte(payload.CorrelationCarriers.Narration))
		providerRefHashes = append(providerRefHashes, hex.EncodeToString(h[:]))
	}

	_, err = db.DB.ExecContext(ctx, `INSERT INTO dispatch_index (
		dispatch_id,
		contract_id,
		intent_id,
		tenant_id,
		trace_id,
		connector_id,
		corridor_id,
		correlation_carriers,
		provider_ref_hashes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		payload.DispatchID,
		data.ContractID,
		data.IntentID,
		data.TenantID,
		data.TraceID,
		payload.ConnectorID,
		payload.CorridorID,
		carriersJSON,
		providerRefHashes,
	)
	log.Println("Dispatch index inserted")
	return err

}

func handleAttemptSent(ctx context.Context, payload models.AttemptSentPayload) error {
	log.Println("AttemptSent Event Processing started")
	if payload.DispatchID == "" {
		return errors.New("dispatch_id missing in AttemptSent Event")
	}
	carriersJSON, err := json.Marshal(payload.CorrelationCarriers)
	if err != nil {
		return err
	}
	res, err := db.DB.ExecContext(ctx, `UPDATE dispatch_index SET attempt_count=$1,correlation_carriers=$2 WHERE dispatch_id=$3`,
		payload.AttemptCount, carriersJSON, payload.DispatchID,
	)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("dispatch_id not found in dispatch_index")
	}
	return nil
}

func handleProviderAcked(ctx context.Context, payload models.ProviderAckedPayload) error {
	log.Println("ProviderAcked Event Processing started")
	if payload.DispatchID == "" {
		return errors.New("dispatch_id missing in ProviderAcked Event")
	}
	res, err := db.DB.ExecContext(ctx, `UPDATE dispatch_index SET provider_attempt_id=$1 WHERE dispatch_id=$2`,
		payload.ProviderAttemptID, payload.DispatchID,
	)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("dispatch_id not found in dispatch_index")
	}
	return nil
}
