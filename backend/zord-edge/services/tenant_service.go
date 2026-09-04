package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zord-edge/auth/workspacecode"
)

// ----- RESPONSE STRUCTS -----
// These define the exact JSON shape the frontend expects.
// The frontend's BackendTenant interface expects:
//   { tenant_id, tenant_name, workspace_code, status: "ACTIVE"|"DISABLED", created_at }

type TenantResponse struct {
	TenantID      string `json:"tenant_id"`
	TenantName    string `json:"tenant_name"`
	WorkspaceCode string `json:"workspace_code"`
	Status        string `json:"status"`     // "ACTIVE" or "DISABLED" — mapped from is_active boolean
	CreatedAt     string `json:"created_at"` // RFC3339 format
}

type TenantListResponse struct {
	Items      []TenantResponse `json:"items"`
	Pagination PaginationInfo   `json:"pagination"`
}

// type PaginationInfo struct {
// 	Page     int `json:"page"`
// 	PageSize int `json:"page_size"`
// 	Total    int `json:"total"`
// }

// ----- LIST TENANTS -----
// Called by handler for GET /v1/tenants?page=1&page_size=50&status=ACTIVE
//
// Why dynamic WHERE: The frontend allows filtering by status (ACTIVE/DISABLED).
// We convert the frontend's status string to the DB's is_active boolean.
//
// Why COUNT + LIMIT/OFFSET: The frontend needs total count for pagination controls
// (e.g., "Showing 1-50 of 120 tenants"). We run a count query first, then the
// paginated data query — same pattern used in zord-intent-engine's IntentQueryRepo.

func ListTenants(ctx context.Context, db *sql.DB, page, pageSize int, statusFilter string) (*TenantListResponse, error) {
	// Build dynamic WHERE clause based on filters
	var conditions []string
	var args []interface{}
	argPos := 1

	if statusFilter != "" {
		switch strings.ToUpper(statusFilter) {
		case "ACTIVE":
			conditions = append(conditions, fmt.Sprintf("is_active = $%d", argPos))
			args = append(args, true)
			argPos++
		case "DISABLED":
			conditions = append(conditions, fmt.Sprintf("is_active = $%d", argPos))
			args = append(args, false)
			argPos++
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Step A: Get total count (needed for pagination in frontend)
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM tenants %s", whereClause)
	var total int
	if err := db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count tenants: %w", err)
	}

	// Step B: Fetch the actual page of data
	offset := (page - 1) * pageSize

	dataQuery := fmt.Sprintf(`
		SELECT tenant_id, tenant_name, key_prefix, is_active, created_at
		FROM tenants
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argPos, argPos+1)

	args = append(args, pageSize, offset)

	rows, err := db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch tenants: %w", err)
	}
	defer rows.Close()

	// Step C: Scan rows and transform is_active → status string
	var tenants []TenantResponse
	for rows.Next() {
		var tenantID string
		var tenantName string
		var keyPrefix string
		var isActive bool
		var createdAt time.Time

		if err := rows.Scan(&tenantID, &tenantName, &keyPrefix, &isActive, &createdAt); err != nil {
			return nil, fmt.Errorf("failed to scan tenant row: %w", err)
		}

		status := "DISABLED"
		if isActive {
			status = "ACTIVE"
		}

		tenants = append(tenants, TenantResponse{
			TenantID:      tenantID,
			TenantName:    tenantName,
			WorkspaceCode: workspacecode.FromKeyPrefix(keyPrefix),
			Status:        status,
			CreatedAt:     createdAt.Format(time.RFC3339),
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating tenant rows: %w", err)
	}

	// Return empty array (not null) when no results — frontend expects []
	if tenants == nil {
		tenants = []TenantResponse{}
	}

	return &TenantListResponse{
		Items: tenants,
		Pagination: PaginationInfo{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}, nil
}

// ----- GET TENANT BY ID -----
// Called by handler for GET /v1/tenants/:tenant_id
//
// Returns nil (not error) when tenant doesn't exist, so the handler
// can return a proper 404 response — same pattern as intent-engine's GetIntentByID.

func GetTenantByID(ctx context.Context, db *sql.DB, tenantID string) (*TenantResponse, error) {
	query := `
		SELECT tenant_id, tenant_name, key_prefix, is_active, created_at
		FROM tenants
		WHERE tenant_id = $1
	`

	var tid string
	var tenantName string
	var keyPrefix string
	var isActive bool
	var createdAt time.Time

	err := db.QueryRowContext(ctx, query, tenantID).Scan(&tid, &tenantName, &keyPrefix, &isActive, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil // Not found — handler will return 404
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch tenant: %w", err)
	}

	status := "DISABLED"
	if isActive {
		status = "ACTIVE"
	}

	return &TenantResponse{
		TenantID:      tid,
		TenantName:    tenantName,
		WorkspaceCode: workspacecode.FromKeyPrefix(keyPrefix),
		Status:        status,
		CreatedAt:     createdAt.Format(time.RFC3339),
	}, nil
}
