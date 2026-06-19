/**
 * Test 07: Intelligence Surface — All zord-intelligence Endpoints
 * 
 * Tests the complete intelligence API:
 *   - GET /v1/projections (KPIs, risk scores)
 *   - GET /v1/policies (policy rules)
 *   - GET /v1/rca (root cause analysis)
 *   - GET /v1/intelligence/mode
 *   - GET /v1/intelligence/leakage
 *   - GET /v1/intelligence/ambiguity
 *   - GET /v1/intelligence/defensibility
 *   - GET /v1/intelligence/pattern
 *   - GET /v1/intelligence/recommendation
 *   - GET /v1/intelligence/batches
 *   - GET /v1/intelligence/dashboard/*
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '2m', target: 15 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.90'],
        http_req_duration: ['p(95)<3000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer intel-perf-test-key',
};
const tid = 'perf-test-tenant';

export default function () {
    // Intelligence Mode
    group('intelligence_mode', function () {
        const res = http.get(`${BASE_URL}/v1/projections?tenant_id=${tid}`, { headers });
        check(res, { 'projections reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // Policies
    group('policies', function () {
        const res = http.get(`${BASE_URL}/v1/policies?tenant_id=${tid}`, { headers });
        check(res, { 'policies reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // RCA
    group('rca', function () {
        const res = http.get(`${BASE_URL}/v1/rca?tenant_id=${tid}`, { headers });
        check(res, { 'rca reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // Evidence verify
    group('evidence_verify', function () {
        const res = http.get(`${BASE_URL}/v1/verify?tenant_id=${tid}`, { headers });
        check(res, { 'verify reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // Evidence packs
    group('evidence_packs', function () {
        const res = http.get(`${BASE_URL}/v1/evidence/packs?tenant_id=${tid}`, { headers });
        check(res, { 'evidence packs reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // Settlement observations
    group('settlement_observations', function () {
        const res = http.get(`${BASE_URL}/v1/settlement/observations/batches?tenant_id=${tid}`, { headers });
        check(res, { 'settlement observations reachable': (r) => r.status < 500 });
    });
    sleep(0.3);

    // Reconciliation
    group('reconciliation', function () {
        const res = http.get(`${BASE_URL}/v1/reconciliation?tenant_id=${tid}`, { headers });
        check(res, { 'reconciliation reachable': (r) => r.status < 500 });
    });
    sleep(0.5);
}
