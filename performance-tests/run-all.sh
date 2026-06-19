#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Zord Platform — Automated Performance Testing
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: bash performance-tests/run-all.sh
# Results: performance-tests/results/<timestamp>/
# ═══════════════════════════════════════════════════════════════════════════════

BASE_URL="${BASE_URL:-https://api.zordnet.com}"
ADMIN_KEY="${ADMIN_KEY:-zord123}"
RESULTS_DIR="performance-tests/results/$(date +%Y-%m-%d_%H-%M-%S)"
SCRIPTS_DIR="performance-tests/scripts"

echo "═══════════════════════════════════════════════════════════════"
echo "  Zord Platform — Performance Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo "  Base URL: ${BASE_URL}"
echo "  Results:  ${RESULTS_DIR}"
echo "  Time:     $(date)"
echo "═══════════════════════════════════════════════════════════════"

mkdir -p "${RESULTS_DIR}"

# ── Pre-test: Capture cluster state ──────────────────────────────────────────
echo ""
echo "[PRE-TEST] Capturing cluster state..."
kubectl top nodes > "${RESULTS_DIR}/pre-test-nodes.txt" 2>/dev/null || echo "kubectl not available" > "${RESULTS_DIR}/pre-test-nodes.txt"
kubectl top pods -n zord > "${RESULTS_DIR}/pre-test-pods.txt" 2>/dev/null || echo "kubectl not available" > "${RESULTS_DIR}/pre-test-pods.txt"
kubectl get hpa -n zord > "${RESULTS_DIR}/pre-test-hpa.txt" 2>/dev/null || echo "kubectl not available" > "${RESULTS_DIR}/pre-test-hpa.txt"

# ── Test 1: Health Check Load Test ───────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 1: Health Check Load Test (100 concurrent users)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/01-health-check-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  "${SCRIPTS_DIR}/01-health-check.js" \
  2>&1 | tee "${RESULTS_DIR}/01-health-check-output.txt"

# ── Test 2: Tenant Registration ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 2: Tenant Registration (20 concurrent users)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/02-tenant-reg-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  --env ADMIN_KEY="${ADMIN_KEY}" \
  "${SCRIPTS_DIR}/02-tenant-registration.js" \
  2>&1 | tee "${RESULTS_DIR}/02-tenant-reg-output.txt"

# ── Test 3: Bulk Ingest ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 3: Bulk Ingest CSV Upload (10 concurrent users)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/03-bulk-ingest-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  --env ADMIN_KEY="${ADMIN_KEY}" \
  "${SCRIPTS_DIR}/03-bulk-ingest.js" \
  2>&1 | tee "${RESULTS_DIR}/03-bulk-ingest-output.txt"

# ── Test 4: Full End-to-End Flow ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 4: Full End-to-End Flow (20 concurrent users)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/04-full-flow-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  --env ADMIN_KEY="${ADMIN_KEY}" \
  "${SCRIPTS_DIR}/04-full-flow.js" \
  2>&1 | tee "${RESULTS_DIR}/04-full-flow-output.txt"

# ── Test 5: Rate Limiting Verification ───────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 5: Rate Limiting Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/05-rate-limit-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  "${SCRIPTS_DIR}/05-rate-limit.js" \
  2>&1 | tee "${RESULTS_DIR}/05-rate-limit-output.txt"

# ── Test 6: Spike Test (Sudden Traffic Burst) ────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 6: Spike Test (0 → 200 users suddenly)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
k6 run \
  --summary-export="${RESULTS_DIR}/06-spike-test-summary.json" \
  --env BASE_URL="${BASE_URL}" \
  "${SCRIPTS_DIR}/06-spike-test.js" \
  2>&1 | tee "${RESULTS_DIR}/06-spike-test-output.txt"

# ── Post-test: Capture cluster state ─────────────────────────────────────────
echo ""
echo "[POST-TEST] Capturing cluster state..."
kubectl top nodes > "${RESULTS_DIR}/post-test-nodes.txt" 2>/dev/null || true
kubectl top pods -n zord > "${RESULTS_DIR}/post-test-pods.txt" 2>/dev/null || true
kubectl get hpa -n zord > "${RESULTS_DIR}/post-test-hpa.txt" 2>/dev/null || true
kubectl get pods -n zord > "${RESULTS_DIR}/post-test-pod-status.txt" 2>/dev/null || true

# ── Generate Report ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GENERATING REPORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash performance-tests/generate-report.sh "${RESULTS_DIR}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALL TESTS COMPLETE"
echo "  Results: ${RESULTS_DIR}"
echo "  Report:  ${RESULTS_DIR}/REPORT.md"
echo "═══════════════════════════════════════════════════════════════"
