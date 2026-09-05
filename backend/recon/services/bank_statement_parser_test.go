package services

import "testing"

func TestBankStatementParserCreditAndUTR(t *testing.T) {
	csv := "value_date,description,credit_amount,debit_amount,utr,currency\n" +
		"2026-08-30,RAZORPAY SETTLEMENT,965.78,0,utr_001,INR\n" +
		"TOTAL,,,0,,\n"
	got, err := (BankStatementParser{}).Parse([]byte(csv), "account_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.RowCount != 1 {
		t.Fatalf("rows=%d", got.RowCount)
	}
	row := got.Rows[0]
	if row.UTR != "utr_001" || row.CreditMinor != 96578 {
		t.Fatalf("%+v", row)
	}
	if row.RowHash == "" || got.FileHash == "" {
		t.Fatal("hashes required")
	}
}

func TestBankStatementParserRequiresAmountColumn(t *testing.T) {
	_, err := (BankStatementParser{}).Parse([]byte("foo,bar\n1,2\n"), "a")
	if err == nil {
		t.Fatal("expected header error")
	}
}
