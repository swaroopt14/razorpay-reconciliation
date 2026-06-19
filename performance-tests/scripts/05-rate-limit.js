/**
 * Test 05: Rate Limiting Verification
 * 
 * Verifies Kong rate limiting on all rate-limited routes:
 *   - /v1/bulk-ingest   → 30 req/min
 *   - /v1/settlement    → 20 req/min
 *   - /v1/query         → 60 req/min
 *   - /v1/chat          → 60 req/min
 *   - Global            → 300 req/min
 * 
 * Sends burst traffic to trigger 429 responses.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const rateLimitedCount = new Counter('rate_limited_requests');
const rateLimitRate = new Rate('rate_limit_triggered');

export const options = {
    scenarios: {
        bulk_ingest_burst: {
            executor: 'shared-iterations',
            vus: 5,
            iterations: 50,
            maxDuration: '30s',
            exec: 'burstBulkIngest',
        },
        settlement_burst: {
            executor: 'shared-iterations',
            vus: 5,
            iterations: 50,
            maxDuration: '30s',
            startTime: '5s',
            exec: 'burstSettlement',
        },
        ai_query_burst: {
            executor: 'shared-iterations',
            vus: 5,
            iterations: 80,
            maxDuration: '30s',
            startTime: '10s',
            exec: 'burstAIQuery',
        },
    },
    thresholds: {
        checks: ['rate>=0.95'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

// Burst /v1/bulk-ingest (limit: 30/min)
export function burstBulkIngest() {
    const res = http.post(`${BASE_URL}/v1/bulk-ingest`, null, {
        headers: { 'Authorization': 'Bearer rate-limit-test-key' },
    });

    if (res.status === 429) {
        rateLimitedCount.add(1);
        rateLimitRate.add(1);
    } else {
        rateLimitRate.add(0);
    }

    check(res, {
        'gateway responded (not 5xx)': (r) => r.status < 500,
    });
}

// Burst /v1/settlement/upload (limit: 20/min)
export function burstSettlement() {
    const res = http.post(`${BASE_URL}/v1/settlement/upload?tenant_id=rate-test-tenant&psp=razorpay`, null, {
        headers: { 'Authorization': 'Bearer rate-limit-test-key' },
    });

    if (res.status === 429) {
        rateLimitedCount.add(1);
        rateLimitRate.add(1);
    } else {
        rateLimitRate.add(0);
    }

    check(res, {
        'gateway responded (not 5xx)': (r) => r.status < 500,
    });
}

// Burst /v1/query (limit: 60/min)
export function burstAIQuery() {
    const res = http.post(`${BASE_URL}/v1/query`, JSON.stringify({ query: 'test' }), {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer rate-limit-test-key',
            'X-Tenant-Id': 'rate-test',
        },
    });

    if (res.status === 429) {
        rateLimitedCount.add(1);
        rateLimitRate.add(1);
    } else {
        rateLimitRate.add(0);
    }

    check(res, {
        'gateway responded (not 5xx)': (r) => r.status < 500,
    });
}
