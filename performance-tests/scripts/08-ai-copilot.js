/**
 * Test 08: AI Copilot — zord-prompt-layer Endpoints
 * 
 * Tests the AI/LLM-powered endpoints:
 *   - POST /v1/query  (AI copilot natural language query)
 *   - POST /v1/chat   (AI chat conversation)
 * 
 * Rate limit: 60 req/min on both
 * Timeout: 120s (LLM responses can be slow)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const queryLatency = new Trend('ai_query_latency', true);
const chatLatency = new Trend('ai_chat_latency', true);
const aiSuccesses = new Counter('ai_successful_responses');

export const options = {
    stages: [
        { duration: '30s', target: 3 },
        { duration: '2m', target: 10 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.85'],
        http_req_duration: ['p(95)<10000'],  // 10s — LLM can be slow
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export function setup() {
    const res = http.post(
        `${BASE_URL}/v1/admin/tenantReg`,
        JSON.stringify({ name: `perf-ai-${Date.now()}` }),
        { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
    );
    if (res.status === 201) {
        const body = JSON.parse(res.body);
        return { apiKey: body.APIKEY, tenantId: body.TenantId };
    }
    return { apiKey: '', tenantId: 'test-tenant' };
}

const QUERIES = [
    'show me payout summary for today',
    'what is the total settlement amount this week',
    'list failed payments in last 24 hours',
    'show me top 5 beneficiaries by amount',
    'what is the average payment processing time',
    'show reconciliation status for this month',
    'how many intents are in DLQ',
    'what is the success rate for HDFC corridor',
];

const CHAT_MESSAGES = [
    'what is my failure rate this week?',
    'show me the leakage risk',
    'any anomalies detected today?',
    'summarize today operations',
];

export default function (data) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': data.apiKey ? `Bearer ${data.apiKey}` : 'Bearer test-key',
        'X-Tenant-Id': data.tenantId,
    };

    // AI Query
    group('ai_query', function () {
        const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
        const start = Date.now();

        const res = http.post(`${BASE_URL}/v1/query`, JSON.stringify({ query }), { headers });

        queryLatency.add(Date.now() - start);
        if (res.status === 200) aiSuccesses.add(1);

        check(res, {
            'ai query reachable': (r) => r.status < 500,
            'response time < 30s': (r) => r.timings.duration < 30000,
        });
    });

    sleep(2);

    // AI Chat
    group('ai_chat', function () {
        const message = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
        const start = Date.now();

        const res = http.post(`${BASE_URL}/v1/chat`, JSON.stringify({ message }), { headers });

        chatLatency.add(Date.now() - start);
        if (res.status === 200) aiSuccesses.add(1);

        check(res, {
            'ai chat reachable': (r) => r.status < 500,
            'response time < 30s': (r) => r.timings.duration < 30000,
        });
    });

    sleep(3);
}
