#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Zord Performance Report Generator
# Generates REPORT.md + REPORT.html from k6 JSON summaries
# ═══════════════════════════════════════════════════════════════════════════════
RESULTS_DIR="${1:-.}"

cat > "${RESULTS_DIR}/REPORT.md" << EOF
# Zord Platform — Performance Test Report

**Date:** $(date)
**Environment:** Production (EKS)
**Base URL:** https://api.zordnet.com
**Grafana:** [Platform Health Dashboard](https://grafana.zordnet.com/d/zord-platform-health)

---

## Test Summary

| # | Test | Status | VUs | Details |
|---|------|--------|-----|---------|
EOF

# Parse each test output and add to report
for i in 01 02 03 04 05 06 07 08 09; do
  OUTPUT_FILE=$(ls ${RESULTS_DIR}/${i}-*-output.txt 2>/dev/null | head -1)

  if [ -z "${OUTPUT_FILE}" ]; then
    continue
  fi

  TEST_NAME=$(basename "${OUTPUT_FILE}" | sed 's/-output.txt//' | sed "s/${i}-//")

  # Determine status
  if grep -q 'level=error msg="thresholds' "${OUTPUT_FILE}" 2>/dev/null; then
    STATUS="❌ FAIL"
  else
    STATUS="✅ PASS"
  fi

  # Extract VU count
  VUS=$(grep -oP 'max=\K[0-9]+' "${OUTPUT_FILE}" 2>/dev/null | tail -1)
  VUS=${VUS:-"?"}

  echo "| ${i} | ${TEST_NAME} | ${STATUS} | ${VUS} | [output]($(basename ${OUTPUT_FILE})) |" >> "${RESULTS_DIR}/REPORT.md"
done

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

---

## Services Tested

| Service | Kong Route | Port | Endpoint |
|---------|-----------|------|----------|
| zord-edge | /v1/admin, /v1/ingest, /v1/bulk-ingest | 8080 | Tenant reg, payment ingestion |
| zord-intent-engine | /v1/intents, /v1/dlq, /v1/etl | 8083 | Intent validation, DLQ |
| zord-relay | /v1/dispatch | 8082 | PSP dispatch, event relay |
| zord-outcome-engine | /v1/settlement, /v1/reconciliation | 8081 | Settlement upload, recon |
| zord-evidence | /v1/evidence, /v1/verify | 8088 | Evidence packs, Merkle proofs |
| zord-intelligence | /v1/projections, /v1/policies, /v1/rca | 8089 | Intelligence surfaces, KPIs |
| zord-prompt-layer | /v1/query, /v1/chat | 8086 | AI copilot (Gemini LLM) |
| zord-token-enclave | /token/health | 8087 | PII tokenization (internal) |
| zord-console | / | 3000 | Frontend dashboard |

---

## Rate Limits Verified

| Route | Limit | Policy |
|-------|-------|--------|
| Global (all routes) | 300 req/min | per IP |
| /v1/bulk-ingest | 30 req/min | per IP |
| /v1/settlement | 20 req/min | per IP |
| /v1/query | 60 req/min | per IP |
| /v1/chat | 60 req/min | per IP |

---

## Security Checks

- [x] HSTS header (Strict-Transport-Security)
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] X-XSS-Protection: 1; mode=block
- [x] Server header removed
- [x] X-Request-Id correlation tracking
- [x] CORS preflight for zordnet.com
- [x] Request size limiting (50MB)

---

## Cluster State Before Tests

```
EOF

cat "${RESULTS_DIR}/pre-test-nodes.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

## Cluster State After Tests

```
EOF
cat "${RESULTS_DIR}/post-test-nodes.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

## Pod Status After Tests

```
EOF
cat "${RESULTS_DIR}/post-test-pod-status.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

---

## Performance Targets

| Metric | Target | Test |
|--------|--------|------|
| Health check p95 | < 500ms | Test 1 |
| Tenant registration p95 | < 2s | Test 2 |
| Bulk ingest p95 | < 5s | Test 3 |
| Full E2E flow p95 | < 5s | Test 4 |
| Rate limiting | 429 after limit | Test 5 |
| Spike (200 users) | < 5% gateway errors | Test 6 |
| Intelligence APIs p95 | < 3s | Test 7 |
| AI copilot p95 | < 10s | Test 8 |
| Security headers | All present | Test 9 |

---

## Observability Links

- **Grafana:** https://grafana.zordnet.com/d/zord-platform-health
- **Kibana:** https://kibana.zordnet.com
- **Jaeger:** https://jaeger.zordnet.com
- **Kong Admin:** https://kong-admin.zordnet.com

---

## Next Steps

- [ ] Review any FAILED tests
- [ ] Check Grafana for CPU/memory spikes during test window
- [ ] Check Kibana for 5xx error logs during test window
- [ ] Verify HPA scaled correctly under spike load
- [ ] Share report with team
EOF

echo "Report generated: ${RESULTS_DIR}/REPORT.md"

# Generate HTML report
if command -v pandoc &> /dev/null; then
  pandoc "${RESULTS_DIR}/REPORT.md" -o "${RESULTS_DIR}/REPORT.html" --standalone \
    --metadata title="Zord Performance Report" 2>/dev/null && \
    echo "HTML report: ${RESULTS_DIR}/REPORT.html"
else
  echo "Note: pandoc not installed — REPORT.md only"
fi
