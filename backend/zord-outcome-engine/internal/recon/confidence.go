package recon

const (
	ScoreExactPaymentID = 0.50
	ScoreExactUTR       = 0.35
	ScoreExactNetAmount = 0.08
	ScoreCurrency       = 0.03
	ScoreDateWindow     = 0.03
	ScoreDescription    = 0.01
)

func ScoreUTRAndAmount(utrEqual, amountEqual, currencyEqual, dateInWindow bool) (float64, map[string]float64) {
	b := map[string]float64{}
	var total float64
	if utrEqual {
		b["exact_settlement_utr"] = ScoreExactUTR
		total += ScoreExactUTR
	}
	if amountEqual {
		b["exact_net_amount"] = ScoreExactNetAmount
		total += ScoreExactNetAmount
	}
	if currencyEqual {
		b["currency_match"] = ScoreCurrency
		total += ScoreCurrency
	}
	if dateInWindow {
		b["date_within_expected_window"] = ScoreDateWindow
		total += ScoreDateWindow
	}
	return total, b
}
