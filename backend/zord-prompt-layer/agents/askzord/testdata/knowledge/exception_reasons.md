---
title: Exception reason definitions
source: internal
document_type: glossary
version: v1
effective_from: 2026-08-01
---

failed_with_bank_movement: payment failed but a bank movement exists without settlement or refund.

captured_missing_settlement: captured payment has no settlement line.

settlement_without_bank: settlement observed, no matched bank CREDIT.

amount_mismatch: unique UTR matched a bank amount that differs from settlement net.

ambiguous_bank_candidates: more than one plausible bank candidate; MATCHED was not forced.

payout_failed_with_bank_movement / payout_missing_bank / payout_open_past_sla: payout equivalents. Status is unchanged.
