/**
 * Test 01: Health Check — All Service Health Endpoints
 * 
 * Verifies all 9 backend services are alive and responding through Kong.
 * Hits dedicated health endpoints + service-specific routes.
 * 
 * Services tested:
 *   - zord-edge (/edge/health)
 *   - zord-intent-engine (/intent/health)
 *   - zord-relay (/relay/health)
 *   - zord-outcome-engine (/outcome/health)
 *   - zord-evidence (/evidence/health)
 *   - zord-intelligence (/intelligence/health)
 *   - zord-prompt-layer (/prompt/health)
 *   - zord-token-enclave (/token/health)
 *   - zord-console (/)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const serviceLatency = new Trend('service_latency', true);
const healthyServices = new Counter('healthy_services');
const unhealthyServices = new Counter('unhealthy_services');

export const options = {
    stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.95'],
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

const HEALTH_ENDPOINTS = [
    { name: 'zord-edge', path: '/edge/health' },
    { name: 'zord-intent-engine', path: '/intent/health' },
    { name: 'zord-relay', path: '/relay/health' },
    { name: 'zord-outcome-engine', path: '/outcome/health' },
    { name: 'zord-evidence', path: '/evidence/health' },
    { name: 'zord-intelligence', path: '/intelligence/health' },
    { name: 'zord-prompt-layer', path: '/prompt/health' },
    { name: 'zord-token-enclave', path: '/token/health' },
    { name: 'zord-console', path: '/' },
];

export default function () {
    const endpoint = HEALTH_ENDPOINTS[Math.floor(Math.random() * HEALTH_ENDPOINTS.length)];
    const res = http.get(`${BASE_URL}${endpoint.path}`, {
        tags: { service: endpoint.name },
    });

    serviceLatency.add(res.timings.duration, { service: endpoint.name });

    const isHealthy = res.status !== 502 && res.status !== 503 && res.status !== 0;
    if (isHealthy) {
        healthyServices.add(1);
    } else {
        unhealthyServices.add(1);
    }

    check(res, {
        'service alive (not 502/503)': (r) => r.status !== 502 && r.status !== 503,
        'response time < 500ms': (r) => r.timings.duration < 500,
        'response body present': (r) => r.body && r.body.length > 0,
    });

    sleep(0.5);
}
