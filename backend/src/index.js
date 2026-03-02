import Fastify from 'fastify';
import cors from '@fastify/cors';
import { VirtualGuardian } from './guardian.js';
import crypto from 'crypto';

const server = Fastify({
    logger: true,
    bodyLimit: 8192 // Strict 8KB Limit to prevent Semantic Smuggling / Context Exhaustion
});

server.register(cors, {
    origin: '*',
});

let mockCloudConfig = {
    kms_key_id: "arn:aws:kms:valid-root-key",
    snapshot_retention_days: 30,
    public_access: false
};

server.get('/health', async (request, reply) => {
    return { status: 'ok', mpc_nodes_active: 5 };
});

server.get('/state', async (request, reply) => {
    return mockCloudConfig;
});

server.post('/v1/execute', async (request, reply) => {
    const payload = request.body;

    server.log.info(`[INGRESS] Received execution intent for ${payload.method} ${payload.endpoint}`);

    const guardians = [
        new VirtualGuardian(1),
        new VirtualGuardian(2),
        new VirtualGuardian(3),
        new VirtualGuardian(4),
        new VirtualGuardian(5)
    ];

    server.log.info(`[INGRESS] Broadcasting payload to 5 Guardian Nodes for SLM evaluation...`);
    const evaluations = await Promise.all(guardians.map(g => g.evaluatePayload(payload)));

    const safeResponses = evaluations.filter(e => e.safe);
    const maliciousResponses = evaluations.filter(e => !e.safe);

    server.log.info(`[CONSENSUS] Received ${safeResponses.length}/5 SAFE responses.`);

    if (safeResponses.length >= 3) {
        server.log.info(`[CONSENSUS] Threshold met (3/5). Aggregating cryptographic shards...`);

        const combinedShards = safeResponses.map(r => r.signatureShard).join('');
        const masterSignature = crypto.createHash('sha256').update(combinedShards).digest('hex');

        if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
            mockCloudConfig = { ...mockCloudConfig, ...payload.body };
        }

        return reply.status(200).send({
            status: 'success',
            message: 'Transaction authorized by Aegis MPC Network',
            threshold_met: true,
            approvals: safeResponses.length,
            master_signature_hash: masterSignature,
            resulting_state: mockCloudConfig
        });
    } else {
        server.log.error(`[CONSENSUS] Threshold FAILED. ${maliciousResponses.length} Guardians flagged payload as Malicious.`);
        return reply.status(403).send({
            status: 'rejected',
            message: 'Transaction blocked by Aegis MPC Network: Semantic evaluation detected malicious intent.',
            threshold_met: false,
            approvals: safeResponses.length,
            rejections: maliciousResponses.map(r => r.reason)
        });
    }
});

// Post-Audit Hardening: Asynchronous Gateway for CI/CD and HFT Pipelines
server.post('/v1/execute-async', async (request, reply) => {
    const payload = request.body;

    // Detect esoteric encoding attempts (Base64/Hex Semantic Smuggling)
    const rawBodyString = JSON.stringify(payload);
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (Object.values(payload.body || {}).some(val => typeof val === 'string' && (base64Regex.test(val) || /^[0-9a-fA-F]+$/.test(val)))) {
        server.log.warn(`[INGRESS] Dropped malicious esoteric encoding attempt before SLM execution.`);
        return reply.status(400).send({ error: 'Payload contains illegal obfuscated strings (Base64/Hex).' });
    }

    const transactionId = crypto.randomUUID();
    server.log.info(`[INGRESS-ASYNC] Transaction ${transactionId} Accepted. Processing MPC out-of-band.`);

    // 1. Instantly return 202 Accepted to the calling client (0ms latency for CI/CD)
    reply.status(202).send({
        status: 'processing',
        transaction_id: transactionId,
        message: 'Payload queued for Threshold Signature validation.'
    });

    // 2. Process the heavy SLM MPC Consensus in the background
    setImmediate(async () => {
        try {
            const guardians = [
                new VirtualGuardian(1), new VirtualGuardian(2), new VirtualGuardian(3),
                new VirtualGuardian(4), new VirtualGuardian(5)
            ];

            const evaluations = await Promise.all(guardians.map(g => g.evaluatePayload(payload)));
            const safeResponses = evaluations.filter(e => e.safe);

            if (safeResponses.length >= 3) {
                server.log.info(`[WORKER-${transactionId}] Consensus met. Firing Webhook to destination...`);
                // Simulate firing webhook to the actual cloud API
                if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
                    mockCloudConfig = { ...mockCloudConfig, ...payload.body };
                }
            } else {
                server.log.warn(`[WORKER-${transactionId}] Consensus FAILED. Webhook aborted.`);
            }
        } catch (e) {
            server.log.error(`[WORKER-${transactionId}] Critical Failure: ${e.message}`);
        }
    });

    // Fastify requires returning the initial reply for async functions
    return;
});

const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`AEGIS Gateway listening on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
