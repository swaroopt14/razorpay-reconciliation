package model

import (
	"time"

	"github.com/google/uuid"
)

// request payload
type MerchantRequest struct {
	Name string `json:"name" binding:"required"`
}

// DB model
type Tenant struct {
	TenantID   uuid.UUID `db:"tenant_id"`
	TenantName string    `db:"tenant_name"`
	KeyPrefix  string    `db:"key_prefix"`
	KeyHash    string    `db:"key_hash"`
	IsActive   bool      `db:"is_active"`
	CreatedAt  time.Time `db:"created_at"`
}
