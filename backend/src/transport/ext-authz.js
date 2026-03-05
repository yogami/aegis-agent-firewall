/**
 * SemaProof ext_authz Transport — Envoy External Authorization HTTP Service
 *
 * Translates Envoy CheckRequest → classify() → CheckResponse.
 * Runs as a sidecar on port 9001 (configurable via ENV).
 *
 * Implements the Envoy ext_authz v3 HTTP API contract:
 *   - POST /envoy.service.auth.v3.Authorization/Check
 *   - GET /health
 *
 * @module transport/ext-authz
 */

import Fastify from 'fastify';

/**
 * Create an ext_authz Fastify server backed by a classification engine.
 *
 * @param {Object} engine - { classify(payload) → ClassificationResult }
 * @param {Object} options - { port?: number }
 * @returns {Promise<FastifyInstance>}
 */
export async function createExtAuthzServer(engine, options = {}) {
    const server = Fastify({ logger: false });

    server.get('/health', async () => ({
        status: 'ok',
        service: 'semaproof-ext-authz',
        timestamp: new Date().toISOString()
    }));

    server.post('/envoy.service.auth.v3.Authorization/Check', async (request, reply) => {
        const checkRequest = parseCheckRequest(request.body);
        if (!checkRequest) {
            return reply.code(400).send({ error: 'Malformed CheckRequest' });
        }

        const result = await engine.classify(checkRequest.payload);
        return formatCheckResponse(result);
    });

    if (options.port !== 0) {
        await server.listen({ port: options.port || 9001, host: '0.0.0.0' });
    } else {
        await server.ready();
    }

    return server;
}

/**
 * Parse an Envoy CheckRequest into a SemaProof payload.
 * @private
 */
function parseCheckRequest(body) {
    if (!body?.attributes?.request?.http) return null;

    const http = body.attributes.request.http;
    let parsedBody = {};

    try {
        parsedBody = http.body ? JSON.parse(http.body) : {};
    } catch {
        parsedBody = {};
    }

    return {
        payload: {
            method: http.method || 'GET',
            endpoint: http.path || '/',
            body: parsedBody,
            ...parsedBody
        }
    };
}

/**
 * Format a ClassificationResult into an Envoy CheckResponse.
 * @private
 */
function formatCheckResponse(result) {
    const headers = {
        'x-semaproof-label': result.label || 'UNKNOWN',
        'x-semaproof-layer': result.layer || 'UNKNOWN',
        'x-semaproof-confidence': String(result.confidence ?? 'N/A'),
        'x-semaproof-latency-ms': String(result.latencyMs ?? 0)
    };

    if (result.mitre) {
        headers['x-semaproof-mitre'] = result.mitre;
    }

    if (result.decision === 'ALLOW') {
        return {
            status: { code: 0 },
            ok_response: { headers }
        };
    }

    return {
        status: { code: 7 },
        denied_response: {
            status: { code: 403 },
            headers,
            body: JSON.stringify({
                decision: 'BLOCK',
                label: result.label,
                layer: result.layer,
                mitre: result.mitre
            })
        }
    };
}
