package models

// EventVersionV1 / SchemaVersionV1 are this repo's local copy of the canonical
// version strings defined in backend/shared/zord-event-contract/spec.json
// (INT-07). Kept as local constants rather than a shared Go import because
// each service's Docker build context only sees its own repo directory --
// see spec.json's sibling SPEC.md for why. testing/audittests's
// TestINT07_LocalConstantsMatchSpec asserts these stay equal to the spec.
const EventVersionV1 = "v1"
const SchemaVersionV1 = "v1"
