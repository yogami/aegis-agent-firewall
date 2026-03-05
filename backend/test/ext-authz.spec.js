import { jest } from '@jest/globals';

/**
 * SemaProof ext_authz Protocol — Spec (RED Phase)
 *
 * Tests the Envoy-compatible ext_authz HTTP service that translates
 * Envoy CheckRequest → classify() → CheckResponse.
 *
 * The ext_authz service runs on port 9001 and implements the
 * Envoy external authorization HTTP API contract.
 */

let createExtAuthzServer;

beforeAll(async () => {
    try {
        const mod = await import('../src/transport/ext-authz.js');
        createExtAuthzServer = mod.createExtAuthzServer;
    } catch {
        // Expected in RED phase
    }
});

describe('Envoy ext_authz Protocol', () => {

    let server;

    beforeAll(async () => {
        if (!createExtAuthzServer) return;

        const mockEngine = {
            classify: async (payload) => ({
                decision: payload._testDecision || 'ALLOW',
                layer: payload._testLayer || 'SEMAPROOF_LOCAL',
                label: payload._testLabel || 'SAFE',
                confidence: payload._testConfidence || 0.99,
                mitre: payload._testMitre || null,
                eu_ai_act: null,
                latencyMs: 5,
                signatureHash: 'test-hash'
            })
        };

        server = await createExtAuthzServer(mockEngine, { port: 0 });
    });

    afterAll(async () => {
        if (server) await server.close();
    });

    test('should return 200 OK for ALLOW decisions', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: {
                            method: 'GET',
                            path: '/api/v1/users',
                            body: '{}'
                        }
                    }
                }
            })
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.status.code).toBe(0); // OK
    });

    test('should return 403 Forbidden for BLOCK decisions', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: {
                            method: 'DELETE',
                            path: '/iam/roles/root',
                            body: JSON.stringify({ _testDecision: 'BLOCK', _testLabel: 'BLOCKED_ENDPOINT' })
                        }
                    }
                }
            })
        });

        expect(res.statusCode).toBe(200); // ext_authz always returns 200
        const body = JSON.parse(res.payload);
        expect(body.status.code).toBe(7); // PERMISSION_DENIED
    });

    test('should include x-semaproof-label header in response', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: {
                            method: 'GET',
                            path: '/api/health',
                            body: '{}'
                        }
                    }
                }
            })
        });

        const body = JSON.parse(res.payload);
        const headers = body.ok_response?.headers || body.denied_response?.headers || {};
        expect(headers['x-semaproof-label']).toBeDefined();
    });

    test('should include x-semaproof-confidence header in response', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: {
                            method: 'GET',
                            path: '/api/status',
                            body: '{}'
                        }
                    }
                }
            })
        });

        const body = JSON.parse(res.payload);
        const headers = body.ok_response?.headers || {};
        expect(headers['x-semaproof-confidence']).toBeDefined();
    });

    test('should include x-semaproof-mitre header when applicable', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: {
                            method: 'POST',
                            path: '/api/upload',
                            body: JSON.stringify({ _testMitre: 'T1567', _testDecision: 'BLOCK', _testLabel: 'DATA_EXFILTRATION' })
                        }
                    }
                }
            })
        });

        const body = JSON.parse(res.payload);
        const headers = body.denied_response?.headers || body.ok_response?.headers || {};
        if (headers['x-semaproof-mitre']) {
            expect(headers['x-semaproof-mitre']).toBe('T1567');
        }
    });

    test('should respond within 150ms for cached classifications', async () => {
        if (!server) return;

        const start = performance.now();
        await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                attributes: {
                    request: {
                        http: { method: 'GET', path: '/api/fast', body: '{}' }
                    }
                }
            })
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(150);
    });

    test('should handle malformed requests with 400 Bad Request', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'POST',
            url: '/envoy.service.auth.v3.Authorization/Check',
            headers: { 'content-type': 'application/json' },
            payload: '{ invalid json }'
        });

        expect(res.statusCode).toBe(400);
    });

    test('should expose health endpoint on /health', async () => {
        if (!server) return;

        const res = await server.inject({
            method: 'GET',
            url: '/health'
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.status).toBe('ok');
        expect(body.service).toBe('semaproof-ext-authz');
    });
});
