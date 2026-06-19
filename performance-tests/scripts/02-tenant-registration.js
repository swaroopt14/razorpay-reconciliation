/**
 * Test 02: Tenant Registration & Admin Operations
 * 
 * Tests the admin API surface:
 *   - POST /v1/admin/tenantReg  (create tenant)
 *   - GET  /v1/admin/tenants    (list tenants)
 *   - GET  /v1/admin/tenants/:id (get specific tenant)
 * 
 * Auth: X-Zord-ADMIN-KEY header
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const tenantsCreated = new Counter('tenants_created');

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.90'],
        http_req_duration: ['p(95)<2000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'zord123';

const adminHeaders = {
    'Content-Type': 'application/json',
    'X-Zord-ADMIN-KEY': ADMIN_KEY,
};

export default function () {
    let tenantId = null;

    // Step 1: Register a new tenant
    group('register_tenant', function () {
        const payload = JSON.stringify({
            name: `perf-${Date.now()}-${__VU}-${__ITER}`,
        });

        const res = http.post(`${BASE_URL}/v1/admin/tenantReg`, payload, {
            headers: adminHeaders,
        });

        check(res, {
            'tenant created (201) or auth error': (r) => r.status === 201 || r.status === 401 || r.status === 403,
            'not server error': (r) => r.status < 500,
            'response time < 2s': (r) => r.timings.duration < 2000,
        });

        if (res.status === 201) {
            tenantsCreated.add(1);
            try {
                const body = JSON.parse(res.body);
                tenantId = body.TenantId;
            } catch (e) { }
        }
    });

    sleep(1);

    // Step 2: List all tenants
    group('list_tenants', function () {
        const res = http.get(`${BASE_URL}/v1/admin/tenants`, {
            headers: adminHeaders,
        });

        check(res, {
            'list tenants reachable': (r) => r.status < 500,
            'response time < 2s': (r) => r.timings.duration < 2000,
        });
    });

    sleep(1);

    // Step 3: Get specific tenant (if created)
    if (tenantId) {
        group('get_tenant_by_id', function () {
            const res = http.get(`${BASE_URL}/v1/admin/tenants/${tenantId}`, {
                headers: adminHeaders,
            });

            check(res, {
                'get tenant reachable': (r) => r.status < 500,
                'response time < 2s': (r) => r.timings.duration < 2000,
            });
        });
    }

    sleep(1);
}
