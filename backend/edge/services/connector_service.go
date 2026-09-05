package services

import (
	"database/sql"
	"fmt"
	"time"

	"zord-edge/db"
	"zord-edge/model"

	"github.com/google/uuid"
)

// ConnectorService handles connector CRUD and secret resolution.
type ConnectorService struct{}

// NewConnectorService creates a new ConnectorService.
func NewConnectorService() *ConnectorService {
	return &ConnectorService{}
}

// CreateConnector saves a new Razorpay connector configuration.
// It stores secret references, not raw secret values.
func (s *ConnectorService) CreateConnector(
	tenantID string,
	provider string,
	mode string,
	apiKeyRef string,
	apiSecretRef string,
) (*model.Connector, error) {
	tenantUUID, err := uuid.Parse(tenantID)
	if err != nil {
		return nil, fmt.Errorf("invalid tenant ID: %w", err)
	}
	connectorID := fmt.Sprintf("con_%s_%s_%s", provider, mode, uuid.New().String()[:8])

	now := time.Now().UTC()
	conn := &model.Connector{
		ID:           uuid.New(),
		TenantID:     tenantUUID,
		Provider:     provider,
		ConnectorID:  connectorID,
		ProviderMode: mode,
		ApiKeyRef:    &apiKeyRef,
		ApiSecretRef: &apiSecretRef,
		Active:       true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	_, err = db.DB.Exec(`
		INSERT INTO connectors (
			id, tenant_id, provider, connector_id,
			provider_mode, api_key_ref, api_secret_ref,
			active, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`,
		conn.ID, conn.TenantID, conn.Provider, conn.ConnectorID,
		conn.ProviderMode, conn.ApiKeyRef, conn.ApiSecretRef,
		conn.Active, conn.CreatedAt, conn.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create connector: %w", err)
	}

	return conn, nil
}

// GetConnector retrieves a connector by ID and tenant.
func (s *ConnectorService) GetConnector(tenantID string, connectorID string) (*model.Connector, error) {
	var conn model.Connector
	err := db.DB.QueryRow(`
		SELECT id, tenant_id, provider, connector_id,
		       provider_mode, api_key_ref, api_secret_ref,
		       active, last_health_check_at, last_health_status,
		       last_health_error_code, created_at, updated_at
		FROM connectors
		WHERE id = $1 AND tenant_id = $2
	`, connectorID, tenantID).Scan(
		&conn.ID, &conn.TenantID, &conn.Provider, &conn.ConnectorID,
		&conn.ProviderMode, &conn.ApiKeyRef, &conn.ApiSecretRef,
		&conn.Active, &conn.LastHealthCheckAt, &conn.LastHealthStatus,
		&conn.LastHealthErrorCode, &conn.CreatedAt, &conn.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("connector not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get connector: %w", err)
	}
	return &conn, nil
}

// UpdateHealthStatus updates the health check fields after a connection test.
func (s *ConnectorService) UpdateHealthStatus(
	connectorID string,
	tenantID string,
	status string,
	errorCode string,
) error {
	now := time.Now().UTC()
	_, err := db.DB.Exec(`
		UPDATE connectors
		SET last_health_check_at = $1,
		    last_health_status = $2,
		    last_health_error_code = NULLIF($3, ''),
		    updated_at = $4
		WHERE id = $5 AND tenant_id = $6
	`, now, status, errorCode, now, connectorID, tenantID)
	if err != nil {
		return fmt.Errorf("failed to update connector health: %w", err)
	}
	return nil
}

// ListConnectors returns all connectors for a tenant.
func (s *ConnectorService) ListConnectors(tenantID string) ([]model.Connector, error) {
	rows, err := db.DB.Query(`
		SELECT id, tenant_id, provider, connector_id,
		       provider_mode, api_key_ref, active,
		       last_health_check_at, last_health_status,
		       last_health_error_code, created_at, updated_at
		FROM connectors
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to list connectors: %w", err)
	}
	defer rows.Close()

	var connectors []model.Connector
	for rows.Next() {
		var conn model.Connector
		err := rows.Scan(
			&conn.ID, &conn.TenantID, &conn.Provider, &conn.ConnectorID,
			&conn.ProviderMode, &conn.ApiKeyRef, &conn.Active,
			&conn.LastHealthCheckAt, &conn.LastHealthStatus,
			&conn.LastHealthErrorCode, &conn.CreatedAt, &conn.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan connector: %w", err)
		}
		connectors = append(connectors, conn)
	}
	return connectors, nil
}

// ToStatusResponse safely converts a Connector to an API response without secrets.
func ToStatusResponse(conn *model.Connector) model.ConnectorStatusResponse {
	return model.ConnectorStatusResponse{
		ID:                  conn.ID,
		Provider:            conn.Provider,
		ProviderMode:        conn.ProviderMode,
		Status:              string(model.ConnectorStatusActive),
		LastHealthCheckAt:   conn.LastHealthCheckAt,
		LastHealthStatus:    conn.LastHealthStatus,
		LastHealthErrorCode: conn.LastHealthErrorCode,
		CreatedAt:           conn.CreatedAt,
	}
}
