import { jest } from '@jest/globals';
import { server } from '../src/index.js';

describe('Aegis API Gateway (index.js)', () => {
    afterAll(async () => {
        await server.close();
    });

    test('should return 401 Unauthorized if Agent DID/Token is missing', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            payload: { method: 'GET', endpoint: '/data' }
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toContain('Unauthorized');
    });

    test('should block payloads containing Non-ASCII control character smuggling (CVE defense)', async () => {
        const payload = '{"method": "POST", "body": "Exploit' + String.fromCharCode(0) + 'Attempt"}';
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: payload
        });
        expect(response.statusCode).toBe(400);
    });

    test('should reject JSON Object Pollution (Duplicate Keys)', async () => {
        const payload = '{"method": "GET", "method": "POST", "endpoint": "/data"}';
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: payload
        });
        expect(response.statusCode).toBe(400);
    });

    test('should immediately reject payloads with dense Base64 arrays (Semantic Smuggling)', async () => {
        const payload = JSON.stringify({
            method: 'POST',
            endpoint: '/data',
            body: {
                smuggled_intent: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            }
        });

        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: payload
        });

        expect(response.statusCode).toBe(400);
    });

    test('should execute full consensus payload perfectly', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "SAFE" } }] })
            })
        );
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify({ method: 'GET', endpoint: '/data' })
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).status).toBe('success');
    });

    test('should update state configuration when PUT config executes', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "SAFE" } }] })
            })
        );
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify({ method: 'PUT', endpoint: '/config', body: { public_access: true } })
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).resulting_state.public_access).toBe(true);
    });

    test('should reject transactions blocked by MPC consensus', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "MALICIOUS" } }] })
            })
        );
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify({ method: 'DELETE', endpoint: '/production/db' })
        });
        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.payload).status).toBe('rejected');
    });

    test('should handle network timeouts across MPC quorum gracefully', async () => {
        global.fetch = jest.fn(() =>
            new Promise(resolve => setTimeout(resolve, 3100))
        );
        const response = await server.inject({
            method: 'POST',
            url: '/v1/execute',
            headers: {
                'Authorization': 'Bearer aegis-agent-token-v1',
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify({ method: 'GET', endpoint: '/timeout' })
        });
        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.payload).rejections).toContain('Gateway Timeout');
    });

    test('should fetch active system state properly', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/state'
        });
        expect(response.statusCode).toBe(200);
    });

    test('health endpoint should return OK', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).status).toBe('ok');
    });
});
