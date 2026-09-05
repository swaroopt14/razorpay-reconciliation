package models

import "time"

type TokenRecord struct {
	TokenID              string
	TenantID             string
	Kind                 string
	Ciphertext           []byte
	Nonce                []byte
	EncryptionKeyID      string
	KeyVersion           int
	Status               string
	CreatedAt            time.Time
	Actor                string // who requested tokenization
	TraceID              string // trace ID from caller
	NormalizationVersion string // TOK-08: which normalization ruleset produced this token_id
	SecretVersion        int    // TOK-08: which TOKEN_SECRET version produced this token_id
}
