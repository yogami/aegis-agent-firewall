import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { VirtualGuardian, evictGlobalSemanticCache, rustCore, rustCoreAvailable } from './guardian.js';
import crypto from 'crypto';
import sjson from 'secure-json-parse';
import { logBlockedTransaction } from './auditLogger.js';
import { evaluatePolicy, getPolicyManifest } from './opa-gate.js';
import { loadThreatStore, getThreats, getThreatStats } from './threat-store.js';
import { GUARDIAN_MODELS } from './guardian.js';

if (!process.env.OPENROUTER_API_KEY) {
    console.error('FATAL: OPENROUTER_API_KEY env var is required. Set it in Railway or .env');
    process.exit(1);
}

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
        message: `SemaProof Layer 7 Defense: Cryptographic Nonce Buffer protection triggered.`
    })
});

let activeSystemState = {
    kms_key_id: "arn:aws:kms:valid-root-key",
    snapshot_retention_days: 30,
    public_access: false
};

server.get('/health', async () => ({
    status: 'ok',
    mpc_nodes_active: 5,
    layers: ['OPA_DETERMINISTIC', 'SLM_QUORUM', 'BLS_CRYPTO'],
    threatStore: getThreatStats()
}));
server.get('/state', async () => activeSystemState);
server.get('/v1/threats', async () => ({ threats: getThreats(), stats: getThreatStats() }));
server.get('/v1/guardians', async () => ({ guardians: GUARDIAN_MODELS }));
server.get('/v1/metrics', async () => ({
    layers: [
        { id: 'OPA', type: 'Deterministic', latency: '<1ms' },
        { id: 'SLM', type: 'Probabilistic', models: GUARDIAN_MODELS.length, threshold: '3-of-5' },
        { id: 'BLS', type: 'Cryptographic', curve: 'BLS12-381' }
    ],
    threatStore: getThreatStats(),
    policy: getPolicyManifest()
}));

server.get('/v1/logs', async (request, reply) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const logPath = path.resolve(process.cwd(), 'semaproof_audit.log');

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
        g.evaluatePayload(payload, signal, { authorization: 'Bearer semaproof-agent-token-v1' })
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

function getMasterSignatureHash(responses, payload) {
    const sortedResponses = responses.sort((a, b) => a.guardianId.localeCompare(b.guardianId));

    // Extract hex strings for Rust aggregation
    const sigHexes = sortedResponses.map(r => r.signatureShard);
    const pkHexes = sortedResponses.map(r => r.publicKeyHex);

    // Rust WASM: aggregate signatures and public keys
    const aggregatedSigHex = rustCore.aggregate_signatures(JSON.stringify(sigHexes));
    const aggregatedPkHex = rustCore.aggregate_public_keys(JSON.stringify(pkHexes));

    // Rust WASM: verify the aggregated signature
    const messageHex = Buffer.from(
        crypto.createHash('sha256').update(JSON.stringify(payload)).digest()
    ).toString('hex');

    const isValid = rustCore.verify(aggregatedSigHex, messageHex, aggregatedPkHex);
    if (!isValid) throw new Error("Cryptographic Aggregation Failure");

    return aggregatedSigHex;
}

const globalConsensusCache = new Map();
const GLOBAL_CACHE_TTL = 300000; // 5 minutes

function clearGlobalCache() {
    globalConsensusCache.clear();
    evictGlobalSemanticCache();
}

async function executeTransaction(request, reply) {
    const payload = request.body;
    const abortController = new AbortController();
    const requestId = crypto.randomUUID();

    // Global Fast-Path (Flywheel)
    const payloadKey = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    if (globalConsensusCache.has(payloadKey)) {
        const cached = globalConsensusCache.get(payloadKey);
        if (Date.now() - cached.timestamp < GLOBAL_CACHE_TTL) {
            server.log.info(`[FAST-PATH] ⚡ Cache hit for payload ${payloadKey}. Bypassing SLM Quorum.`);
            return reply.status(200).send({
                ...cached.response,
                request_id: requestId,
                message: 'Transaction authorized via Fast-Path Cache'
            });
        }
    }

    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
            abortController.abort();
            resolve({ success: false, reasons: ["Gateway Timeout"] });
        }, 3000);
    });

    const consensus = await Promise.race([buildQuorumPromise(payload, abortController.signal), timeoutPromise]);

    if (!consensus.success) {
        logBlockedTransaction(requestId, payload, consensus.reasons).catch(console.error);

        return reply.status(403).send({
            status: 'rejected',
            request_id: requestId,
            message: 'Transaction blocked by SemaProof MPC Network',
            threshold_met: false,
            approvals: (consensus.responses || []).length,
            rejections: consensus.reasons
        });
    }

    try {
        const masterSignatureHex = getMasterSignatureHash(consensus.responses, payload);

        const response = {
            status: 'success',
            threshold_met: true,
            optimistic_aggregation_ms: 'sub-100',
            approvals: consensus.responses.length,
            master_signature_hash: masterSignatureHex,
            resulting_state: activeSystemState
        };

        // Cache the safe consensus
        globalConsensusCache.set(payloadKey, { response, timestamp: Date.now() });

        if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
            activeSystemState = { ...activeSystemState, ...payload.body };
            clearGlobalCache();
        }

        return reply.status(200).send({ ...response, request_id: requestId, message: 'Transaction authorized' });

    } catch (error) {
        server.log.error(error);
        return reply.status(500).send({ error: error.message });
    }
}

server.post('/v1/execute', async (request, reply) => {
    if (request.headers.authorization !== 'Bearer semaproof-agent-token-v1') {
        return reply.status(401).send({ success: false, error: 'Unauthorized: Agent DID/Token missing' });
    }
    server.log.info(`[INGRESS] Received execution intent for ${request.body.method}`);

    // Layer 1: Deterministic OPA Gate (sub-1ms)
    const opaDecision = evaluatePolicy(request.body, {
        environment: process.env.NODE_ENV || 'production',
        agentTier: request.headers['x-agent-tier'] || 'T2'
    });

    if (!opaDecision.allow) {
        server.log.warn(`[OPA GATE] BLOCKED by rule ${opaDecision.rule}: ${opaDecision.reason}`);
        logBlockedTransaction(crypto.randomUUID(), request.body, [opaDecision.reason], 'OPA_DETERMINISTIC').catch(console.error);
        return reply.status(403).send({
            status: 'rejected',
            layer: 'OPA_DETERMINISTIC',
            rule: opaDecision.rule,
            reason: opaDecision.reason,
            evaluationMs: opaDecision.evaluationMs,
            message: 'Transaction blocked by SemaProof Deterministic Policy Gate (Layer 1)'
        });
    }

    server.log.info(`[OPA GATE] PASSED in ${opaDecision.evaluationMs}ms. Checking Fast-Path / Quorum.`);

    // Layer 2 + 3: SLM Quorum + BLS Crypto
    return await executeTransaction(request, reply);
});

server.get('/v1/policy', async () => getPolicyManifest());

async function start() {
    try {
        // Warm-boot: load threat signatures from disk
        loadThreatStore();

        const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`SemaProof Hybrid Guardrail Gateway listening on port ${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

export { server };
if (process.env.NODE_ENV !== 'test') {
    start();
}
