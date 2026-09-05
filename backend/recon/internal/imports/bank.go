package imports

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type BankOptions struct {
	AccountID  string
	Mapping    map[string]string
	Currency   string
	AmountUnit string
	Timezone   string
	Profile    string
}

type BankFormatProfile struct {
	Name               string
	DateColumns        []string
	DescriptionColumns []string
	CreditColumns      []string
	DebitColumns       []string
	AmountColumns      []string
	CurrencyColumns    []string
	UTRColumns         []string
	ReferenceColumns   []string
	TxnIDColumns       []string
	DateLayouts        []string
	AmountUnit         string
}

func Profiles() map[string]BankFormatProfile {
	return map[string]BankFormatProfile{
		"generic": ProfileByName("generic"),
		"hdfc":    ProfileByName("hdfc"),
		"icici":   ProfileByName("icici"),
		"sbi":     ProfileByName("sbi"),
	}
}

func ProfileByName(name string) BankFormatProfile {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "hdfc":
		return BankFormatProfile{
			Name: "hdfc", DateColumns: []string{"txn date", "date", "value date"},
			DescriptionColumns: []string{"narration", "description"},
			CreditColumns:      []string{"deposit amt", "deposit", "credit"},
			DebitColumns:       []string{"withdrawal amt", "withdrawal", "debit"},
			UTRColumns:         []string{"chq/ref number", "utr", "ref no"},
			DateLayouts:        []string{"02/01/2006", "2006-01-02"},
		}
	case "icici":
		return BankFormatProfile{
			Name: "icici", DateColumns: []string{"transaction date", "value date", "date"},
			DescriptionColumns: []string{"remarks", "description"},
			CreditColumns:      []string{"deposits", "credit"},
			DebitColumns:       []string{"withdrawals", "debit"},
			UTRColumns:         []string{"cheque number", "utr"},
			DateLayouts:        []string{"02-01-2006", "2006-01-02"},
		}
	case "sbi":
		return BankFormatProfile{
			Name: "sbi", DateColumns: []string{"txn date", "value date", "date"},
			DescriptionColumns: []string{"description", "narration"},
			CreditColumns:      []string{"credit"},
			DebitColumns:       []string{"debit"},
			UTRColumns:         []string{"ref no", "utr"},
			DateLayouts:        []string{"2006-01-02", "02-01-2006"},
		}
	default:
		return BankFormatProfile{
			Name: "generic", DateColumns: []string{"value_date", "transaction_date", "date", "txn_date", "value date"},
			DescriptionColumns: []string{"description", "narration", "remarks", "particulars"},
			CreditColumns:      []string{"credit_amount", "credit", "deposit", "cr"},
			DebitColumns:       []string{"debit_amount", "debit", "withdrawal", "dr"},
			AmountColumns:      []string{"amount", "signed_amount"},
			CurrencyColumns:    []string{"currency", "ccy"},
			UTRColumns:         []string{"utr", "utr_number", "reference", "ref_no"},
			ReferenceColumns:   []string{"reference_number", "ref"},
			TxnIDColumns:       []string{"bank_transaction_id", "txn_id", "transaction_id", "instr_id"},
			DateLayouts:        []string{"2006-01-02", "02-01-2006", "02/01/2006", time.RFC3339},
		}
	}
}

func ParseBankCSV(raw []byte, opt BankOptions) ([]RowResult, []string, error) {
	if !bytes.Equal(bytes.ToValidUTF8(raw, []byte("")), raw) && containsNUL(raw) {
		return nil, nil, &FatalError{Code: ErrUnsupportedEncoding, Message: "unsupported encoding"}
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true
	header, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return nil, nil, &FatalError{Code: ErrMalformedCSV, Message: "empty CSV"}
		}
		return nil, nil, &FatalError{Code: ErrMalformedCSV, Message: err.Error()}
	}
	detected := append([]string{}, header...)
	prof := ProfileByName(opt.Profile)
	idx := detectBankColumns(header, prof, opt.Mapping)
	if _, ok := idx["credit"]; !ok {
		if _, ok2 := idx["debit"]; !ok2 {
			if _, ok3 := idx["amount"]; !ok3 {
				return nil, detected, &FatalError{Code: ErrMissingRequiredColumn, Message: "need credit, debit, or amount"}
			}
		}
	}
	unit := strings.ToLower(strings.TrimSpace(opt.AmountUnit))
	if unit == "" {
		unit = "paise"
	}
	wantCur := strings.ToUpper(strings.TrimSpace(opt.Currency))
	loc := time.UTC
	if opt.Timezone != "" {
		if z, err := time.LoadLocation(opt.Timezone); err == nil {
			loc = z
		}
	}
	seenHash := map[string]struct{}{}
	var rows []RowResult
	rowNum := int64(0)
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, detected, &FatalError{Code: ErrMalformedCSV, Message: err.Error()}
		}
		rowNum++
		if isTotal(rec) {
			continue
		}
		rows = append(rows, parseBankRecord(rec, idx, opt.AccountID, unit, wantCur, loc, prof.DateLayouts, rowNum, seenHash))
	}
	return rows, detected, nil
}

func detectBankColumns(header []string, prof BankFormatProfile, mapping map[string]string) map[string]int {
	lower := map[string]int{}
	for i, h := range header {
		lower[strings.ToLower(strings.TrimSpace(h))] = i
	}
	out := map[string]int{}
	assign := func(canon string, names []string) {
		if m, ok := mapping[canon]; ok {
			if i, ok := lower[strings.ToLower(m)]; ok {
				out[canon] = i
				return
			}
		}
		for _, n := range names {
			if i, ok := lower[strings.ToLower(n)]; ok {
				out[canon] = i
				return
			}
		}
	}
	assign("date", prof.DateColumns)
	assign("description", prof.DescriptionColumns)
	assign("credit", prof.CreditColumns)
	assign("debit", prof.DebitColumns)
	assign("amount", prof.AmountColumns)
	assign("currency", prof.CurrencyColumns)
	assign("utr", prof.UTRColumns)
	assign("reference", prof.ReferenceColumns)
	assign("txn_id", prof.TxnIDColumns)
	return out
}

func parseBankRecord(rec []string, idx map[string]int, accountID, unit, wantCur string, loc *time.Location, layouts []string, rowNum int64, seen map[string]struct{}) RowResult {
	get := func(k string) string {
		i, ok := idx[k]
		if !ok || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}
	rawMap := map[string]string{}
	for k, i := range idx {
		if i < len(rec) {
			rawMap[k] = rec[i]
		}
	}
	raw, _ := json.Marshal(rawMap)
	res := RowResult{RowNumber: rowNum, Raw: raw}
	credit, errCode := parseAmount(get("credit"), unit)
	if errCode != "" && get("credit") != "" {
		res.Status = RowInvalid
		res.ErrorCode = errCode
		res.ErrorMessage = MessageFor(errCode)
		return res
	}
	debit, errCode := parseAmount(get("debit"), unit)
	if errCode != "" && get("debit") != "" {
		res.Status = RowInvalid
		res.ErrorCode = errCode
		res.ErrorMessage = MessageFor(errCode)
		return res
	}
	if credit == 0 && debit == 0 {
		if amt, code := parseSignedAmount(get("amount"), unit); code != "" && get("amount") != "" {
			res.Status = RowInvalid
			res.ErrorCode = code
			res.ErrorMessage = MessageFor(code)
			return res
		} else if amt > 0 {
			credit = amt
		} else if amt < 0 {
			debit = -amt
		}
	}
	if credit == 0 && debit == 0 {
		res.Status = RowInvalid
		res.ErrorCode = ErrInvalidAmount
		res.ErrorMessage = MessageFor(ErrInvalidAmount)
		return res
	}
	if credit < 0 {
		res.Status = RowInvalid
		res.ErrorCode = ErrInvalidAmount
		res.ErrorMessage = "negative credit is not allowed"
		return res
	}
	cur := strings.ToUpper(get("currency"))
	if cur == "" {
		cur = wantCur
	}
	if cur == "" {
		cur = "INR"
	}
	if len(cur) != 3 {
		res.Status = RowInvalid
		res.ErrorCode = ErrInvalidCurrency
		res.ErrorMessage = MessageFor(ErrInvalidCurrency)
		return res
	}
	if wantCur != "" && cur != wantCur {
		res.Status = RowInvalid
		res.ErrorCode = ErrCurrencyMismatch
		res.ErrorMessage = MessageFor(ErrCurrencyMismatch)
		return res
	}
	date, dcode := parseBankDate(get("date"), layouts, loc)
	if dcode != "" {
		res.Status = RowInvalid
		res.ErrorCode = dcode
		res.ErrorMessage = MessageFor(dcode)
		return res
	}
	desc := get("description")
	norm := normalizeDesc(desc)
	utrRaw := get("utr")
	utrNorm, utrBad := normalizeUTR(utrRaw)
	rowHash := HashCanonical(map[string]any{
		"account_id": accountID, "txn_id": get("txn_id"), "date": date.Format("2006-01-02"),
		"description": desc, "credit": credit, "debit": debit, "utr": utrNorm, "currency": cur,
	})
	if _, ok := seen[rowHash]; ok {
		res.Status = RowDuplicate
		res.ErrorCode = ErrDuplicateRow
		res.ErrorMessage = MessageFor(ErrDuplicateRow)
		res.RowHash = rowHash
		return res
	}
	seen[rowHash] = struct{}{}
	obs := &BankObservation{
		AccountID:             accountID,
		BankTransactionID:     get("txn_id"),
		ValueDate:             date,
		Description:           desc,
		NormalizedDescription: norm,
		UTR:                   utrNorm,
		UTRRaw:                utrRaw,
		ReferenceNumber:       get("reference"),
		CreditMinor:           credit,
		DebitMinor:            debit,
		CreditDebit:           bankSide(credit, debit),
		Currency:              cur,
		SourceRowNumber:       rowNum,
		RowHash:               rowHash,
		Raw:                   raw,
	}
	res.Bank = obs
	res.RowHash = rowHash
	if utrBad {
		res.Status = RowAcceptedWithoutValidUTR
		res.ErrorCode = ErrInvalidUTR
		res.ErrorMessage = MessageFor(ErrInvalidUTR)
		obs.UTR = ""
		return res
	}
	res.Status = RowValid
	return res
}

func parseAmount(s, unit string) (int64, string) {
	s = strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	if s == "" {
		return 0, ""
	}
	if strings.Count(s, ".") > 1 {
		return 0, ErrInvalidAmount
	}
	if unit == "paise" {
		if strings.Contains(s, ".") {
			f, err := strconv.ParseFloat(s, 64)
			if err != nil {
				return 0, ErrInvalidAmount
			}
			if f != float64(int64(f)) {
				return 0, ErrWrongAmountUnit
			}
			return int64(f), ""
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0, ErrInvalidAmount
		}
		if n > 1e15 {
			return 0, ErrAmountOverflow
		}
		return n, ""
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, ErrInvalidAmount
	}
	n := int64(f*100 + 0.5)
	if n > 1e15 {
		return 0, ErrAmountOverflow
	}
	return n, ""
}

func parseSignedAmount(s, unit string) (int64, string) {
	s = strings.TrimSpace(s)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = strings.TrimPrefix(s, "-")
	}
	n, code := parseAmount(s, unit)
	if code != "" {
		return 0, code
	}
	if neg {
		return -n, ""
	}
	return n, ""
}

func parseBankDate(s string, layouts []string, loc *time.Location) (time.Time, string) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, ErrInvalidDate
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, loc); err == nil {
			return t.UTC(), ""
		}
	}
	return time.Time{}, ErrInvalidDate
}

func normalizeDesc(s string) string {
	fields := strings.Fields(s)
	return strings.ToUpper(strings.Join(fields, " "))
}

func normalizeUTR(s string) (string, bool) {
	s = strings.TrimSpace(s)
	low := strings.ToLower(s)
	if low == "" {
		return "", false
	}
	switch low {
	case "-", "n/a", "na", "null", "none":
		return "", true
	}
	compact := strings.NewReplacer(" ", "", "-", "").Replace(s)
	compact = strings.ToUpper(compact)
	if len(compact) > 128 {
		return "", true
	}
	return compact, false
}

func isTotal(rec []string) bool {
	return strings.Contains(strings.ToLower(strings.Join(rec, " ")), "total")
}

func containsNUL(b []byte) bool {
	return bytes.IndexByte(b, 0) >= 0
}

func RedactRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) > 4096 {
		return json.RawMessage(`{"redacted":true}`)
	}
	s := string(raw)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			continue
		}
		b.WriteRune(r)
	}
	return json.RawMessage(b.String())
}
