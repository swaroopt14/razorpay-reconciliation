package imports

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"

	"zord-outcome-engine/internal/poll/providers/razorpay"
)

var allowedLineTypes = map[string]bool{
	"payment":    true,
	"refund":     true,
	"transfer":   true,
	"adjustment": true,
}

// MapReconItem converts a Razorpay recon DTO into a provider-neutral line.
// It does not match bank rows or claim proof.
func MapReconItem(item razorpay.SettlementReconItem, sourceHash string) (razorpay.NeutralSettlementLine, string) {
	lt := strings.ToLower(strings.TrimSpace(item.Type))
	if item.EntityID == "" {
		return razorpay.NeutralSettlementLine{}, ErrMissingEntityID
	}
	if !allowedLineTypes[lt] {
		return razorpay.NeutralSettlementLine{}, ErrUnsupportedLineType
	}
	if lt != "adjustment" && strings.TrimSpace(item.SettlementID) == "" {
		return razorpay.NeutralSettlementLine{}, ErrMissingSettlementID
	}
	cur := strings.ToUpper(strings.TrimSpace(item.Currency))
	if cur == "" {
		cur = "INR"
	}
	if len(cur) != 3 {
		return razorpay.NeutralSettlementLine{}, ErrInvalidCurrency
	}
	if item.Amount < 0 || item.Fee < 0 || item.Tax < 0 || item.Debit < 0 || item.Credit < 0 {
		return razorpay.NeutralSettlementLine{}, ErrInvalidAmount
	}
	raw, _ := json.Marshal(item)
	line := razorpay.NeutralSettlementLine{
		SettlementID: item.SettlementID,
		EntityID:     item.EntityID,
		LineType:     lt,
		PaymentID:    item.PaymentID,
		OrderID:      item.OrderID,
		RefundID:     item.RefundID,
		AmountMinor:  item.Amount,
		DebitMinor:   item.Debit,
		CreditMinor:  item.Credit,
		FeeMinor:     item.Fee,
		TaxMinor:     item.Tax,
		Currency:     cur,
		UTR:          item.SettlementUTR,
		Settled:      item.Settled,
		PayloadHash:  sourceHash,
		Raw:          raw,
		SourceRow:    0,
	}
	if item.SettledAt > 0 {
		line.SettledAt = time.Unix(item.SettledAt, 0).UTC()
	}
	if item.CreatedAt > 0 {
		line.CreatedAt = time.Unix(item.CreatedAt, 0).UTC()
	}
	if item.Adjustment != 0 {
		line.AdjustmentMinor = item.Adjustment
	}
	razorpay.EnrichSettlementLine(&line)
	return line, ""
}

type ParseOutcome struct {
	FileHash string
	Rows     []RowResult
}

func ParseSettlementJSON(raw []byte, fileHash string) (ParseOutcome, error) {
	if !json.Valid(raw) {
		return ParseOutcome{}, &FatalError{Code: ErrMalformedJSON, Message: "malformed JSON"}
	}
	var items []razorpay.SettlementReconItem
	var envelope struct {
		Items []razorpay.SettlementReconItem `json:"items"`
	}
	if err := json.Unmarshal(raw, &envelope); err == nil && len(envelope.Items) > 0 {
		items = envelope.Items
	} else if err := json.Unmarshal(raw, &items); err != nil {
		var one razorpay.SettlementReconItem
		if err2 := json.Unmarshal(raw, &one); err2 != nil {
			return ParseOutcome{}, &FatalError{Code: ErrMalformedJSON, Message: "unrecognized settlement JSON"}
		}
		items = []razorpay.SettlementReconItem{one}
	}
	out := ParseOutcome{FileHash: fileHash}
	for i, item := range items {
		out.Rows = append(out.Rows, mapItemRow(item, int64(i+1), fileHash, false))
	}
	return out, nil
}

func ParseSettlementCSV(raw []byte, fileHash string) (ParseOutcome, error) {
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true
	header, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return ParseOutcome{}, &FatalError{Code: ErrMalformedCSV, Message: "empty CSV"}
		}
		return ParseOutcome{}, &FatalError{Code: ErrMalformedCSV, Message: err.Error()}
	}
	idx := indexHeaders(header)
	if _, ok := idx["entity_id"]; !ok {
		return ParseOutcome{}, &FatalError{Code: ErrMissingRequiredColumn, Message: "missing entity_id"}
	}
	if _, ok := idx["type"]; !ok {
		return ParseOutcome{}, &FatalError{Code: ErrMissingRequiredColumn, Message: "missing type"}
	}
	out := ParseOutcome{FileHash: fileHash}
	rowNum := int64(0)
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return ParseOutcome{}, &FatalError{Code: ErrMalformedCSV, Message: err.Error()}
		}
		rowNum++
		item := itemFromCSV(rec, idx)
		if ts := csvField(rec, idx, "settled_at"); ts != "" {
			if _, ok := parseUnixOrRFC3339(ts); !ok {
				out.Rows = append(out.Rows, RowResult{
					RowNumber: rowNum, Status: RowInvalid, ErrorCode: ErrInvalidTimestamp,
					ErrorMessage: MessageFor(ErrInvalidTimestamp),
				})
				continue
			}
		}
		if ts := csvField(rec, idx, "created_at"); ts != "" {
			if _, ok := parseUnixOrRFC3339(ts); !ok {
				out.Rows = append(out.Rows, RowResult{
					RowNumber: rowNum, Status: RowInvalid, ErrorCode: ErrInvalidTimestamp,
					ErrorMessage: MessageFor(ErrInvalidTimestamp),
				})
				continue
			}
		}
		decimalAmt := fieldHasDecimal(rec, idx, "amount") || fieldHasDecimal(rec, idx, "credit") || fieldHasDecimal(rec, idx, "debit")
		out.Rows = append(out.Rows, mapItemRow(item, rowNum, fileHash, decimalAmt))
	}
	return out, nil
}

func csvField(rec []string, idx map[string]int, key string) string {
	i, ok := idx[key]
	if !ok || i >= len(rec) {
		return ""
	}
	return strings.TrimSpace(rec[i])
}

func fieldHasDecimal(rec []string, idx map[string]int, key string) bool {
	i, ok := idx[key]
	if !ok || i >= len(rec) {
		return false
	}
	return strings.Contains(rec[i], ".")
}

func mapItemRow(item razorpay.SettlementReconItem, rowNumber int64, fileHash string, decimalAmount bool) RowResult {
	raw, _ := json.Marshal(item)
	rowHash := HashCanonical(map[string]any{
		"entity_id": item.EntityID, "type": item.Type, "settlement_id": item.SettlementID,
		"debit": item.Debit, "credit": item.Credit, "amount": item.Amount,
		"fee": item.Fee, "tax": item.Tax, "currency": item.Currency,
	})
	res := RowResult{RowNumber: rowNumber, RowHash: rowHash, Raw: raw}
	if decimalAmount {
		res.Status = RowInvalid
		res.ErrorCode = ErrInvalidAmount
		res.ErrorMessage = MessageFor(ErrInvalidAmount)
		return res
	}
	line, code := MapReconItem(item, fileHash)
	if code != "" {
		res.Status = RowInvalid
		res.ErrorCode = code
		res.ErrorMessage = MessageFor(code)
		return res
	}
	line.SourceRow = rowNumber
	res.Status = RowValid
	res.Settlement = &line
	return res
}

func indexHeaders(header []string) map[string]int {
	out := map[string]int{}
	aliases := map[string]string{
		"entity_id": "entity_id", "entityid": "entity_id",
		"type": "type", "line_type": "type",
		"debit": "debit", "credit": "credit", "amount": "amount",
		"currency": "currency", "fee": "fee", "tax": "tax",
		"settlement_id": "settlement_id", "settlementid": "settlement_id",
		"settlement_utr": "settlement_utr", "utr": "settlement_utr",
		"payment_id": "payment_id", "order_id": "order_id", "refund_id": "refund_id",
		"created_at": "created_at", "settled_at": "settled_at", "settled": "settled",
		"adjustment": "adjustment",
	}
	for i, h := range header {
		key := strings.ToLower(strings.TrimSpace(h))
		if canon, ok := aliases[key]; ok {
			out[canon] = i
		}
	}
	return out
}

func itemFromCSV(rec []string, idx map[string]int) razorpay.SettlementReconItem {
	get := func(k string) string {
		i, ok := idx[k]
		if !ok || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}
	item := razorpay.SettlementReconItem{
		EntityID:      get("entity_id"),
		Type:          get("type"),
		Currency:      get("currency"),
		SettlementID:  get("settlement_id"),
		SettlementUTR: get("settlement_utr"),
		PaymentID:     get("payment_id"),
		OrderID:       get("order_id"),
		RefundID:      get("refund_id"),
		Debit:         parseInt64Field(get("debit")),
		Credit:        parseInt64Field(get("credit")),
		Amount:        parseInt64Field(get("amount")),
		Fee:           parseInt64Field(get("fee")),
		Tax:           parseInt64Field(get("tax")),
		Adjustment:    parseInt64Field(get("adjustment")),
		Settled:       parseBoolField(get("settled")),
	}
	if t, ok := parseUnixOrRFC3339(get("created_at")); ok {
		item.CreatedAt = t
	}
	if t, ok := parseUnixOrRFC3339(get("settled_at")); ok {
		item.SettledAt = t
	}
	if get("settled_at") != "" && item.SettledAt == 0 {
		item.SettledAt = 0
	}
	return item
}

func parseInt64Field(s string) int64 {
	s = strings.ReplaceAll(s, ",", "")
	if s == "" || strings.Contains(s, ".") {
		return 0
	}
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func parseBoolField(s string) bool {
	switch strings.ToLower(s) {
	case "1", "true", "yes", "settled":
		return true
	}
	return false
}

func parseUnixOrRFC3339(s string) (int64, bool) {
	if s == "" {
		return 0, false
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n, true
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Unix(), true
	}
	return 0, false
}
