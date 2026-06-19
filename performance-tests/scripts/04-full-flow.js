/**
 * Test 04: Full End-to-End Flow — All Services
 * 
 * Simulates a complete payment lifecycle:
 *   1. Register tenant (zord-edge)
 *   2. Single payment ingest (zord-edge)
 *   3. Query intents (zord-intent-engine)
 *   4. Query DLQ (zord-intent-engine)
 *   5. Check dispatch status (zord-relay)
 *   6. Upload settlement (zord-outcome-engine)
 *   7. Query reconciliation (zord-outcome-engine)
 *   8. Generate evidence pack (zord-evidence)
 *   9. Query projections (zord-intelligence)
 *   10. Query policies (zord-intelligence)
 *   11. AI copilot query (zord-prompt-layer)
 *   12. AI chat (zord-prompt-layer)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

const groupLatency = new Trend('group_latency', true);

export const options = {
    stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 20 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.90'],
        http_req_duration: ['p(95)<5000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export default function () {
    let apiKey, tenantId;

    // ── 1. Register Tenant ─────────────────────────────────────────────────
    group('01_register_tenant', function () {
        const start = Date.now();
        const res = http.post(
            `${BASE_URL}/v1/admin/tenantReg`,
            JSON.stringify({ name: `e2e-${Date.now()}-${__VU}-${__ITER}` }),
            { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
        );
        groupLatency.add(Date.now() - start, { group: 'register_tenant' });
        check(res, { 'tenant endpoint reachable': (r) => r.status < 500 });
        if (res.status === 201) {
            try {
                const body = JSON.parse(res.body);
                apiKey = body.APIKEY;
                tenantId = body.TenantId;
            } catch (e) { }
        }
    });

    sleep(0.5);

    const authHeaders = apiKey
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
        : { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-key' };
    const tid = tenantId || 'test-tenant';

    // ── 2. Single Payment Ingest ───────────────────────────────────────────
    group('02_single_ingest', function () {
        const start = Date.now();
        const res = http.post(`${BASE_URL}/v1/ingest`, JSON.stringify({
            amount: 50000, currency: 'INR',
            beneficiary_name: `E2E-User-${__VU}`,
            beneficiary_account: `${1000000000 + __ITER}`,
            beneficiary_ifsc: 'HDFC0001234', purpose: 'salary',
        }), { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'single_ingest' });
        check(res, { 'ingest reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 3. Query Intents ───────────────────────────────────────────────────
    group('03_query_intents', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/intents?tenant_id=${tid}&limit=5`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'query_intents' });
        check(res, { 'intents reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 4. Query DLQ ───────────────────────────────────────────────────────
    group('04_query_dlq', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/dlq?tenant_id=${tid}&limit=5`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'query_dlq' });
        check(res, { 'dlq reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 5. Check Dispatch Status ───────────────────────────────────────────
    group('05_dispatch_status', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/dispatch?tenant_id=${tid}`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'dispatch' });
        check(res, { 'dispatch reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 6. Settlement: Supported PSPs ─────────────────────────────────────
    group('06_settlement_psps', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/settlement/supported-psps`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'settlement_psps' });
        check(res, { 'settlement psps reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 6b. Settlement: Upload CSV ─────────────────────────────────────────
    group('06b_settlement_upload', function () {
        const start = Date.now();
        // Use real settlement CSV format matching zord_settlement data
        const settlementCsv = [
            'utr,amount,status,beneficiary_name,beneficiary_account,ifsc,payment_mode,transaction_date',
            `UTR${Date.now()}${__VU}0,50000.00,SUCCESS,PerfSettle User1,271541000001,AXIS0001239,NEFT,2026-06-12`,
            `UTR${Date.now()}${__VU}1,25000.00,SUCCESS,PerfSettle User2,634212000002,UBIN0001241,IMPS,2026-06-12`,
            `UTR${Date.now()}${__VU}2,75000.00,FAILED,PerfSettle User3,414201000003,SBIN0001236,RTGS,2026-06-12`,
        ].join('\n');

        const res = http.post(
            `${BASE_URL}/v1/settlement/upload?tenant_id=${tid}&psp=razorpay`,
            { file: http.file(settlementCsv, 'settlement-perf.csv', 'text/csv') },
            { headers: { 'Authorization': authHeaders['Authorization'] } }
        );
        groupLatency.add(Date.now() - start, { group: 'settlement_upload' });
        check(res, { 'settlement upload reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 7. Reconciliation Query ────────────────────────────────────────────
    group('07_reconciliation', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/reconciliation?tenant_id=${tid}`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'reconciliation' });
        check(res, { 'reconciliation reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 8. Evidence Packs ──────────────────────────────────────────────────
    group('08_evidence', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/evidence/packs?tenant_id=${tid}`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'evidence' });
        check(res, { 'evidence reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 9. Intelligence Projections ────────────────────────────────────────
    group('09_projections', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/projections?tenant_id=${tid}`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'projections' });
        check(res, { 'projections reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 10. Intelligence Policies ──────────────────────────────────────────
    group('10_policies', function () {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/v1/policies?tenant_id=${tid}`, { headers: authHeaders });
        groupLatency.add(Date.now() - start, { group: 'policies' });
        check(res, { 'policies reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 11. AI Copilot Query ───────────────────────────────────────────────
    group('11_ai_query', function () {
        const start = Date.now();
        const aiHeaders = {
            'Content-Type': 'application/json',
            'Authorization': apiKey ? `Bearer ${apiKey}` : 'Bearer test-key',
            'X-Tenant-Id': tid,
        };
        const res = http.post(`${BASE_URL}/v1/query`, JSON.stringify({
            query: 'show me payout summary for today',
        }), { headers: aiHeaders });
        groupLatency.add(Date.now() - start, { group: 'ai_query' });
        check(res, { 'ai query reachable': (r) => r.status < 500 });
    });

    sleep(0.5);

    // ── 12. AI Chat ────────────────────────────────────────────────────────
    group('12_ai_chat', function () {
        const start = Date.now();
        const chatHeaders = {
            'Content-Type': 'application/json',
            'Authorization': apiKey ? `Bearer ${apiKey}` : 'Bearer test-key',
            'X-Tenant-Id': tid,
        };
        const res = http.post(`${BASE_URL}/v1/chat`, JSON.stringify({
            message: 'what is my failure rate this week?',
        }), { headers: chatHeaders });
        groupLatency.add(Date.now() - start, { group: 'ai_chat' });
        check(res, { 'ai chat reachable': (r) => r.status < 500 });
    });

    sleep(1);
}
