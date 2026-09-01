package imports

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

func testdata(t *testing.T, parts ...string) []byte {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "../../../../testdata"))
	b, err := os.ReadFile(filepath.Join(append([]string{root}, parts...)...))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestMapReconLineTypesPreserveFeeTaxUTR(t *testing.T) {
	raw := testdata(t, "razorpay", "settlements", "valid_combined_recon.json")
	out, err := ParseSettlementJSON(raw, HashBytes(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 4 {
		t.Fatalf("rows=%d", len(out.Rows))
	}
	seen := map[string]razorpay.NeutralSettlementLine{}
	for _, r := range out.Rows {
		if r.Status != RowValid || r.Settlement == nil {
			t.Fatalf("%+v", r)
		}
		seen[r.Settlement.LineType] = *r.Settlement
	}
	pay := seen["payment"]
	if pay.FeeMinor != 2900 || pay.TaxMinor != 522 || pay.CreditMinor != 96578 || pay.UTR != "utr_001" || pay.SettlementID != "setl_001" {
		t.Fatalf("%+v", pay)
	}
	if seen["refund"].DebitMinor != 40000 || seen["transfer"].DebitMinor != 10000 || seen["adjustment"].CreditMinor != 500 {
		t.Fatalf("%+v", seen)
	}
}

func TestParseSettlementCSVValid(t *testing.T) {
	raw := testdata(t, "razorpay", "settlements", "valid_combined_recon.csv")
	out, err := ParseSettlementCSV(raw, HashBytes(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 4 {
		t.Fatalf("%d", len(out.Rows))
	}
}

func TestUnsupportedLineType(t *testing.T) {
	raw := testdata(t, "razorpay", "settlements", "unsupported_line_type.csv")
	out, err := ParseSettlementCSV(raw, HashBytes(raw))
	if err != nil {
		t.Fatal(err)
	}
	if out.Rows[0].ErrorCode != ErrUnsupportedLineType {
		t.Fatalf("%s", out.Rows[0].ErrorCode)
	}
}

func TestMissingSettlementColumn(t *testing.T) {
	_, err := ParseSettlementCSV(testdata(t, "razorpay", "settlements", "missing_columns.csv"), "x")
	if err == nil {
		t.Fatal("expected fatal")
	}
}

func TestInvalidCurrencyAndAmountAndTimestamp(t *testing.T) {
	for _, f := range []struct{ name, code string }{
		{"invalid_currency.csv", ErrInvalidCurrency},
		{"invalid_amount.csv", ErrInvalidAmount},
		{"malformed_timestamp.csv", ErrInvalidTimestamp},
	} {
		out, err := ParseSettlementCSV(testdata(t, "razorpay", "settlements", f.name), "h")
		if err != nil {
			t.Fatal(err)
		}
		if out.Rows[0].ErrorCode != f.code {
			t.Fatalf("%s got %s", f.name, out.Rows[0].ErrorCode)
		}
	}
}

func TestDuplicateSettlementRows(t *testing.T) {
	raw := testdata(t, "razorpay", "settlements", "duplicate_rows.csv")
	out, _ := ParseSettlementCSV(raw, HashBytes(raw))
	if out.Rows[0].RowHash != out.Rows[1].RowHash {
		t.Fatal("expected same hash")
	}
}

func TestBankParseValidAndPartial(t *testing.T) {
	raw := testdata(t, "razorpay", "bank", "valid_bank_statement.csv")
	rows, _, err := ParseBankCSV(raw, BankOptions{AccountID: "acc1", AmountUnit: "paise", Currency: "INR"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Bank.CreditMinor != 96578 || rows[0].Bank.UTR != "utr_001" {
		t.Fatalf("%+v", rows[0])
	}
	if rows[0].Bank.SourceRowNumber != 1 || rows[0].Bank.Description == "" {
		t.Fatal("row number/description")
	}
	if rows[0].Bank.NormalizedDescription != strings.ToUpper(strings.Join(strings.Fields(rows[0].Bank.Description), " ")) {
		t.Fatalf("norm %s", rows[0].Bank.NormalizedDescription)
	}

	raw = testdata(t, "razorpay", "bank", "partial_errors.csv")
	rows, _, err = ParseBankCSV(raw, BankOptions{AccountID: "acc1", AmountUnit: "paise", Currency: "INR"})
	if err != nil {
		t.Fatal(err)
	}
	if rows[0].Status != RowAcceptedWithoutValidUTR || rows[1].Status != RowValid {
		t.Fatalf("%s %s", rows[0].Status, rows[1].Status)
	}
}

func TestBankRejects(t *testing.T) {
	_, _, err := ParseBankCSV(testdata(t, "razorpay", "bank", "missing_columns.csv"), BankOptions{})
	if err == nil {
		t.Fatal("missing columns")
	}
	rows, _, _ := ParseBankCSV(testdata(t, "razorpay", "bank", "wrong_units.csv"), BankOptions{AccountID: "a", AmountUnit: "paise"})
	if rows[0].ErrorCode != ErrWrongAmountUnit {
		t.Fatalf("%s", rows[0].ErrorCode)
	}
	rows, _, _ = ParseBankCSV(testdata(t, "razorpay", "bank", "invalid_currency.csv"), BankOptions{AccountID: "a", AmountUnit: "paise", Currency: "INR"})
	if rows[0].ErrorCode != ErrCurrencyMismatch {
		t.Fatalf("%s", rows[0].ErrorCode)
	}
	rows, _, _ = ParseBankCSV(testdata(t, "razorpay", "bank", "malformed_timestamp.csv"), BankOptions{AccountID: "a", AmountUnit: "paise"})
	if rows[0].ErrorCode != ErrInvalidDate {
		t.Fatalf("%s", rows[0].ErrorCode)
	}
	rows, _, _ = ParseBankCSV(testdata(t, "razorpay", "bank", "duplicate_rows.csv"), BankOptions{AccountID: "a", AmountUnit: "paise"})
	if rows[1].ErrorCode != ErrDuplicateRow {
		t.Fatalf("%s", rows[1].ErrorCode)
	}
}

func TestRupeesToPaise(t *testing.T) {
	csv := "value_date,credit,currency\n2026-08-30,965.78,INR\n"
	rows, _, err := ParseBankCSV([]byte(csv), BankOptions{AccountID: "a", AmountUnit: "rupees", Currency: "INR"})
	if err != nil || rows[0].Bank.CreditMinor != 96578 {
		t.Fatalf("%v %+v", err, rows)
	}
}

func TestImportLifecycleNoMatcher(t *testing.T) {
	store := NewMemoryStore()
	svc := NewService(store)
	raw := testdata(t, "razorpay", "bank", "valid_bank_statement.csv")
	imp, err := svc.Upload(context.Background(), UploadInput{
		TenantID: "11111111-1111-1111-1111-111111111111", AccountID: "acc1",
		ImportType: TypeBankCSV, FileName: "b.csv", Payload: raw,
	})
	if err != nil {
		t.Fatal(err)
	}
	imp, _, err = svc.Validate(context.Background(), imp.TenantID, imp.ID, ValidateRequest{AmountUnit: "paise", Currency: "INR"})
	if err != nil {
		t.Fatal(err)
	}
	imp, err = svc.Commit(context.Background(), imp.TenantID, imp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if imp.Status != StatusCommitted {
		t.Fatalf("%s", imp.Status)
	}
	sum := imp.ToSummary(nil)
	if sum.Message != CopyBankImported || strings.Contains(strings.ToLower(sum.Message), "matched") {
		t.Fatalf("%s", sum.Message)
	}
	if sum.NextStep != NextStepRunRecon {
		t.Fatal(sum.NextStep)
	}
	if store.ProofSubjects != 0 {
		t.Fatal("must not write proof subjects")
	}
	if len(store.Banks) == 0 {
		t.Fatal("expected bank observations")
	}
	_, err = svc.Upload(context.Background(), UploadInput{
		TenantID: imp.TenantID, AccountID: "acc1", ImportType: TypeBankCSV, FileName: "b.csv", Payload: raw,
	})
	if err == nil {
		t.Fatal("duplicate file")
	}
	again, err := svc.Commit(context.Background(), imp.TenantID, imp.ID)
	if err != nil || again.Status != StatusCommitted {
		t.Fatalf("retry %v %+v", err, again)
	}
}

func TestSettlementCommitDoesNotClaimProof(t *testing.T) {
	store := NewMemoryStore()
	svc := NewService(store)
	raw := testdata(t, "razorpay", "settlements", "valid_combined_recon.csv")
	imp, err := svc.Upload(context.Background(), UploadInput{
		TenantID: "11111111-1111-1111-1111-111111111111", ConnectorID: "22222222-2222-2222-2222-222222222222",
		ImportType: TypeSettlementCSV, FileName: "s.csv", Payload: raw,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Validate(context.Background(), imp.TenantID, imp.ID, ValidateRequest{}); err != nil {
		t.Fatal(err)
	}
	imp, err = svc.Commit(context.Background(), imp.TenantID, imp.ID)
	if err != nil {
		t.Fatal(err)
	}
	if imp.ToSummary(nil).Message != CopySettlementImported {
		t.Fatal(imp.ToSummary(nil).Message)
	}
	if store.ProofSubjects != 0 || len(store.Settlements) != 4 {
		t.Fatalf("proof=%d settle=%d", store.ProofSubjects, len(store.Settlements))
	}
}

func TestFileHashStable(t *testing.T) {
	raw := testdata(t, "razorpay", "settlements", "valid_combined_recon.json")
	if HashBytes(raw) != HashBytes(raw) {
		t.Fatal("unstable")
	}
}

func TestPackageDoesNotImportMatcher(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Dir(file)
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		b, _ := os.ReadFile(filepath.Join(dir, e.Name()))
		s := string(b)
		if strings.Contains(s, "internal/recon") && !strings.Contains(e.Name(), "nope") {
			t.Fatalf("%s imports recon", e.Name())
		}
		if strings.Contains(s, "recon.Match") || strings.Contains(s, "/internal/recon/run") {
			t.Fatalf("%s calls matcher", e.Name())
		}
	}
}
