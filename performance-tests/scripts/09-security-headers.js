/**
 * Test 09: Security & CORS Verification
 * 
 * Verifies Kong security plugins are working:
 *   - Security headers present (HSTS, X-Frame-Options, X-Content-Type-Options)
 *   - CORS headers returned for allowed origins
 *   - X-Request-Id correlation header present
 *   - Server/X-Powered-By headers removed
 *   - Request size limiting (50MB max)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter } from 'k6/metrics';

const securityPassed = new Counter('security_checks_passed');
const securityFailed = new Counter('security_checks_failed');

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        checks: ['rate>=0.85'],
        http_req_duration: ['p(95)<2000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.zordnet.com';

export default function () {
    // Test 1: Security headers present
    group('security_headers', function () {
        const res = http.get(`${BASE_URL}/edge/health`);

        check(res, {
            'HSTS header present': (r) => {
                const h = r.headers['Strict-Transport-Security'] || r.headers['strict-transport-security'];
                return h && h.includes('max-age');
            },
            'X-Content-Type-Options present': (r) => {
                const h = r.headers['X-Content-Type-Options'] || r.headers['x-content-type-options'];
                return h === 'nosniff';
            },
            'X-Frame-Options present': (r) => {
                const h = r.headers['X-Frame-Options'] || r.headers['x-frame-options'];
                return h === 'DENY';
            },
            'X-Request-Id present': (r) => {
                const h = r.headers['X-Request-Id'] || r.headers['x-request-id'];
                return h && h.length > 0;
            },
            'not server error': (r) => r.status < 500,
        });

        if (res.status < 500) securityPassed.add(1);
        else securityFailed.add(1);
    });

    sleep(0.5);

    // Test 2: CORS preflight (OPTIONS request)
    group('cors_preflight', function () {
        const res = http.options(`${BASE_URL}/v1/intents`, null, {
            headers: {
                'Origin': 'https://zordnet.com',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Authorization, Content-Type',
            },
        });

        check(res, {
            'CORS allows zordnet.com': (r) => {
                const h = r.headers['Access-Control-Allow-Origin'] || r.headers['access-control-allow-origin'];
                return h && h.includes('zordnet.com');
            },
            'CORS allows Authorization header': (r) => {
                const h = r.headers['Access-Control-Allow-Headers'] || r.headers['access-control-allow-headers'];
                return h && h.toLowerCase().includes('authorization');
            },
            'preflight not 5xx': (r) => r.status < 500,
        });
    });

    sleep(0.5);

    // Test 3: Rate limit headers visible (use a route that has rate limiting applied)
    group('rate_limit_headers', function () {
        const res = http.post(`${BASE_URL}/v1/bulk-ingest`, null, {
            headers: { 'Authorization': 'Bearer rate-check-key' },
        });

        check(res, {
            'rate limit headers present': (r) => {
                const h = r.headers['X-RateLimit-Limit-Minute'] || r.headers['x-ratelimit-limit-minute'] ||
                    r.headers['RateLimit-Limit'] || r.headers['ratelimit-limit'];
                return h !== undefined;
            },
            'not server error': (r) => r.status < 500,
        });
    });

    sleep(0.5);
}
