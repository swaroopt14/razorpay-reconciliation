package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"zord-outcome-engine/internal/recon"
)

// BankStatementParser normalizes merchant bank CSV credits/debits.
// This is not zord-edge BankParser (payout intents).
type BankStatementParser struct{}

type BankParseResult struct {
	Rows     []recon.BankTxn
	RowCount int
	FileHash string
}

var bankHeaderAliases = map[string][]string{
	"date":        {"value_date", "transaction_date", "date", "txn_date", "value date"},
	"description": {"description", "narration", "remarks", "particulars"},
	"credit":      {"credit_amount", "credit", "deposit", "cr"},
	"debit":       {"debit_amount", "debit", "withdrawal", "dr"},
	"utr":         {"utr", "utr_number", "reference", "ref_no", "cheque_ref"},
	"txn_id":      {"bank_transaction_id", "txn_id", "transaction_id", "instr_id"},
	"currency":    {"currency", "ccy"},
}

func (p BankStatementParser) Parse(fileBytes []byte, accountID string) (BankParseResult, error) {
	sum := sha256.Sum256(fileBytes)
	fileHash := "sha256:" + hex.EncodeToString(sum[:])
	r := csv.NewReader(bytes.NewReader(fileBytes))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true
	header, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return BankParseResult{}, fmt.Errorf("bank csv: empty file")
		}
		return BankParseResult{}, fmt.Errorf("bank csv: %w", err)
	}
	idx := mapHeader(header)
	if _, ok := idx["credit"]; !ok {
		if _, ok2 := idx["debit"]; !ok2 {
			return BankParseResult{}, fmt.Errorf("bank csv: need a credit or debit column")
		}
	}
	var rows []recon.BankTxn
	rowNum := 0
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return BankParseResult{}, err
		}
		rowNum++
		if isTotalRow(rec) {
			continue
		}
		txn, skip := parseBankRow(rec, idx, accountID)
		if skip {
			continue
		}
		rows = append(rows, txn)
	}
	return BankParseResult{Rows: rows, RowCount: len(rows), FileHash: fileHash}, nil
}

func parseBankRow(rec []string, idx map[string]int, accountID string) (recon.BankTxn, bool) {
	get := func(key string) string {
		i, ok := idx[key]
		if !ok || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}
	credit := parseMinor(get("credit"))
	debit := parseMinor(get("debit"))
	if credit == 0 && debit == 0 {
		return recon.BankTxn{}, true
	}
	desc := get("description")
	utr := strings.TrimSpace(get("utr"))
	if utr == "" {
		utr = extractUTR(desc)
	}
	date := parseDate(get("date"))
	currency := get("currency")
	if currency == "" {
		currency = "INR"
	}
	canonical := strings.Join([]string{accountID, get("txn_id"), date.Format("2006-01-02"), desc, strconv.FormatInt(credit, 10), strconv.FormatInt(debit, 10), utr, currency}, "|")
	sum := sha256.Sum256([]byte(canonical))
	hash := "sha256:" + hex.EncodeToString(sum[:])
	id := hash
	if txnID := get("txn_id"); txnID != "" {
		id = txnID
	}
	return recon.BankTxn{
		ID:          id,
		AccountID:   accountID,
		BankTxnID:   get("txn_id"),
		UTR:         utr,
		Description: desc,
		Currency:    currency,
		CreditMinor: credit,
		DebitMinor:  debit,
		ValueDate:   date,
		RowHash:     hash,
	}, false
}

func mapHeader(header []string) map[string]int {
	out := map[string]int{}
	for i, h := range header {
		norm := strings.ToLower(strings.TrimSpace(h))
		for key, aliases := range bankHeaderAliases {
			for _, a := range aliases {
				if norm == a {
					out[key] = i
				}
			}
		}
	}
	return out
}

func isTotalRow(rec []string) bool {
	joined := strings.ToLower(strings.Join(rec, " "))
	return strings.Contains(joined, "total") || strings.Contains(joined, "grand total")
}

func parseMinor(s string) int64 {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	if s == "" {
		return 0
	}
	if strings.Contains(s, ".") {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return int64(f*100 + 0.5)
	}
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func parseDate(s string) time.Time {
	s = strings.TrimSpace(s)
	for _, layout := range []string{"2006-01-02", "02-01-2006", "02/01/2006", "2006/01/02", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

func extractUTR(desc string) string {
	fields := strings.Fields(strings.ToUpper(desc))
	for _, f := range fields {
		if strings.HasPrefix(f, "UTR") && len(f) > 3 {
			return strings.Trim(f, ":-")
		}
		if strings.HasPrefix(f, "UTR_") {
			return f
		}
	}
	for i, f := range fields {
		if f == "UTR" && i+1 < len(fields) {
			return fields[i+1]
		}
	}
	return ""
}
