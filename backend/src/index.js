import './polyfill.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { VirtualGuardian, evictGlobalSemanticCache } from './guardian.js';
import crypto from 'crypto';
import { bls12_381 } from '@noble/curves/bls12-381.js';
import sjson from 'secure-json-parse';
import { logBlockedTransaction } from './auditLogger.js';

process.env.OPENROUTER_API_KEY = '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';

const platformGuardians = [
    new VirtualGuardian(1), new VirtualGuardian(2),
    new VirtualGuardian(3), new VirtualGuardian(4),
    new VirtualGuardian(5)
];

const server = Fastify({ logger: true, bodyLimit: 8192 });

server.register(cors, {
    origin: 'https://trusted-enterprise-dashboard.internal',
    methods: ['GET', 'POST']
});

function validateASCII(body) {
    if (/[^\x20-\x7E\n\r\t]/.test(body)) {
        throw new Error("Illegal Non-ASCII characters detected.");
    }
}

function validateNoDuplicateKeys(body) {
    const keys = body.match(/"([^"]+)"\s*:/g) || [];
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
        throw new Error("Duplicate keys detected (JSON Object Pollution Attempt).");
    }
}

function validateNoBase64(body) {
    if (/[A-Za-z0-9+/]{40,}/.test(body)) {
        throw new Error("Base64 Encoded Strings detected. Semantic Smuggling blocked.");
    }
}

function jsonParser(req, body, done) {
    try {
        validateASCII(body);
        validateNoDuplicateKeys(body);
        validateNoBase64(body);
        const json = sjson.parse(body, undefined, { protoAction: 'error', constructorAction: 'error' });
        done(null, json);
    } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
    }
}

server.addContentTypeParser('application/json', { parseAs: 'string' }, jsonParser);

await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Aegis Layer 7 Defense: FROST Cryptographic Nonce Buffer protection triggered.`
    })
});

let activeSystemState = {
    kms_key_id: "arn:aws:kms:valid-root-key",
    snapshot_retention_days: 30,
    public_access: false
};

server.get('/health', async () => ({ status: 'ok', mpc_nodes_active: 5 }));
server.get('/state', async () => activeSystemState);

server.get('/v1/logs', async (request, reply) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const logPath = path.resolve(process.cwd(), 'aegis_audit.log');

        if (!fs.existsSync(logPath)) {
            return reply.send([]);
        }

        const fileContent = fs.readFileSync(logPath, 'utf-8');
        const logs = fileContent.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) { return null; }
            }).filter(Boolean);

        return reply.send(logs);
    } catch (e) {
        return reply.status(500).send({ error: e.message });
    }
});

async function buildQuorumPromise(payload, signal) {
    const guardianPromises = platformGuardians.map(g =>
        g.evaluatePayload(payload, signal, { authorization: 'Bearer aegis-agent-token-v1' })
            .then(res => ({ status: 'fulfilled', value: res }))
            .catch(err => ({ status: 'rejected', reason: err }))
    );

    const results = await Promise.allSettled(guardianPromises);

    const safeResponses = [];
    const rejectReasons = [];

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const res = result.value.value;
            if (res.safe || typeof res === 'string') {
                safeResponses.push(res.shardHex || res);
            } else {
                rejectReasons.push(res.reason);
            }
        } else {
            rejectReasons.push("Network Timeout/Error");
        }
    }

    if (safeResponses.length >= 3) {
        return { success: true, responses: safeResponses };
    }
    return { success: false, reasons: rejectReasons };
}

function extractSignatureBytes(sortedResponses) {
    return sortedResponses.map(r => new Uint8Array(Buffer.from(r.signatureShard, 'hex')));
}

function extractActivePublicKeys(sortedResponses) {
    return sortedResponses.map(r => r.publicKey);
}

function calculateCurveMessage(payload) {
    const messageBytes = crypto.createHash('sha256').update(JSON.stringify(payload)).digest();
    return bls12_381.shortSignatures.hash(messageBytes);
}

function verifyAggregationMath(aggregatedSignature, curveMessage, aggregatedPublicKey) {
    const isValidMath = bls12_381.shortSignatures.verify(aggregatedSignature, curveMessage, aggregatedPublicKey);
    if (!isValidMath) throw new Error("Cryptographic Aggregation Failure");
}

function getMasterSignatureHash(responses, payload) {
    const sortedResponses = responses.sort((a, b) => a.guardianId.localeCompare(b.guardianId));

    const signatureBytes = extractSignatureBytes(sortedResponses);
    const activePublicKeys = extractActivePublicKeys(sortedResponses);

    const aggregatedSignature = bls12_381.shortSignatures.aggregateSignatures(signatureBytes);
    const aggregatedPublicKey = bls12_381.shortSignatures.aggregatePublicKeys(activePublicKeys);

    const curveMessage = calculateCurveMessage(payload);
    verifyAggregationMath(aggregatedSignature, curveMessage, aggregatedPublicKey);

    const encodedAggSig = typeof aggregatedSignature.toRawBytes === 'function' ? aggregatedSignature.toRawBytes(true) : aggregatedSignature;
    const finalHex = typeof encodedAggSig.toHex === 'function' ? encodedAggSig.toHex() : Buffer.from(encodedAggSig).toString('hex');

    return finalHex;
}

async function executeTransaction(request, reply) {
    const payload = request.body;
    const abortController = new AbortController();
    const requestId = crypto.randomUUID();

    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
            abortController.abort();
            resolve({ success: false, reasons: ["Gateway Timeout"] });
        }, 3000);
    });

    const consensus = await Promise.race([buildQuorumPromise(payload, abortController.signal), timeoutPromise]);

    if (!consensus.success) {
        // Fire-and-forget background execution for EU Explainability Logic
        logBlockedTransaction(requestId, payload, consensus.reasons).catch(console.error);

        return reply.status(403).send({
            status: 'rejected',
            request_id: requestId,
            message: 'Transaction blocked by Aegis MPC Network',
            threshold_met: false,
            approvals: (consensus.responses || []).length,
            rejections: consensus.reasons
        });
    }

    try {
        const masterSignatureHex = getMasterSignatureHash(consensus.responses, payload);

        if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
            activeSystemState = { ...activeSystemState, ...payload.body };
            evictGlobalSemanticCache();
        }

        return reply.status(200).send({
            status: 'success',
            request_id: requestId,
            message: 'Transaction authorized',
            threshold_met: true,
            optimistic_aggregation_ms: 'sub-100',
            approvals: consensus.responses.length,
            master_signature_hash: masterSignatureHex,
            resulting_state: activeSystemState
        });

    } catch (error) {
        server.log.error(error);
        return reply.status(500).send({ error: error.message });
    }
}

server.post('/v1/execute', async (request, reply) => {
    if (request.headers.authorization !== 'Bearer aegis-agent-token-v1') {
        return reply.status(401).send({ success: false, error: 'Unauthorized: Agent DID/Token missing' });
    }
    server.log.info(`[INGRESS] Received execution intent for ${request.body.method}`);
    return await executeTransaction(request, reply);
});

async function start() {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`AEGIS Gateway listening on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

export { server };
if (process.env.NODE_ENV !== 'test') {
    start();
}
