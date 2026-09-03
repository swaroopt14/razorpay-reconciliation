# Demo sample upload files

Illustrative data for Download → upload → validate against bulk-ingest / settlement upload.

| File | Purpose |
|------|---------|
| demo_intents_20.csv | 20 valid payout obligations |
| demo_intents_with_issues.csv | + duplicate + missing amount |
| demo_settlement_exact.csv | Settlement with short + return rows |
| demo_settlement_exceptions.csv | Same for outcome review |

Batch ref: `BATCH-001` · prepared console batch id: `batch-001`

Amounts match the console demo spine (`demoPayoutAmounts.ts`): PAY-0001 Apex Components = ₹5,500; batch intended total = ₹55,000 across 20 payouts (same scale as smoke Leakage payroll batch).

