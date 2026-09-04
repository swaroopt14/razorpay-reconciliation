package persistence

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

// SLATimerRepo handles reads and writes for the sla_timers table.
// The SLAWorker (in the worker package) uses this to query breached timers.
// The ProjectionService uses this to seed and resolve timers.
type SLATimerRepo struct {
	pool *pgxpool.Pool
}

// NewSLATimerRepo creates an SLATimerRepo.
func NewSLATimerRepo(pool *pgxpool.Pool) *SLATimerRepo {
	return &SLATimerRepo{pool: pool}
}

// SeedTimer creates a new SLA timer when an intent arrives.
//
// DEFAULT SLA: 6 hours from intent creation.
// Future improvement: read corridor-specific SLA from a config table.
//
// ON CONFLICT DO NOTHING = safe to call multiple times for the same intent.
// If Kafka delivers the same intent event twice (at-least-once), the second
// seed is silently ignored because of the UNIQUE constraint on (tenant_id, intent_id).
func (r *SLATimerRepo) SeedTimer(
	ctx context.Context,
	e models.IntentCreatedEvent,
) error {
	const slaHours = 6
	deadline := e.CreatedAt.Add(slaHours * time.Hour)

	sql := `
		INSERT INTO sla_timers
			(intent_id, tenant_id, corridor_id, sla_deadline, status, created_at)
		VALUES
			($1, $2, $3, $4, 'ACTIVE', $5)
		ON CONFLICT (tenant_id, intent_id) DO NOTHING
	`
	if _, err := r.pool.Exec(ctx, sql,
		e.IntentID, e.TenantID, e.CorridorID, deadline, e.CreatedAt,
	); err != nil {
		return fmt.Errorf("sla_timer_repo.SeedTimer intent=%s: %w", e.IntentID, err)
	}
	return nil
}

// ResolveTimer marks an intent's timer as RESOLVED when finality is reached.
//
// WHERE status = 'ACTIVE' prevents overwriting a BREACHED timer.
// Once breached, the timer stays BREACHED even if finality arrives late.
// This preserves the audit record: "yes, this payout breached SLA".
func (r *SLATimerRepo) ResolveTimer(
	ctx context.Context,
	intentID, tenantID string,
) error {
	sql := `
		UPDATE sla_timers
		SET    status      = 'RESOLVED',
		       resolved_at = $1
		WHERE  intent_id   = $2
		  AND  tenant_id   = $3
		  AND  status      = 'ACTIVE'
	`
	if _, err := r.pool.Exec(ctx, sql, time.Now().UTC(), intentID, tenantID); err != nil {
		return fmt.Errorf("sla_timer_repo.ResolveTimer intent=%s: %w", intentID, err)
	}
	return nil
}

// FetchBreachedTimers returns all ACTIVE timers past their deadline
// that have not yet been notified.
// Called by the SLAWorker every 5 minutes.
//
// ORDER BY sla_deadline ASC = process the most overdue timers first.
// LIMIT 100 = process in manageable batches; if more than 100 breach at once,
// the next run will catch the rest.
func (r *SLATimerRepo) FetchBreachedTimers(ctx context.Context) ([]SLATimerRow, error) {
	sql := `
		SELECT id, intent_id, tenant_id, corridor_id,
		       sla_deadline, status, resolved_at, notified_at, created_at
		FROM   sla_timers
		WHERE  status       = 'ACTIVE'
		  AND  sla_deadline < now()
		  AND  notified_at  IS NULL
		ORDER  BY sla_deadline ASC
		LIMIT  100
	`
	rows, err := r.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("sla_timer_repo.FetchBreachedTimers: %w", err)
	}
	defer rows.Close()

	var result []SLATimerRow
	for rows.Next() {
		var t SLATimerRow
		if err := rows.Scan(
			&t.ID, &t.IntentID, &t.TenantID, &t.CorridorID,
			&t.SLADeadline, &t.Status, &t.ResolvedAt, &t.NotifiedAt, &t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("sla_timer_repo.FetchBreachedTimers scan: %w", err)
		}
		result = append(result, t)
	}
	return result, nil
}

// MarkBreached marks a timer as BREACHED and records when we notified ops.
// Prevents duplicate alerts on the next SLA worker run.
func (r *SLATimerRepo) MarkBreached(ctx context.Context, id int64) error {
	sql := `
		UPDATE sla_timers
		SET    status      = 'BREACHED',
		       notified_at = $1
		WHERE  id          = $2
	`
	if _, err := r.pool.Exec(ctx, sql, time.Now().UTC(), id); err != nil {
		return fmt.Errorf("sla_timer_repo.MarkBreached id=%d: %w", id, err)
	}
	return nil
}

// CountSLAForTenant returns (active, breached, total) timer counts for a tenant.
// Used by PatternIntelligenceService to compute pending_beyond_sla_rate.
// active  = ACTIVE timers past their sla_deadline (pending beyond SLA)
// breached = already marked BREACHED
// total   = all ACTIVE + BREACHED timers for tenant
func (r *SLATimerRepo) CountSLAForTenant(ctx context.Context, tenantID string) (beyondSLA, total int, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'ACTIVE' AND sla_deadline < now()),
			COUNT(*) FILTER (WHERE status IN ('ACTIVE','BREACHED'))
		FROM sla_timers
		WHERE tenant_id = $1
	`, tenantID).Scan(&beyondSLA, &total)
	if err != nil {
		err = fmt.Errorf("sla_timer_repo.CountSLAForTenant tenant=%s: %w", tenantID, err)
	}
	return
}

// SLATimerRow mirrors one row from the sla_timers table.
// Moved here from sla_worker.go — both the repo and the worker use this type.
type SLATimerRow struct {
	ID          int64
	IntentID    string
	TenantID    string
	CorridorID  string
	SLADeadline time.Time
	Status      string
	ResolvedAt  *time.Time
	NotifiedAt  *time.Time
	CreatedAt   time.Time
}
