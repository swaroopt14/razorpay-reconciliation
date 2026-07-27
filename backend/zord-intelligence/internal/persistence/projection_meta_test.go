package persistence

// projection_meta_test.go — Phase 3 refactor.
//
// Pure-Go unit tests for keyToProjectionMeta. No database required — these
// run in every `go test ./...` / CI pass, unlike the TEST_DB_URL-gated
// integration tests in projection_state_phase3_test.go.
//
// keyToProjectionMeta's derivation MUST match db/migrations/009's SQL
// derivation exactly (that migration's header comment documents the same
// table this test asserts against) — a backfilled row and a freshly-written
// row for the same projection_key must be indistinguishable. If you change
// one, change the other and update both comments.

import (
	"testing"
	"time"
)

func TestKeyToProjectionMeta(t *testing.T) {
	rolling := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	rollingEnd := rolling.Add(24 * time.Hour)

	cases := []struct {
		name        string
		tenantID    string
		key         string
		windowStart time.Time
		windowEnd   time.Time
		want        projectionMeta
	}{
		{
			name:     "corridor metric",
			tenantID: "tnt_A", key: "corridor.success_rate.razorpay_UPI",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "RELIABILITY", ScopeType: ScopeCorridor, ScopeRef: "razorpay_UPI", MetricKey: "success_rate", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "leakage tenant total",
			tenantID: "tnt_A", key: "leakage.total",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "LEAKAGE", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "total", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "leakage batch (lifetime window)",
			tenantID: "tnt_A", key: "leakage.batch.PAYROLL-2026-04-01",
			windowStart: BatchProjectionWindowStart, windowEnd: BatchProjectionWindowEnd,
			want: projectionMeta{Family: "LEAKAGE", ScopeType: ScopeBatch, ScopeRef: "PAYROLL-2026-04-01", MetricKey: "total", WindowType: WindowBatchLifetime, Retention: RetentionDerivedCache},
		},
		{
			name:     "leakage batch unbatched bucket",
			tenantID: "tnt_A", key: "leakage.batch." + UnbatchedScopeRef,
			windowStart: BatchProjectionWindowStart, windowEnd: BatchProjectionWindowEnd,
			want: projectionMeta{Family: "LEAKAGE", ScopeType: ScopeBatch, ScopeRef: UnbatchedScopeRef, MetricKey: "total", WindowType: WindowBatchLifetime, Retention: RetentionDerivedCache},
		},
		{
			name:     "ambiguity tenant summary",
			tenantID: "tnt_A", key: "ambiguity.summary",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "AMBIGUITY", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "summary", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "ambiguity batch",
			tenantID: "tnt_A", key: "ambiguity.batch.B1",
			windowStart: BatchProjectionWindowStart, windowEnd: BatchProjectionWindowEnd,
			want: projectionMeta{Family: "AMBIGUITY", ScopeType: ScopeBatch, ScopeRef: "B1", MetricKey: "summary", WindowType: WindowBatchLifetime, Retention: RetentionDerivedCache},
		},
		{
			name:     "defensibility tenant summary",
			tenantID: "tnt_A", key: "defensibility.summary",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "DEFENSIBILITY", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "summary", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "defensibility batch",
			tenantID: "tnt_A", key: "defensibility.batch.B1",
			windowStart: BatchProjectionWindowStart, windowEnd: BatchProjectionWindowEnd,
			want: projectionMeta{Family: "DEFENSIBILITY", ScopeType: ScopeBatch, ScopeRef: "B1", MetricKey: "summary", WindowType: WindowBatchLifetime, Retention: RetentionDerivedCache},
		},
		{
			name:     "rca tenant summary",
			tenantID: "tnt_A", key: "rca.summary",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "RCA", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "summary", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "rca fragment (ephemeral)",
			tenantID: "tnt_A", key: "rca.frag.B1.intent-42",
			windowStart: rolling, windowEnd: rolling.Add(7 * 24 * time.Hour),
			want: projectionMeta{Family: "RCA", ScopeType: ScopeIntent, ScopeRef: "B1.intent-42", MetricKey: "frag", WindowType: WindowEphemeral, Retention: RetentionTempFragment},
		},
		{
			name:     "batch health",
			tenantID: "tnt_A", key: "batch.health.B1",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeBatch, ScopeRef: "B1", MetricKey: "health", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "tenant evidence readiness (legacy key shape)",
			tenantID: "tnt_A", key: "tenant.evidence_readiness",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "DEFENSIBILITY", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "evidence_readiness", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "tenant sla breach rate",
			tenantID: "tnt_A", key: "tenant.sla_breach_rate",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "SLA", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "sla_breach_rate", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "dlq count by topic (SOURCE scope)",
			tenantID: "tnt_A", key: "dlq.count.payments.intent.dlq",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "RELIABILITY", ScopeType: ScopeSource, ScopeRef: "payments.intent.dlq", MetricKey: "dlq_count", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern p2_p6",
			tenantID: "tnt_A", key: "pattern.p2_p6",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "p2_p6", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern tenant summary",
			tenantID: "tnt_A", key: "pattern.tenant_summary",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeTenant, ScopeRef: "tnt_A", MetricKey: "tenant_summary", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern batch density",
			tenantID: "tnt_A", key: "pattern.batch_density.B1",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeBatch, ScopeRef: "B1", MetricKey: "batch_density", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern source quality",
			tenantID: "tnt_A", key: "pattern.source.tally",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeSource, ScopeRef: "tally", MetricKey: "source_quality", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern ambiguity by source",
			tenantID: "tnt_A", key: "pattern.ambiguity.source.tally",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeSource, ScopeRef: "tally", MetricKey: "ambiguity_by_source", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern variance by source",
			tenantID: "tnt_A", key: "pattern.variance.source.tally",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeSource, ScopeRef: "tally", MetricKey: "variance_by_source", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern provider quality (PSP scope)",
			tenantID: "tnt_A", key: "pattern.provider.razorpay",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopePSP, ScopeRef: "razorpay", MetricKey: "provider_quality", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
		{
			name:     "pattern bank quality (BANK scope)",
			tenantID: "tnt_A", key: "pattern.bank.hdfc",
			windowStart: rolling, windowEnd: rollingEnd,
			want: projectionMeta{Family: "PATTERN", ScopeType: ScopeBank, ScopeRef: "hdfc", MetricKey: "bank_quality", WindowType: WindowRolling24h, Retention: RetentionDerivedCache},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := keyToProjectionMeta(tc.tenantID, tc.key, tc.windowStart, tc.windowEnd)
			if got.Family != tc.want.Family {
				t.Errorf("Family: got %q want %q", got.Family, tc.want.Family)
			}
			if got.ScopeType != tc.want.ScopeType {
				t.Errorf("ScopeType: got %q want %q", got.ScopeType, tc.want.ScopeType)
			}
			if got.ScopeRef != tc.want.ScopeRef {
				t.Errorf("ScopeRef: got %q want %q", got.ScopeRef, tc.want.ScopeRef)
			}
			if got.MetricKey != tc.want.MetricKey {
				t.Errorf("MetricKey: got %q want %q", got.MetricKey, tc.want.MetricKey)
			}
			if got.WindowType != tc.want.WindowType {
				t.Errorf("WindowType: got %q want %q", got.WindowType, tc.want.WindowType)
			}
			if got.Retention != tc.want.Retention {
				t.Errorf("Retention: got %q want %q", got.Retention, tc.want.Retention)
			}
		})
	}
}

// TestKeyToProjectionMeta_ExpiresAt asserts the three expiry rules: EPHEMERAL
// rows expire ~10 minutes out, ROLLING_24H rows expire 90 days past window_end,
// and BATCH_LIFETIME rows never expire (Phase 9+ decides batch retention).
func TestKeyToProjectionMeta_ExpiresAt(t *testing.T) {
	windowEnd := time.Date(2026, 7, 16, 0, 0, 0, 0, time.UTC)

	t.Run("rolling 24h expires 90 days past window_end", func(t *testing.T) {
		m := keyToProjectionMeta("tnt_A", "leakage.total", windowEnd.Add(-24*time.Hour), windowEnd)
		if m.ExpiresAt == nil {
			t.Fatal("expected non-nil ExpiresAt for ROLLING_24H")
		}
		want := windowEnd.Add(90 * 24 * time.Hour)
		if !m.ExpiresAt.Equal(want) {
			t.Errorf("ExpiresAt: got %v want %v", *m.ExpiresAt, want)
		}
	})

	t.Run("batch lifetime never expires", func(t *testing.T) {
		m := keyToProjectionMeta("tnt_A", "leakage.batch.B1", BatchProjectionWindowStart, BatchProjectionWindowEnd)
		if m.ExpiresAt != nil {
			t.Errorf("expected nil ExpiresAt for BATCH_LIFETIME, got %v", *m.ExpiresAt)
		}
	})

	t.Run("ephemeral fragment expires ~10 minutes out", func(t *testing.T) {
		before := time.Now().UTC()
		m := keyToProjectionMeta("tnt_A", "rca.frag.B1.intent-1", before, before.Add(7*24*time.Hour))
		after := time.Now().UTC()
		if m.ExpiresAt == nil {
			t.Fatal("expected non-nil ExpiresAt for EPHEMERAL")
		}
		if m.ExpiresAt.Before(before.Add(10*time.Minute)) || m.ExpiresAt.After(after.Add(10*time.Minute)) {
			t.Errorf("ExpiresAt %v not within expected ~10min window [%v, %v]",
				*m.ExpiresAt, before.Add(10*time.Minute), after.Add(10*time.Minute))
		}
	})
}

// TestUnbatchedScopeRef documents the bug-E1 contract: an empty batch id must
// never reach SQL as a literal empty string interpolated into a projection
// key — it must resolve to the explicit sentinel bucket instead.
func TestUnbatchedScopeRef(t *testing.T) {
	if UnbatchedScopeRef == "" {
		t.Fatal("UnbatchedScopeRef must not be empty — that's the exact bug (E1) this constant exists to prevent")
	}
}
