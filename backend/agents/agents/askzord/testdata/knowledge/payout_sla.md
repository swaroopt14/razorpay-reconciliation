---
title: Razorpay payout SLA
source: internal
document_type: policy
version: v1
effective_from: 2026-08-01
---

Open payouts past the configured 15 minute SLA stay in their Razorpay status (pending, queued, processing, scheduled). Reconciliation result is UNRESOLVED with reason payout_open_past_sla.

The Razorpay status is never renamed to STUCK or SLA_BREACH.
