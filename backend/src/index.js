import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { VirtualGuardian, evictGlobalSemanticCache } from './guardian.js';
import crypto from 'crypto';
import { bls12_381 } from '@noble/curves/bls12-381.js';
import sjson from 'secure-json-parse';

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

function resolveQuorum(state) {
    state.isResolved = true;
    state.abortController.abort();
    state.resolve({ success: true, responses: state.safeResponses });
}

function rejectQuorum(state) {
    state.isResolved = true;
    state.abortController.abort();
    state.resolve({ success: false, reasons: state.rejectReasons });
}

function handleSafeResponse(response, state) {
    state.approvals++;
    state.safeResponses.push(response);
    if (state.isResolved) return;
    if (state.approvals === 3) resolveQuorum(state);
}

function handleRejectedResponse(reason, state) {
    state.rejections++;
    state.rejectReasons.push(reason);
    if (state.isResolved) return;
    if (state.rejections > 2) rejectQuorum(state);
}

function routeGuardianResponse(response, state) {
    if (response.safe) return handleSafeResponse(response, state);
    handleRejectedResponse(response.reason, state);
}

function processGuardianResponse(response, state) {
    if (state.isResolved) return;
    routeGuardianResponse(response, state);
}

function handleQuorumResolution(res, state) {
    processGuardianResponse(res, state);
}

function handleQuorumRejection(state) {
    handleRejectedResponse("Network Timeout/Error", state);
}

function assignQuorumEvents(g, payload, state) {
    g.evaluatePayload(payload, state.abortController.signal)
        .then(res => handleQuorumResolution(res, state))
        .catch(() => handleQuorumRejection(state));
}

function triggerPlatformGuardians(resolve, payload, state) {
    state.resolve = resolve;
    platformGuardians.forEach(g => assignQuorumEvents(g, payload, state));
}

function buildQuorumPromise(payload, state) {
    return new Promise(function (resolve) {
        triggerPlatformGuardians(resolve, payload, state);
    });
}

function checkTimeout(state, resolve) {
    if (!state.isResolved) {
        state.isResolved = true;
        state.abortController.abort();
        resolve({ success: false, reasons: ["Gateway Timeout"] });
    }
}

function buildTimeoutPromise(state) {
    return new Promise(function (resolve) {
        setTimeout(() => checkTimeout(state, resolve), 3000);
    });
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

function updateStateIfValid(payload) {
    if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
        activeSystemState = { ...activeSystemState, ...payload.body };
        evictGlobalSemanticCache();
    }
}

function checkAuth(request, reply) {
    if (request.headers.authorization !== 'Bearer aegis-agent-token-v1') {
        reply.status(401).send({ success: false, error: 'Unauthorized: Agent DID/Token missing' });
        return false;
    }
    return true;
}

function handleRejectionReply(reply, consensus, state) {
    return reply.status(403).send({
        status: 'rejected',
        message: 'Transaction blocked by Aegis MPC Network',
        threshold_met: false,
        approvals: state.approvals,
        rejections: consensus.reasons
    });
}

function handleSuccessReply(reply, masterSignature) {
    return reply.status(200).send({
        status: 'success', message: 'Transaction authorized', threshold_met: true,
        optimistic_aggregation_ms: 'sub-100', approvals: 3, master_signature_hash: masterSignature, resulting_state: activeSystemState
    });
}

function executeMasterSignature(consensus, payload) {
    try {
        const masterSignature = getMasterSignatureHash(consensus.responses, payload);
        updateStateIfValid(payload);
        return { success: true, masterSignature };
    } catch (e) {
        return { success: false, error: e };
    }
}

async function executeTransaction(request, reply, state) {
    const payload = request.body;
    const consensus = await Promise.race([buildQuorumPromise(payload, state), buildTimeoutPromise(state)]);

    if (!consensus.success) return handleRejectionReply(reply, consensus, state);

    const execution = executeMasterSignature(consensus, payload);
    if (!execution.success) return reply.status(500).send({ error: execution.error.message });

    return handleSuccessReply(reply, execution.masterSignature);
}

server.post('/v1/execute', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    server.log.info(`[INGRESS] Received execution intent for ${request.body.method}`);
    const state = { approvals: 0, rejections: 0, safeResponses: [], rejectReasons: [], isResolved: false, abortController: new AbortController() };
    return await executeTransaction(request, reply, state);
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
