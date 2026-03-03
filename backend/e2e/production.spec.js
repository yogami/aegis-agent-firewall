// @ts-check
import { test, expect } from '@playwright/test';

const AUTH = 'Bearer semaproof-agent-token-v1';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Authorization': AUTH };

test.describe('SemaProof Hybrid Guardrail — Production E2E', () => {

    test.describe('Health & Infrastructure', () => {
        test('GET /health returns 3 active layers', async ({ request }) => {
            const res = await request.get('/health');
            expect(res.ok()).toBe(true);
            const body = await res.json();
            expect(body.status).toBe('ok');
            expect(body.mpc_nodes_active).toBe(5);
            expect(body.layers).toEqual(['OPA_DETERMINISTIC', 'SLM_QUORUM', 'BLS_CRYPTO']);
        });

        test('GET /v1/policy returns 7 deterministic rules', async ({ request }) => {
            const res = await request.get('/v1/policy');
            const body = await res.json();
            expect(body.version).toBe('1.0.0');
            expect(body.rules).toHaveLength(7);
        });

        test('GET /v1/guardians returns 5 heterogeneous models', async ({ request }) => {
            const res = await request.get('/v1/guardians');
            const body = await res.json();
            expect(body.guardians).toHaveLength(5);
            const providers = body.guardians.map(g => g.provider);
            expect(providers).toContain('Alibaba');
            expect(providers).toContain('Microsoft');
            expect(providers).toContain('Google');
            expect(providers).toContain('Meta');
        });

        test('GET /v1/metrics returns full system overview', async ({ request }) => {
            const res = await request.get('/v1/metrics');
            const body = await res.json();
            expect(body.layers).toHaveLength(3);
            expect(body.policy).toBeDefined();
            expect(body.threatStore).toBeDefined();
        });
    });

    test.describe('Layer 1: OPA Deterministic Gate', () => {
        test('blocks requests to sovereign blocklisted endpoints (403)', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: JSON_HEADERS,
                data: { method: 'GET', endpoint: '/iam/roles/root', body: {} }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.layer).toBe('OPA_DETERMINISTIC');
            expect(body.rule).toBe('BLOCKED_ENDPOINT');
        });

        test('blocks DELETE on production (DESTRUCTIVE_METHOD)', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: JSON_HEADERS,
                data: { method: 'DELETE', endpoint: '/api/records', body: {} }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.rule).toBe('DESTRUCTIVE_METHOD');
            expect(body.evaluationMs).toBeLessThan(5);
        });

        test('blocks KMS+Snapshot ransomware combo', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: JSON_HEADERS,
                data: {
                    method: 'PUT', endpoint: '/config',
                    body: { kms_action: 'rotate_to_new_key', snapshot_retention_days: 0 }
                }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.rule).toBe('RANSOMWARE_SIGNATURE');
        });

        test('blocks data residency violations (cn-north-1)', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: JSON_HEADERS,
                data: { method: 'GET', endpoint: '/s3/cn-north-1/bucket-data', body: {} }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.rule).toBe('DATA_RESIDENCY');
        });

        test('rejects unauthorized requests (401)', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: { 'Content-Type': 'application/json' },
                data: { method: 'GET', endpoint: '/api/safe', body: {} }
            });
            expect(res.status()).toBe(401);
        });
    });

    test.describe('Layer 2+3: SLM Quorum + BLS Signing (Full Pipeline)', () => {
        test('safe GET request passes all 3 layers and returns BLS signature', async ({ request }) => {
            const res = await request.post('/v1/execute', {
                headers: JSON_HEADERS,
                data: { method: 'GET', endpoint: '/api/v1/users', body: {} }
            });
            expect(res.ok()).toBe(true);
            const body = await res.json();
            expect(body.status).toBe('success');
            expect(body.threshold_met).toBe(true);
            expect(body.approvals).toBeGreaterThanOrEqual(3);
            expect(body.master_signature_hash).toBeDefined();
            expect(body.master_signature_hash.length).toBeGreaterThan(20);
        });
    });

    test.describe('Threat Store & Audit Trail', () => {
        test('GET /v1/threats returns threat data after blocks', async ({ request }) => {
            const res = await request.get('/v1/threats');
            expect(res.ok()).toBe(true);
            const body = await res.json();
            expect(body.stats).toBeDefined();
            expect(body.stats.totalSignatures).toBeGreaterThanOrEqual(0);
        });

        test('GET /v1/logs returns audit log entries', async ({ request }) => {
            const res = await request.get('/v1/logs');
            expect(res.ok()).toBe(true);
        });
    });
});
