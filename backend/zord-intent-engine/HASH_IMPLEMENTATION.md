# Tamper-Evidence Hashes — Implementation Summary

What we built today: every hash from `row hashes.docx` (items 3 onward), each computed as
`SHA-256(JCS_Canonicalize({ hash_type, hash_version, ...fields }))` unless noted otherwise.
`JCS_Canonicalize` is our own `internal/jcs` package — sorted object keys (Go's
`encoding/json` already sorts `map[string]any` keys), no insignificant whitespace, no
HTML-escaping. Equivalent to RFC 8785 for the flat, ASCII-keyed objects we hash here.
No external JCS library was added; `internal/jcs` is dependency-free so both
`internal/canonicalizer` and `internal/models` can import it without a cycle.

## The 9 hashes

| # | Hash | Formula fields | Computed in | Stored in |
|---|------|----------------|-------------|-----------|
| 3 | `canonical_row_hash` | source_row_ref, client_payout_ref, beneficiary_fingerprint, amount_minor, currency, intended_execution_at, payment_rail, invoice_ref | `computeCanonicalRowHash` (intent_service.go) | `payment_intents.canonical_row_hash`, `outbox.canonical_row_hash` |
| 4 | `tokenized_data_hash` | tenant_id, beneficiary_name_token, account_number_token, ifsc_token, vpa_token, email_token, phone_token, tokenization_policy_version — **HMAC-SHA256**, not plain SHA-256 | `computeTokenizedDataHash` | `payment_intents.tokenized_data_hash`, `outbox.tokenized_data_hash` |
| 5 | `business_idempotency_hash` (+ fallback) | preferred: tenant_id, source_system, client_payout_ref, amount_minor, currency. fallback: tenant_id, beneficiary_fingerprint, amount_minor, currency, execution_date, invoice_ref, purpose_code | `computeBusinessIdempotencyKey` | `payment_intents.business_idempotency_key`, `outbox.business_idempotency_key` |
| 6 | `mapping_profile_hash` | profile_id, profile_version, source_system, detected_format, field_mappings, required_fields (sorted), soft_inferable_fields (sorted), field_kind_policy, sensitive_field_policy, normalization_rules, synonym_profile_version | `MappingProfile.ComputeProfileHash` (models) / `computeGenericMappingProfileHash` (fallback) | `payment_intents.mapping_profile_hash`, `outbox.mapping_profile_hash`, `mapping_profiles.profile_hash` |
| 7 | `canonical_payload_manifest_hash` | manifest_schema_version, artifact_id, artifact_version_id, payload_type, canonicalization_version, mapping_profile_hash, row_count, rows[{source_row_ref, canonical_row_hash, amount_minor, currency, business_reference}] | `ComputeFileManifestHash` (canonicalizer), called from `UpdateBatchAggregateConfidence` | `canonical_batches.file_manifest_hash` |
| 8 | `raw_row_leaf_hash` | tenant_id, artifact_id, artifact_version_id, source_row_ref, row_index, raw_row_hash | `computeEvidenceLeafHashes` | `payment_intents.raw_row_evidence_leaf_hash`, `outbox.raw_row_evidence_leaf_hash` |
| 9 | `canonical_row_leaf_hash` | tenant_id, artifact_id, artifact_version_id, source_row_ref, canonical_row_hash | `computeEvidenceLeafHashes` | `payment_intents.canonical_row_evidence_leaf_hash`, `outbox.canonical_row_evidence_leaf_hash` |
| — | `input_facts_hash` (governance) | amount_minor, currency, beneficiary_fingerprint, payment_rail, purpose_code, beneficiary_changed, is_possible_duplicate, daily_total_minor, previous_payment_count | `computeGovernanceHash` | `payment_intents.input_facts_hash`, `outbox.input_facts_hash` |
| — | `governance_decision_hash` | tenant_id, canonical_intent_hash, input_facts_hash, decision, reason_codes, required_approval_level, risk_level — **policy_id/policy_version/policy_hash deliberately excluded** (no real policy engine yet) | `computeGovernanceHash` + `recomputeGovernanceDecisionHash` | `payment_intents.governance_hash`, `outbox.governance_hash` |

Rows 3/7/governance_decision were **existing fields we touched in place** (same column,
new formula). Everything else is **new** — additive columns, nothing else disturbed.

## Notable design points

- **`governance_decision_hash` is computed twice.** At construction time `canonical_intent_hash`
  is still `""` (the WORM chain hash doesn't exist until after the S3 snapshot step). Once
  `canonical_hash` is known, `recomputeGovernanceDecisionHash` re-derives it and
  `UpdateSnapshotRefs` persists both in the same round-trip.
- **`canonical_payload_manifest_hash` rows are sorted** by `source_row_ref`, then
  `business_reference`, then `canonical_row_hash` — not by insertion/`source_row_num`, since
  row order has no business meaning for the manifest.
- **`mapping_profile_hash` is never left blank.** If no registered/global profile resolves for
  a request, `computeGenericMappingProfileHash` builds the hash from the NIR's actual
  per-field `source_path`s instead. Separately, `SeedGlobalMappingProfilesFromFile` now upserts
  `global_profiles.json` (TALLY, SAP, ...) into `mapping_profiles` at startup, so those built-ins
  resolve as real DB-backed profiles with a persisted hash instead of only an in-memory fallback.
- **`tokenized_data_hash`'s key is derived, not stored.** `HMAC-SHA256(TOKENIZED_DATA_HASH_MASTER_SECRET, tenant_id)`
  gives a per-tenant key from one master secret (new env var, added to `.env` for local dev —
  set the real value via your secrets manager for other environments).
- **Placeholders, populated by upstream services later, not derived here:** `source_row_ref`,
  `invoice_ref`, `artifact_id`, `artifact_version_id` (row_index instead uses the
  already-derived `source_row_num`). `beneficiary_changed` and `previous_payment_count` also
  have no upstream signal yet and are hard-coded `false`/`0`.
- **Two formulas change stored values for new rows going forward:** `business_idempotency_key`
  and `mapping_profile_hash` now use the new formulas per your instruction to replace them in
  place — old DB rows keep their old-formula values until re-touched.

## Files

- `internal/jcs/jcs.go` — shared canonicalizer + SHA-256/HMAC helpers (new)
- `internal/canonicalizer/row_hash.go` — canonical_row_hash, manifest hash (rewritten)
- `internal/canonicalizer/governance_hash.go` — input_facts_hash, governance_decision_hash (new)
- `internal/canonicalizer/business_idempotency_hash.go` — preferred + fallback (new)
- `internal/canonicalizer/tokenized_data_hash.go` — HMAC + key derivation (new)
- `internal/canonicalizer/evidence_leaf_hash.go` — raw/canonical row leaf hashes (new)
- `internal/models/mapping_profile.go` — `ComputeProfileHash` (rewritten)
- `internal/services/intent_service.go` — all wiring, `computeGenericMappingProfileHash`
- `internal/services/profile_resolver.go` — `SeedGlobalMappingProfilesFromFile`
- `internal/persistence/payment_intent_repo.go` — INSERT column lists, `UpdateBatchAggregateConfidence`, `UpdateSnapshotRefs`
- Migrations: `20260714090000_add_canonical_row_hash_and_file_manifest_hash.sql`,
  `20260714100000_add_row_hash_to_outbox.sql`,
  `20260714110000_add_governance_tokenized_evidence_hashes.sql`
