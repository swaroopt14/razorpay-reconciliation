# Payout Command Repeated Value Audit

Date: 2026-06-15

Scope: live payout command surfaces mounted under `/payout-command-view/today`, focused on repeated amounts, counts, and percentages that can make the product look like it is showing the same value again and again.

Out of scope by product rule: Borrower Verification, Post-Disbursal Monitoring, and Support requests remain mock-only zones and are not audited here as live KPI repetition.

## Summary

The biggest repeated value is `Value Needing Review`. Across Home, Ask, Payment Gaps, and Evidence it usually resolves to the same field: `leakage.unmatched_amount_minor`.

The second repeated cluster is the match-review cluster: `Payments needing review`, `Needs review`, `Ambiguous intents`, `Match Confidence`, `Missing reference rate`, and `Reference completeness`. These mostly come from the ambiguity dashboard and appear on Home, Ask, and Match Review.

The third repeated cluster is proof readiness: `Proof Readiness`, `Evidence coverage`, `Defensibility`, `Governance`, and `Dispute-ready`. These come from defensibility KPIs and appear on Home, Ask, and Evidence.

Connector Performance is slightly different: it reuses the same intelligence APIs, but its `Unconfirmed exposure` can be the sum of leakage buckets, then ambiguity value-at-risk, then recommendation amount-at-stake as fallback. This can look similar to Payment Gaps while not being the exact same business value.

## Page-Wise Repeat Table

| UI component with what is shown | Page | Working / audit note | API | Backend service |
| --- | --- | --- | --- | --- |
| `Intended Payment Value` hero shows formatted `total_intended_amount_minor`; fallback can come from trend total when leakage is absent. | Today / Home: `/payout-command-view/today?dock=home` | Working, but the same amount appears again on Ask, Payment Gaps, and Connector total volume. Risk: repeated top-line money number looks like duplicate KPI design. | `GET /api/prod/intelligence/leakage`, `GET /api/prod/home/disbursement-trend` | `zord-intelligence` via `/v1/intelligence/dashboard/leakage`; trend BFF calls leakage windows. |
| `Payment Value Observed` / `Value Observed` shows intended value first, settled value second. | Ask / Payment Operations View: `/payout-command-view/today?dock=workspace` | Working, but label is broad. It may repeat Home's intended value when intent data exists. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Intended Payment Value` large card shows `intendedMinor`. | Payment Gaps & Value at Risk: `/payout-command-view/today?dock=leakage` | Working and expected, but repeats Home hero. | `GET /api/prod/intelligence/leakage`, optional `GET /api/prod/intelligence/batches/{batch_id}` for batch projection | `zord-intelligence` |
| `Total volume processed` / overview hero shows `apiTotals.totalIntendedMinor`. | Connector Performance & Leakage: `/payout-command-view/today?dock=connectors` | Working, but this is often the same intended amount as Home and Payment Gaps, with connector wording. | `GET /api/prod/intelligence/leakage`, plus connector adapter fanout | `zord-intelligence` |
| `Bank-Confirmed Value`, `Fully Matched Value`, and `Settled value observed` show `total_observed_settled_amount_minor` when available. | Home and Ask | Working. Repeated across two pages with slightly different labels. Risk: "Bank-confirmed", "Fully Matched", and "Settled observed" may look like three different KPIs. | `GET /api/prod/intelligence/leakage`, `GET /api/prod/home/disbursement-trend` | `zord-intelligence` |
| `Value Needing Review` shows `unmatched_amount_minor` as the headline amount. | Home command center card | Working, but this is the main repeated value across product. Source line says unmatched value from bank/settlement matching. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Value needing review` clarity hero shows the same `unmatched_amount_minor`. | Ask / Payment Operations View | Working, same value as Home and Payment Gaps. Audit risk: Ask has both `Value at Risk` section and `Value needing review` label using leakage unmatched. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Value Needing Review` hero shows `valueNeedingReviewMinor`, explicitly mapped to `unmatched_amount_minor` only. | Payment Gaps & Value at Risk | Working. This is the canonical source for the repeated review amount. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Value Needing Evidence Review` shows `leakage.unmatched_amount_minor`. | Evidence & Dispute Resolution: `/payout-command-view/today?dock=proof` | Working, but wording suggests Evidence owns this value. Actually it is the same leakage unmatched value. High copy-risk. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Needs review` in Home chart tooltip shows bucket `review_amount`; trend code documents review amount should not be derived from intent aggregates and should use leakage unmatched only. | Today / Home trend chart | Partially separated by date bucket, but same business concept as Value Needing Review. If bucket data is flat, it looks copied. | `GET /api/prod/home/disbursement-trend` | `zord-intelligence` leakage windows through BFF |
| `Unmatched payments`, `Short-settled value`, `Unlinked settlement`, `Reversal exposure` breakdown rows. | Home command center card | Working. Same four leakage buckets appear on Ask and Payment Gaps. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Unmatched value`, `Short-settled value`, `Unlinked settlement`, `Reversal exposure` clarity rows. | Ask / Payment Operations View | Working, repeated from Home and Payment Gaps. Good for consistency, but page needs stronger context if displayed beside the same headline amount. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| Secondary cards: `Unmatched Payment Value`, `Short-Settled Value`, `Unlinked Settlement Value`, `Reversal Exposure`. | Payment Gaps & Value at Risk | Working. Canonical detailed breakdown. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Leakage Composition` slices: `Unmatched`, `Short settled`, `Unlinked`, `Reversal`. | Connector Performance & Leakage | Working, but repeats Payment Gaps breakdown under connector page. If leakage buckets are empty, it falls back to connector allocated exposure. | `GET /api/prod/intelligence/leakage`; fallback from connector rows | `zord-intelligence` |
| `Unconfirmed exposure` shows `moneyAtRiskMinor`. | Connector Performance & Leakage | Working, but not always the same as Home review amount. It sums leakage buckets first, then falls back to ambiguity value-at-risk or recommendation amount-at-stake. Needs copy clarity. | `GET /api/prod/intelligence/leakage`, `GET /api/prod/intelligence/ambiguity`, `GET /api/prod/intelligence/recommendation`, `GET /api/prod/intelligence/recommendations` | `zord-intelligence` |
| `Preventable leakage` shows recommendation impact or `0.65 * unconfirmedExposure`. | Connector Performance & Leakage | Working as derived estimate. Audit risk: if recommendation impact is absent, the 65 percent derived value can look like another repeated/fake amount. | Same connector adapter fanout as above | `zord-intelligence` |
| `Payments needing review` row shows `ambiguous_intent_count`. | Home command center, Match Confidence card | Working. Same count appears as `Ambiguous intents` in Match Review and may appear as `Needs review` in Ask. | `GET /api/prod/intelligence/ambiguity` | `zord-intelligence` |
| `Needs review` count in health brief and `Items Needing Review`. | Ask / Payment Operations View | Working, but source priority changes: manual DLQ count, then recommendations total, then ambiguity count, then pending count. This can differ from Home while using similar wording. | `GET /api/prod/dlq/manual-review`, `GET /api/prod/intelligence/recommendations`, `GET /api/prod/intelligence/ambiguity`, `GET /api/prod/intelligence/patterns` | `zord-intent-engine` for DLQ; `zord-intelligence` for other counts |
| `Ambiguous intents` and hero `Review Rate`. | Match Review | Working and canonical for match-review count/rate. | `GET /api/prod/intelligence/ambiguity`, optional batch health projection | `zord-intelligence` |
| `Batches Needing Review` table and `Needs review` filter. | Match Review | Working, but "Needs review" is a batch status/filter, not the same as Home/Ask item count. Needs naming clarity. | `GET /api/prod/intelligence/batches?status=REQUIRES_REVIEW` | `zord-intelligence` |
| `Match Confidence` shows `avg_attachment_confidence`, or `batch_contract.match_confidence` when a batch is selected. | Home command center | Working. Same concept appears on Ask and Match Review. Batch-scoped Home can diverge from tenant Match Review. | `GET /api/prod/intelligence/ambiguity`, `GET /api/prod/intelligence/batch_contract/{batch_id}` | `zord-intelligence` |
| `Match confidence` health metric. | Ask / Payment Operations View | Working, repeats Home and Match Review. | `GET /api/prod/intelligence/ambiguity` | `zord-intelligence` |
| `Avg Match Confidence` metric. | Match Review / Ambiguity Velocity | Working, canonical match-review confidence display. | `GET /api/prod/intelligence/ambiguity` | `zord-intelligence` |
| `Missing reference rate` and `Reference completeness`. | Home command center | Working. Same values appear on Ask and Match Review. | `GET /api/prod/intelligence/ambiguity`, batch override from `GET /api/prod/intelligence/batch_contract/{batch_id}` | `zord-intelligence` |
| `Reference completeness` health metric and review breakdown `Missing references`. | Ask / Payment Operations View | Working. Same ambiguity source. | `GET /api/prod/intelligence/ambiguity` | `zord-intelligence` |
| `Missing ref rate`, `Missing references`, `Reference benchmark`. | Match Review | Working, canonical source. | `GET /api/prod/intelligence/ambiguity` | `zord-intelligence` |
| `Value at risk` amount shows `ambiguity.value_at_risk_minor`. | Match Review | Working. This is not the same field as leakage `unmatched_amount_minor`, but wording overlaps with Payment Gaps and Ask. | `GET /api/prod/intelligence/ambiguity`, `GET /api/prod/ambiguity/velocity` | `zord-intelligence` |
| `Value at Risk` card title in Ask shows `clarityHero` from leakage unmatched. | Ask / Payment Operations View | Working, but label conflicts with Match Review `Value at risk`, which uses ambiguity `value_at_risk_minor`. High audit-risk. | `GET /api/prod/intelligence/leakage` | `zord-intelligence` |
| `Proof Readiness` shows `evidence_pack_rate`; rows show `audit_ready_pct` and incomplete percentage. | Home command center | Working. Same proof source appears on Ask and Evidence, but Evidence hero uses defensibility score instead of pack rate. | `GET /api/prod/intelligence/defensibility` | `zord-intelligence` |
| `Proof Readiness` / `Evidence coverage` health metric shows `evidence_pack_rate`. | Ask / Payment Operations View | Working and repeats Home proof coverage. | `GET /api/prod/intelligence/defensibility` | `zord-intelligence` |
| `Defensibility` hero shows `defensibility_score`; subcopy includes Evidence Packs percent and Dispute-ready percent. | Evidence & Dispute Resolution | Working. Related to Home/Ask proof readiness but not the same headline value. Needs label clarity. | `GET /api/prod/intelligence/defensibility` | `zord-intelligence` |
| `Governance Checks`, `Dispute Packs Ready`, and `Missing Proof Items`. | Evidence & Dispute Resolution | Working. More specific Evidence metrics derived from defensibility and evidence pack rows. | `GET /api/prod/intelligence/defensibility`, `GET /api/prod/evidence/packs`, `GET /api/prod/evidence/batch/{batchId}/intents`, `GET /api/prod/evidence/batch/{batchId}/lineage-graph` | `zord-intelligence`, `zord-evidence` |
| `Connected Sources` statuses show `Received`, `Missing`, `Partial`, or `Ready`. | Ask / Payment Operations View | Working. Uses ingest-status first, then falls back to intent batches and settlement observations. Repeated status words can look static when data is missing. | `GET /api/prod/ingest-status`; fallback `GET /api/prod/intents/batches`, `GET /api/prod/settlement/observations/batches` | `zord-intelligence`, `zord-evidence`, `zord-intent-engine`, settlement/outcome service |
| Empty values: `-`, `...`, `Awaiting live data`, `No trend data`, `No batches to display`. | Home, Ask, Payment Gaps, Match Review, Evidence, Connector Performance | Working as honest empty states. Audit note: repeated empties are acceptable, but repeated `-` across hero cards can look broken if several APIs are unavailable together. | BFF returns empty `data_available: false` or empty arrays on upstream miss. | Mostly `zord-intelligence`; Evidence uses `zord-evidence`; Ask sources can hit intent and settlement services. |

## Highest-Risk Repetition

| Repeated value family | Where it repeats | Why it looks bad | Suggested product/copy fix |
| --- | --- | --- | --- |
| `Value Needing Review` amount | Home, Ask, Payment Gaps, Evidence | Same leakage unmatched amount gets four labels, including Evidence wording. | Make Payment Gaps canonical. On Home say `Unmatched value`; on Evidence say `Unmatched value affecting evidence`, or move it under a secondary cross-link. |
| `Value at Risk` wording | Ask, Payment Gaps, Match Review, Connectors | Different source fields use similar labels: leakage unmatched, ambiguity value-at-risk, connector unconfirmed exposure. | Reserve `Value at Risk` for one definition. Rename others to `Unmatched Value`, `Match-Risk Exposure`, and `Connector Exposure`. |
| Match review count | Home, Ask, Match Review | `Payments needing review`, `Needs review`, `Items Needing Review`, and `Ambiguous intents` can be same or different counts depending on source priority. | Show source hint beside count: `DLQ manual review`, `Ambiguity`, `Recommendations`, or `Pending`. |
| Proof readiness | Home, Ask, Evidence | Home/Ask show evidence pack rate, while Evidence shows defensibility score as primary. | Keep Home/Ask as `Evidence coverage`; keep Evidence as `Defensibility score`. Avoid using `Proof Readiness` for both. |
| Connector exposure | Connectors vs Payment Gaps | Connector `Unconfirmed exposure` can be leakage sum, ambiguity risk, or recommendation stake. | Add subcopy: `Source: leakage buckets` / `Source: ambiguity fallback` / `Source: recommendation fallback`. |

## Source Notes

- Home `Value Needing Review` uses `reviewMinor`, derived from `leakage.unmatched_amount_minor`.
- Ask `Value needing review` uses the same `reviewMinor`, also derived from `leakage.unmatched_amount_minor`.
- Payment Gaps explicitly maps `valueNeedingReviewMinor` to `unmatchedMinor`.
- Evidence `Value Needing Evidence Review` also uses `leakage.unmatched_amount_minor`.
- Connector `Unconfirmed exposure` is broader than the above because it sums leakage buckets and then falls back to ambiguity/recommendation exposure.

## Recommended Follow-Up

1. Standardize value names in product copy:
   - `Intended Payment Value`
   - `Settled / Confirmed Value`
   - `Unmatched Value`
   - `Short-Settled Value`
   - `Match-Risk Exposure`
   - `Connector Exposure`
   - `Evidence Coverage`
   - `Defensibility Score`
2. Add source hints beside repeated KPIs:
   - `from leakage`
   - `from ambiguity`
   - `from defensibility`
   - `from DLQ manual review`
   - `connector fallback`
3. Keep Payment Gaps as the canonical place for money-gap breakdowns. Home and Ask should summarize, not re-present every same amount.
