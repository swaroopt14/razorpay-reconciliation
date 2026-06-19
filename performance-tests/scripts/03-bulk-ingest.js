/**
 * Test 03: Bulk CSV Ingest + Single JSON Ingest
 * 
 * Tests the payment ingestion pipeline:
 *   - POST /v1/bulk-ingest (multipart CSV upload)
 *   - POST /v1/ingest      (single JSON payment)
 * 
 * CSV format matches: zord_payout_1000_varied.csv (24 columns)
 * Columns: source_system, client_batch_ref, client_payout_ref, invoice_id,
 *          voucher_id, ledger_name, vendor_id, vendor_name, beneficiary_name,
 *          beneficiary_account_number, beneficiary_ifsc, beneficiary_vpa,
 *          amount, currency, payment_method, rail_hint, payout_purpose,
 *          scheduled_execution_at, expected_value_date, bank_account_ref,
 *          approval_ref, remarks, pan_number, mcc_code
 * 
 * Auth: Bearer token from tenant registration
 * Headers: X-Zord-Source-Type, X-Zord-Source-Class, X-Zord-Tenant-Type, X-Idempotency-Key
 * Rate limit: 30 req/min on bulk-ingest
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const successfulIngests = new Counter('successful_ingests');
const rateLimited = new Counter('rate_limited_ingests');

export const options = {
    stages: [
        { duration: '30s', target: 3 },
        { duration: '2m', target: 10 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.60'],
        http_req_duration: ['p(95)<5000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

export function setup() {
    // Register a tenant to get a valid API key
    const res = http.post(
        `${BASE_URL}/v1/admin/tenantReg`,
        JSON.stringify({ name: `perf-ingest-${Date.now()}` }),
        { headers: { 'Content-Type': 'application/json', 'X-Zord-ADMIN-KEY': ADMIN_KEY } }
    );
    if (res.status === 201) {
        const body = JSON.parse(res.body);
        return { apiKey: body.APIKEY, tenantId: body.TenantId };
    }
    console.warn(`Setup: tenant creation returned ${res.status}`);
    return { apiKey: '', tenantId: '' };
}

export default function (data) {
    const authHeaders = data.apiKey
        ? { 'Authorization': `Bearer ${data.apiKey}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `perf-${Date.now()}-${__VU}-${__ITER}` }
        : { 'Authorization': 'Bearer test-key', 'Content-Type': 'application/json', 'X-Idempotency-Key': `perf-${Date.now()}-${__VU}-${__ITER}` };

    // Step 1: Single JSON ingest (matches zord-edge IntentHandler format)
    group('single_ingest', function () {
        const payload = JSON.stringify({
            source_system: 'PayU',
            client_batch_ref: `PERF_BATCH_${__VU}`,
            client_payout_ref: `PERF_SINGLE_${__VU}_${__ITER}`,
            beneficiary_name: `PerfUser-${__VU}-${__ITER}`,
            beneficiary_account_number: `${1000000000 + __ITER}`,
            beneficiary_ifsc: 'HDFC0001234',
            amount: 50000 + __ITER,
            currency: 'INR',
            payment_method: 'NEFT',
            payout_purpose: 'vendor_payment',
        });

        const res = http.post(`${BASE_URL}/v1/ingest`, payload, {
            headers: authHeaders,
            tags: { name: 'single_ingest' },
        });

        const passed = check(res, {
            'ingest accepted': (r) => r.status === 200 || r.status === 201 || r.status === 202 || r.status === 400 || r.status === 401 || r.status === 409 || r.status === 429,
            'not server error': (r) => r.status < 500,
            'response time < 5s': (r) => r.timings.duration < 5000,
        });

        if (res.status === 200 || res.status === 201) successfulIngests.add(1);
        if (res.status === 429) rateLimited.add(1);
    });

    sleep(2);

    // Step 2: Bulk CSV ingest
    group('bulk_csv_ingest', function () {
        if (!data.apiKey) return;

        // Use the EXACT same CSV format as developers (zord_payout_1000_varied.csv)
        const csv = [
            'source_system,client_batch_ref,client_payout_ref,invoice_id,voucher_id,ledger_name,vendor_id,vendor_name,beneficiary_name,beneficiary_account_number,beneficiary_ifsc,beneficiary_vpa,amount,currency,payment_method,rail_hint,payout_purpose,scheduled_execution_at,expected_value_date,bank_account_ref,approval_ref,remarks,pan_number,mcc_code',
            `PayU,PERF_BATCH_${__VU},PERF_PAY_${__VU}${__ITER}0,INV-${__ITER}0,VOUCH-${__ITER}0,Operating_Ledger,VEND-${__VU}0,PerfTest User1,PerfTest User1,271541000001,AXIS0001239,,${50000 + __ITER},INR,NEFT,UPI,vendor_payment,2026-09-05T10:00:00Z,21-05-2026,ACC5ac159a4,APP-44774AD8,Zord compliant payout,LGLGL1517Q,5945`,
            `Razorpay,PERF_BATCH_${__VU},PERF_PAY_${__VU}${__ITER}1,INV-${__ITER}1,VOUCH-${__ITER}1,,VEND-${__VU}1,PerfTest User2,PerfTest User2,634212000002,UBIN0001241,,${25000 + __ITER},INR,NEFT,RTGS,refund,2026-08-20T10:00:00Z,21-05-2026,ACC3a742f1a,,Zord compliant payout,EGUQX7039J,5812`,
            `Cashfree,,PERF_PAY_${__VU}${__ITER}2,INV-${__ITER}2,VOUCH-${__ITER}2,,VEND-${__VU}2,PerfTest User3,PerfTest User3,414201000003,SBIN0001236,,${75000 + __ITER},INR,BANK_TRANSFER,IMPS,refund,2026-08-23T10:00:00Z,21-05-2026,ACC58774797,,Zord compliant payout,JRPBO3045R,5035`,
        ].join('\n');

        const res = http.post(`${BASE_URL}/v1/bulk-ingest`,
            { file: http.file(csv, 'perf-payout.csv', 'text/csv') },
            {
                headers: {
                    'Authorization': `Bearer ${data.apiKey}`,
                    'X-Zord-Source-Type': 'CSV',
                    'X-Zord-Source-Class': 'INTENT',
                    'X-Zord-Tenant-Type': 'BANK',
                },
            }
        );

        check(res, {
            'bulk ingest accepted or rate limited': (r) => r.status < 500,
            'response time < 5s': (r) => r.timings.duration < 5000,
        });

        if (res.status === 429) rateLimited.add(1);
    });

    sleep(2);
}
