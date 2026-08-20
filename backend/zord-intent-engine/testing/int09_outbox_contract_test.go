package audittests

// INT-09 regression coverage: "Keep the 91-column outbox stable but add an
// automated contract inventory."
//
// Unlike INT-01/06/10, this isn't a live-bug fix — outbox's INSERT/lease
// queries worked correctly before this change. The risk the audit item
// describes is future: "manual changes can break INSERT/lease/Relay
// mapping" because the column list, its $N placeholders, and its Go args
// were each hand-typed 2-4 times across Save/SaveBatch/LeaseOutboxBatch,
// with nothing but a human-written "// $N" comment tying them together.
//
// The fix has two parts:
//  1. internal/persistence/outbox_insert_contract.go and
//     outbox_lease_contract.go now hold ONE canonical column list each
//     (OutboxInsertColumns, outboxLeaseColumns) that Save, SaveBatch, and
//     LeaseOutboxBatch all generate their query text and Scan/arg lists
//     from — verified end-to-end against a real, freshly-migrated Postgres
//     instance (Save, SaveBatch, and LeaseOutboxBatch all executed
//     successfully and round-tripped real data correctly; see this
//     package's test report for the captured session).
//  2. testing/outbox_contract_inventory.json is a machine-readable,
//     checked-in snapshot of the real schema (parsed from db/migrations/
//     *.sql — cross-checked byte-for-byte, same 91 columns in the same
//     order, against a live database) plus the Go code's own canonical
//     lists (parsed directly from outbox_insert_contract.go /
//     outbox_lease_contract.go — not re-typed a third time). Regenerate it
//     with testing/generate_outbox_contract_inventory.py whenever the
//     schema legitimately changes.
//
// These tests are the ongoing, automated half of the contract: they run on
// every `go test ./...` and fail the moment the Go code and the checked-in
// inventory diverge, or a deprecated column reappears anywhere the app
// writes or reads.
//
// Run with: go test ./testing/... -run TestINT09 -v

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

type outboxContractInventory struct {
	TotalColumns                 int      `json:"total_columns"`
	Columns                      []struct {
		Name       string `json:"name"`
		Deprecated bool   `json:"deprecated"`
	} `json:"columns"`
	DeprecatedColumns          []string `json:"deprecated_columns"`
	AppManagedInsertColumns    []string `json:"app_managed_insert_columns"`
	AppManagedInsertColumnCount int     `json:"app_managed_insert_column_count"`
	LeaseExposedColumns        []string `json:"lease_exposed_columns"`
	LeaseExposedColumnCount    int      `json:"lease_exposed_column_count"`
}

func loadOutboxContractInventory(t *testing.T) outboxContractInventory {
	t.Helper()
	data, err := os.ReadFile("outbox_contract_inventory.json")
	if err != nil {
		t.Fatalf("failed to read outbox_contract_inventory.json (run generate_outbox_contract_inventory.py first): %v", err)
	}
	var inv outboxContractInventory
	if err := json.Unmarshal(data, &inv); err != nil {
		t.Fatalf("failed to parse outbox_contract_inventory.json: %v", err)
	}
	return inv
}

// TestINT09_InventoryReportsExpectedColumnCount pins the outbox table's
// real column count. Was 91 at INT-09's original writing; deliberately
// updated to 92 for the addition of canonical_payload_hash (a fix, not an
// audit ticket -- a Postgres GENERATED column, see
// internal/models/outbox_model.go's CanonicalPayloadHash doc comment),
// following this test's own documented update procedure below. The
// 91-column value was itself cross-checked byte-for-byte (same names, same
// order) against a live, freshly-migrated Postgres instance during
// development — see the testing report for that captured session.
func TestINT09_InventoryReportsExpectedColumnCount(t *testing.T) {
	const wantColumns = 92
	inv := loadOutboxContractInventory(t)
	if inv.TotalColumns != wantColumns {
		t.Fatalf("outbox_contract_inventory.json total_columns = %d, want %d -- either the schema genuinely changed (re-run generate_outbox_contract_inventory.py and update this test deliberately) or something is wrong", inv.TotalColumns, wantColumns)
	}
	if len(inv.Columns) != wantColumns {
		t.Fatalf("inventory columns list has %d entries, want %d", len(inv.Columns), wantColumns)
	}
}

// TestINT09_InsertColumnsMatchInventory proves persistence.OutboxInsertColumns
// (the single source of truth Save/SaveBatch build their query from) is
// exactly what the checked-in inventory says the app should be writing —
// catches both "someone added a column to one but not the other" and
// "someone edited OutboxInsertColumns without regenerating the inventory".
func TestINT09_InsertColumnsMatchInventory(t *testing.T) {
	inv := loadOutboxContractInventory(t)
	if len(persistence.OutboxInsertColumns) != inv.AppManagedInsertColumnCount {
		t.Fatalf("persistence.OutboxInsertColumns has %d columns, inventory says %d",
			len(persistence.OutboxInsertColumns), inv.AppManagedInsertColumnCount)
	}
	if len(persistence.OutboxInsertColumns) != len(inv.AppManagedInsertColumns) {
		t.Fatalf("length mismatch: OutboxInsertColumns=%d inventory list=%d",
			len(persistence.OutboxInsertColumns), len(inv.AppManagedInsertColumns))
	}
	for i, col := range persistence.OutboxInsertColumns {
		if col != inv.AppManagedInsertColumns[i] {
			t.Fatalf("column %d: OutboxInsertColumns=%q inventory=%q (order or name drift)", i, col, inv.AppManagedInsertColumns[i])
		}
	}
	t.Logf("CONFIRMED: %d INSERT columns match the checked-in inventory exactly, in order.", len(persistence.OutboxInsertColumns))
}

// TestINT09_LeaseColumnsMatchInventory does the same cross-check for the
// lease response's column list.
func TestINT09_LeaseColumnsMatchInventory(t *testing.T) {
	inv := loadOutboxContractInventory(t)
	aliases := persistence.OutboxLeaseColumnAliases()
	if len(aliases) != inv.LeaseExposedColumnCount {
		t.Fatalf("persistence.OutboxLeaseColumnAliases() has %d columns, inventory says %d",
			len(aliases), inv.LeaseExposedColumnCount)
	}
	for i, col := range aliases {
		if col != inv.LeaseExposedColumns[i] {
			t.Fatalf("column %d: lease alias=%q inventory=%q (order or name drift)", i, col, inv.LeaseExposedColumns[i])
		}
	}
	t.Logf("CONFIRMED: %d lease columns match the checked-in inventory exactly, in order.", len(aliases))
}

// TestINT09_InsertArgsCountMatchesColumnCount proves, by actually calling
// the real OutboxInsertArgs with a populated sample, that the number of
// values it returns equals len(OutboxInsertColumns) -- the single condition
// that guarantees Save/SaveBatch's generated query (one $N placeholder per
// column) never receives the wrong number of bind arguments.
func TestINT09_InsertArgsCountMatchesColumnCount(t *testing.T) {
	sample := models.OutboxEvent{} // zero-value is fine -- we're only counting, not validating content
	args := persistence.OutboxInsertArgs(sample)
	if len(args) != len(persistence.OutboxInsertColumns) {
		t.Fatalf("OutboxInsertArgs returned %d values, OutboxInsertColumns has %d entries -- INSERT would send the wrong number of $N placeholders' worth of data",
			len(args), len(persistence.OutboxInsertColumns))
	}
	t.Logf("CONFIRMED: OutboxInsertArgs returns exactly %d values, matching OutboxInsertColumns.", len(args))
}

// TestINT09_DeprecatedColumnsNeverInInsertOrLease is the direct test for the
// audit's acceptance test: "reintroduction of dead aggregate fields" must
// be caught. It checks the REAL, current OutboxInsertColumns and lease
// column lists, not a cached copy.
func TestINT09_DeprecatedColumnsNeverInInsertOrLease(t *testing.T) {
	deprecated := make(map[string]bool, len(persistence.OutboxDeprecatedColumns))
	for _, d := range persistence.OutboxDeprecatedColumns {
		deprecated[d] = true
	}
	if len(deprecated) != 5 {
		t.Fatalf("expected exactly 5 deprecated columns (R-10), got %d: %v", len(deprecated), persistence.OutboxDeprecatedColumns)
	}

	for _, col := range persistence.OutboxInsertColumns {
		if deprecated[col] {
			t.Fatalf("REGRESSION: deprecated column %q was reintroduced into OutboxInsertColumns -- the app must never write to an R-10-deprecated batch-aggregate column", col)
		}
	}
	for _, col := range persistence.OutboxLeaseColumnAliases() {
		if deprecated[col] {
			t.Fatalf("REGRESSION: deprecated column %q was reintroduced into the lease response", col)
		}
	}
	t.Logf("CONFIRMED: none of the 5 deprecated columns (%v) appear in the INSERT or lease column lists.", persistence.OutboxDeprecatedColumns)
}

// TestINT09_OutboxEventStructNeverHasDeprecatedFields is the same check one
// layer up: models.OutboxEvent itself (the Go struct every code path in
// this service reads/writes through) must never grow a field tagged with
// one of the deprecated column names, via reflection over its real `db`
// struct tags -- not a hand-maintained list of "fields we promise not to
// add".
func TestINT09_OutboxEventStructNeverHasDeprecatedFields(t *testing.T) {
	deprecated := make(map[string]bool, len(persistence.OutboxDeprecatedColumns))
	for _, d := range persistence.OutboxDeprecatedColumns {
		deprecated[d] = true
	}

	typ := reflect.TypeOf(models.OutboxEvent{})
	found := []string{}
	for i := 0; i < typ.NumField(); i++ {
		dbTag := typ.Field(i).Tag.Get("db")
		if dbTag != "" && deprecated[dbTag] {
			found = append(found, typ.Field(i).Name+" (db:\""+dbTag+"\")")
		}
	}
	if len(found) > 0 {
		t.Fatalf("REGRESSION: models.OutboxEvent has field(s) tagged with a deprecated R-10 column: %v", found)
	}
	t.Logf("CONFIRMED: reflection over models.OutboxEvent's %d fields found zero deprecated-column db tags.", typ.NumField())
}

// TestINT09_NoInsertColumnIsMissingFromRealSchema is a lighter-weight,
// no-live-DB version of the Postgres verification performed during
// development: every column OutboxInsertColumns claims to write must
// actually exist in the checked-in schema inventory (parsed from
// db/migrations/*.sql). This would catch a typo'd column name that
// real Postgres would also reject, without needing a live database in CI.
func TestINT09_NoInsertColumnIsMissingFromRealSchema(t *testing.T) {
	inv := loadOutboxContractInventory(t)
	schemaCols := make(map[string]bool, len(inv.Columns))
	for _, c := range inv.Columns {
		schemaCols[c.Name] = true
	}
	for _, col := range persistence.OutboxInsertColumns {
		if !schemaCols[col] {
			t.Fatalf("OutboxInsertColumns references %q, which is not in the outbox_contract_inventory.json schema snapshot -- typo, or schema drifted without regenerating the inventory", col)
		}
	}
	for _, col := range persistence.OutboxLeaseColumnAliases() {
		if col == "corridor_id" {
			continue // computed `NULL AS corridor_id` literal in the lease query, not a real table column
		}
		if !schemaCols[col] {
			t.Fatalf("lease column %q is not in the outbox_contract_inventory.json schema snapshot", col)
		}
	}
	t.Log("CONFIRMED: every INSERT and lease column name exists in the real schema snapshot.")
}
