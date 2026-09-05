package models

import "time"

type FinalityCertificate struct {
	ContractID  string    `json:"contract_id"`
	FinalState  string    `json:"final_state"`
	Confidence  int       `json:"confidence"`
	InputHashes string    `json:"input_hashes"`
	RuleID      string    `json:"rule_id"`
	Signature   string    `json:"signature"`
	CreatedAt   time.Time `json:"created_at"`
}
