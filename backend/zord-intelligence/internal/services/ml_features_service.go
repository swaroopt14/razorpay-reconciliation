package services

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// MLFeaturesService computes lightweight ML-style derived metrics from existing projections.
// It reads only projection_state values and writes derived scores back into projection_state.
type MLFeaturesService struct {
	projectionRepo *persistence.ProjectionRepo
}

func NewMLFeaturesService(repo *persistence.ProjectionRepo) *MLFeaturesService {
	return &MLFeaturesService{projectionRepo: repo}
}

func (s *MLFeaturesService) RefreshForPair(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	if s.wasComputedRecently(ctx, tenantID, corridorID, 15*time.Second) {
		return nil
	}
	if err := s.computeAnomaly(ctx, tenantID, corridorID); err != nil {
		return err
	}
	if err := s.computeSLAForecast(ctx, tenantID, corridorID); err != nil {
		return err
	}
	if err := s.computeFailureClusters(ctx, tenantID, corridorID); err != nil {
		return err
	}
	return nil
}

func (s *MLFeaturesService) wasComputedRecently(
	ctx context.Context,
	tenantID, corridorID string,
	withIn time.Duration,
) bool {
	p, err := s.projectionRepo.GetLatest(ctx, tenantID, fmt.Sprintf("corridor.anomaly_score.%s", corridorID))
	if err != nil || p == nil {
		return false
	}
	age := time.Since(p.ComputedAt.UTC())
	if age < 0 {
		return false
	}
	return age < withIn
}

type mlProjectionValue struct {
	Value      float64   `json:"value"`
	RiskLevel  string    `json:"risk_level,omitempty"`
	ComputedAt time.Time `json:"computed_at"`
}

func (s *MLFeaturesService) computeAnomaly(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	var successVal models.SuccessRateValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.success_rate.%s", corridorID), &successVal); err != nil {
		return fmt.Errorf("ml_features.computeAnomaly success_rate corridor=%s: %w", corridorID, err)
	}
	if successVal.TotalCount < 10 {
		return s.upsertScore(ctx, tenantID,
			fmt.Sprintf("corridor.anomaly_score.%s", corridorID),
			0.0,
			"insufficient_data",
		)
	}

	var latencyVal models.FinalityLatencyValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.finality_latency.%s", corridorID), &latencyVal); err != nil {
		return fmt.Errorf("ml_features.computeAnomaly finality_latency corridor=%s: %w", corridorID, err)
	}

	var pendingVal models.PendingBacklogValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.pending_backlog.%s", corridorID), &pendingVal); err != nil {
		return fmt.Errorf("ml_features.computeAnomaly pending_backlog corridor=%s: %w", corridorID, err)
	}

	failureRate := 1.0 - successVal.Rate
	if failureRate < 0 {
		failureRate = 0
	}

	const (
		successMean = 0.95
		successStd  = 0.08
		failureMean = 0.05
		failureStd  = 0.08
		latencyMean = 900.0
		latencyStd  = 1800.0
		backlogMean = 30.0
		backlogStd  = 80.0
	)

	successDeviation := maxFloat64(0, (successMean-successVal.Rate)/successStd)
	failureDeviation := maxFloat64(0, (failureRate-failureMean)/failureStd)
	latencyDeviation := maxFloat64(0, (latencyVal.P95Seconds-latencyMean)/latencyStd)
	backlogPressure := float64(pendingVal.TotalPending) + 2.0*float64(pendingVal.Bucket1to6h) + 4.0*float64(pendingVal.Bucket6hPlus)
	backlogDeviation := maxFloat64(0, (backlogPressure-backlogMean)/backlogStd)

	score := 0.35*zToUnit(successDeviation) +
		0.30*zToUnit(failureDeviation) +
		0.20*zToUnit(latencyDeviation) +
		0.15*zToUnit(backlogDeviation)
	score = clamp01(score)

	return s.upsertScore(ctx, tenantID,
		fmt.Sprintf("corridor.anomaly_score.%s", corridorID), score, "")
}

func (s *MLFeaturesService) computeSLAForecast(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	var pendingVal models.PendingBacklogValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.pending_backlog.%s", corridorID), &pendingVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast pending_backlog corridor=%s: %w", corridorID, err)
	}

	var latencyVal models.FinalityLatencyValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.finality_latency.%s", corridorID), &latencyVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast finality_latency corridor=%s: %w", corridorID, err)
	}

	var successVal models.SuccessRateValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.success_rate.%s", corridorID), &successVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast success_rate corridor=%s: %w", corridorID, err)
	}

	var slaVal models.SLABreachRateValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID, "tenant.sla_breach_rate", &slaVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast sla_breach_rate tenant=%s: %w", tenantID, err)
	}

	var providerRefVal models.ProviderRefMissingRateValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.provider_ref_missing_rate.%s", corridorID), &providerRefVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast provider_ref_missing_rate corridor=%s: %w", corridorID, err)
	}

	var conflictVal models.ConflictRateInFusionValue
	if err := s.projectionRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.conflict_rate_in_fusion.%s", corridorID), &conflictVal); err != nil {
		return fmt.Errorf("ml_features.computeSLAForecast conflict_rate_in_fusion corridor=%s: %w", corridorID, err)
	}

	timeRemainingToSLAMin := estimateTimeRemainingToSLAMinutes(pendingVal)
	currentConfidence := clamp01(0.70*successVal.Rate + 0.20*(1.0-providerRefVal.MissingRate) + 0.10*(1.0-conflictVal.ConflictRate))
	signalCount := float64(latencyVal.Count)
	connectorHealth := connectorHealthLabel(providerRefVal.MissingRate, conflictVal.ConflictRate)

	level := "LOW"
	score := 0.20

	if timeRemainingToSLAMin < 10 && currentConfidence < 0.55 {
		level = "HIGH"
		score = 0.90
	} else if timeRemainingToSLAMin < 20 && connectorHealth == "DEGRADED" {
		level = "HIGH"
		score = 0.90
	} else if signalCount == 0 && timeRemainingToSLAMin < 15 {
		level = "HIGH"
		score = 0.90
	} else if timeRemainingToSLAMin < 30 || currentConfidence < 0.70 || connectorHealth == "DEGRADED" || slaVal.BreachRate > 0.10 {
		level = "MEDIUM"
		score = 0.60
	}

	score = clamp01(score)

	return s.upsertScore(ctx, tenantID,
		fmt.Sprintf("corridor.sla_breach_risk.%s", corridorID), score, level)
}

func (s *MLFeaturesService) computeFailureClusters(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	key := fmt.Sprintf("corridor.failure_taxonomy.%s", corridorID)
	row, err := s.projectionRepo.GetLatest(ctx, tenantID, key)
	if err != nil {
		return fmt.Errorf("ml_features.computeFailureClusters get latest corridor=%s: %w", corridorID, err)
	}

	score := 0.0
	if row != nil {
		var value struct {
			Reasons map[string]float64 `json:"reasons"`
		}
		if err := json.Unmarshal([]byte(row.ValueJSON), &value); err != nil {
			return fmt.Errorf("ml_features.computeFailureClusters unmarshal corridor=%s: %w", corridorID, err)
		}

		groupedReasons := make(map[string]float64)
		for reason, count := range value.Reasons {
			groupedReasons[clusterFailureReason(reason)] += count
		}

		top1 := 0.0
		top2 := 0.0
		total := 0.0
		for _, count := range groupedReasons {
			if count < 0 {
				continue
			}
			total += count
			if count > top1 {
				top2 = top1
				top1 = count
				continue
			}
			if count > top2 {
				top2 = count
			}
		}

		if total > 0 {
			dominantRatio := top1 / total
			shiftRatio := maxFloat64(0, (top1-top2)/total)
			score = clamp01(0.5*dominantRatio + 0.5*shiftRatio)
		}
	}

	return s.upsertScore(ctx, tenantID,
		fmt.Sprintf("corridor.failure_cluster_shift_score.%s", corridorID), score, "")
}

func (s *MLFeaturesService) upsertScore(
	ctx context.Context,
	tenantID, key string,
	score float64,
	riskLevel string,
) error {
	now := time.Now().UTC()
	windowStart := now.Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)

	value := mlProjectionValue{
		Value:      clamp01(score),
		RiskLevel:  riskLevel,
		ComputedAt: now,
	}

	if err := s.projectionRepo.UpsertWithValue(ctx, tenantID, key, windowStart, windowEnd, value); err != nil {
		return fmt.Errorf("ml_features.upsertScore key=%s: %w", key, err)
	}
	return nil
}

func zToUnit(z float64) float64 {
	if z <= 0 {
		return 0
	}
	return clamp01(z / 3.0)
}

func maxFloat64(a, b float64) float64 {
	return math.Max(a, b)
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func estimateTimeRemainingToSLAMinutes(pending models.PendingBacklogValue) float64 {
	if pending.Bucket6hPlus > 0 {
		return 0
	}
	if pending.Bucket1to6h > 0 {
		return 15
	}
	if pending.Bucket10to60m > 0 {
		return 30
	}
	if pending.Bucket0to10m > 0 || pending.TotalPending > 0 {
		return 45
	}
	return 60
}

func connectorHealthLabel(missingRate, conflictRate float64) string {
	if missingRate > 0.20 || conflictRate > 0.20 {
		return "DEGRADED"
	}
	return "HEALTHY"
}

func clusterFailureReason(reason string) string {
	r := strings.ToUpper(strings.TrimSpace(reason))
	if r == "" {
		return "UNKNOWN"
	}
	switch {
	case strings.Contains(r, "TIMEOUT"), strings.Contains(r, "TIMED_OUT"), strings.Contains(r, "LATENCY"):
		return "TIMEOUT"
	case strings.Contains(r, "FUND"), strings.Contains(r, "BALANCE"):
		return "FUNDS"
	case strings.Contains(r, "BANK"), strings.Contains(r, "UPI"), strings.Contains(r, "NETWORK"), strings.Contains(r, "PSP"):
		return "CONNECTOR"
	case strings.Contains(r, "AUTH"), strings.Contains(r, "OTP"), strings.Contains(r, "PIN"), strings.Contains(r, "KYC"):
		return "AUTH"
	case strings.Contains(r, "LIMIT"), strings.Contains(r, "THRESHOLD"):
		return "LIMIT"
	default:
		return "OTHER"
	}
}
