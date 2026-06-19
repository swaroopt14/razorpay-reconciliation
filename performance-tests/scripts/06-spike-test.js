/**
 * Test 06: Spike Test — 200 Concurrent Users
 * 
 * Simulates sudden traffic spike hitting ALL Kong routes simultaneously.
 * Verifies gateway stability under extreme load.
 * 
 * Pattern: 0 → 200 users in 5 seconds, hold 30s, recover
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const gatewayErrors = new Counter('gateway_errors');
const spikeLatency = new Trend('spike_latency', true);

export const options = {
    stages: [
        { duration: '10s', target: 0 },
        { duration: '5s', target: 200 },
        { duration: '30s', target: 200 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.90'],
        http_req_duration: ['p(95)<5000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

// All Kong routes to spike simultaneously
const ENDPOINTS = [
    { method: 'GET', path: '/edge/health' },
    { method: 'GET', path: '/v1/intents?tenant_id=spike-test&limit=1' },
    { method: 'GET', path: '/v1/projections?tenant_id=spike-test' },
    { method: 'GET', path: '/v1/dispatch?tenant_id=spike-test' },
    { method: 'GET', path: '/v1/evidence/packs?tenant_id=spike-test' },
    { method: 'GET', path: '/v1/settlement/supported-psps' },
    { method: 'GET', path: '/v1/policies?tenant_id=spike-test' },
    { method: 'GET', path: '/v1/rca?tenant_id=spike-test' },
    { method: 'GET', path: '/intent/health' },
    { method: 'GET', path: '/relay/health' },
    { method: 'GET', path: '/outcome/health' },
    { method: 'GET', path: '/evidence/health' },
];

export default function () {
    const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const url = `${BASE_URL}${endpoint.path}`;

    let res;
    if (endpoint.method === 'GET') {
        res = http.get(url, {
            headers: { 'Authorization': 'Bearer spike-test-key' },
        });
    } else {
        res = http.post(url, JSON.stringify({ query: 'spike test' }), {
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer spike-test-key' },
        });
    }

    spikeLatency.add(res.timings.duration);

    if (res.status === 502 || res.status === 503) {
        gatewayErrors.add(1);
    }

    check(res, {
        'gateway alive (not 502/503)': (r) => r.status !== 502 && r.status !== 503,
        'response time < 5s': (r) => r.timings.duration < 5000,
    });

    sleep(0.2);
}
