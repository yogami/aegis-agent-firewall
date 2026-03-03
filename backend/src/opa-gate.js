/**
 * OPA Gate — Deterministic Policy-as-Code Layer (Layer 1)
 *
 * Lightweight, in-process policy evaluator that follows OPA/Rego semantics.
 * Evaluates hard rules in sub-1ms BEFORE the payload reaches the SLM quorum.
 * This is the "Deterministic Compliance Floor" that cannot be bypassed
 * by prompt injection or SLM hallucination.
 */

const BODY_SIZE_LIMIT = 8192;

const BLOCKED_ENDPOINTS = [
    '/iam/roles/root',
    '/iam/users/*/delete',
    '/kms/keys/*/schedule-deletion',
    '/rds/clusters/*/delete',
    '/s3/buckets/*/delete',
    '/ec2/instances/*/terminate-all',
];

/** Pre-compiled regex patterns for blocked endpoints (avoids non-literal RegExp) */
const BLOCKED_PATTERNS = BLOCKED_ENDPOINTS.map(ep => {
    const pattern = ep.replace(/\*/g, '[^/]+');
    return new RegExp(`^${pattern}$`, 'i');
});

const BLOCKED_METHODS_ON_PRODUCTION = ['DELETE', 'TRUNCATE', 'DROP'];

const DATA_RESIDENCY_BLOCKED_REGIONS = ['cn-north-1', 'cn-northwest-1', 'ap-east-1'];

/** Helper: create a deny decision */
function deny(rule, reason, start) {
    return { allow: false, rule, reason, evaluationMs: Number((performance.now() - start).toFixed(3)) };
}

/** Helper: create an allow decision */
function allow(rule, start) {
    return { allow: true, rule, reason: 'Passed deterministic gate', evaluationMs: Number((performance.now() - start).toFixed(3)) };
}

/** Rule 1: Payload size limit */
function checkPayloadSize(payload, start) {
    const bodyString = JSON.stringify(payload);
    if (bodyString.length > BODY_SIZE_LIMIT) {
        return deny('PAYLOAD_SIZE', `Payload exceeds ${BODY_SIZE_LIMIT} byte limit (${bodyString.length} bytes). Possible semantic smuggling.`, start);
    }
    return null;
}

/** Rule 2: Required fields */
function checkRequiredFields(payload, start) {
    if (!payload.method || !payload.endpoint) {
        return deny('MISSING_FIELDS', 'Payload must include method and endpoint fields.', start);
    }
    return null;
}

/** Rule 3: Blocked endpoints */
function checkBlockedEndpoint(payload, start) {
    const normalizedEndpoint = payload.endpoint.toLowerCase();
    const isBlocked = BLOCKED_PATTERNS.some(regex => regex.test(normalizedEndpoint));
    if (isBlocked) {
        return deny('BLOCKED_ENDPOINT', `Endpoint ${payload.endpoint} is permanently blocked by sovereign policy.`, start);
    }
    return null;
}

/** Rule 4: Destructive methods on production */
function checkDestructiveMethod(payload, env, start) {
    if (env === 'production' && BLOCKED_METHODS_ON_PRODUCTION.includes(payload.method.toUpperCase())) {
        return deny('DESTRUCTIVE_METHOD', `Method ${payload.method} is blocked on production environment. Requires human override.`, start);
    }
    return null;
}

/** Rule 5: Data residency */
function checkDataResidency(payload, start) {
    const violatesResidency = DATA_RESIDENCY_BLOCKED_REGIONS.some(r => payload.endpoint.includes(r));
    if (violatesResidency) {
        return deny('DATA_RESIDENCY', 'Request targets a blocked data residency region. EU sovereign data policy violation.', start);
    }
    return null;
}

/** Check if body indicates KMS key rotation */
function hasKmsRotation(bodyStr) {
    return bodyStr.includes('kms') && (bodyStr.includes('rotate') || bodyStr.includes('new_key'));
}

/** Check if body indicates snapshot retention drop */
function hasSnapshotDrop(bodyStr) {
    return bodyStr.includes('snapshot') && (bodyStr.includes('0') || bodyStr.includes('disable'));
}

/** Rule 6: Ransomware signature detection */
function checkRansomwareSignature(payload, start) {
    if (!payload.body) return null;
    const bodyStr = JSON.stringify(payload.body).toLowerCase();
    if (hasKmsRotation(bodyStr) && hasSnapshotDrop(bodyStr)) {
        return deny('RANSOMWARE_SIGNATURE', 'Combined KMS rotation + snapshot retention drop detected. Ransomware attack pattern.', start);
    }
    return null;
}

/** Rule 7: Agent tier restrictions */
function checkTierRestriction(payload, options, start) {
    if (options.agentTier === 'T1' && payload.method.toUpperCase() !== 'GET') {
        return deny('TIER_RESTRICTION', 'T1 agents are restricted to read-only (GET) operations.', start);
    }
    return null;
}

/** Run a pipeline of rule checks, returning the first denial or null */
function runPipeline(rules) {
    for (const rule of rules) {
        const result = rule();
        if (result) return result;
    }
    return null;
}

/**
 * Evaluate a payload against the deterministic policy gate.
 * Runs a pipeline of individual rule checks, each with complexity ≤ 3.
 */
export function evaluatePolicy(payload, options = {}) {
    const start = performance.now();
    const env = options.environment || 'production';

    const rules = [
        () => checkPayloadSize(payload, start),
        () => checkRequiredFields(payload, start),
        () => checkBlockedEndpoint(payload, start),
        () => checkDestructiveMethod(payload, env, start),
        () => checkDataResidency(payload, start),
        () => checkRansomwareSignature(payload, start),
        () => checkTierRestriction(payload, options, start),
    ];

    return runPipeline(rules) || allow('ALL_RULES_PASSED', start);
}

/**
 * Get the full policy manifest (for /api/docs and audit trails)
 */
export function getPolicyManifest() {
    return {
        version: '1.0.0',
        engine: 'SemaProof OPA Gate (Deterministic)',
        rules: [
            { id: 'PAYLOAD_SIZE', description: `Payload must be under ${BODY_SIZE_LIMIT} bytes`, type: 'anti-smuggling' },
            { id: 'MISSING_FIELDS', description: 'method and endpoint are required', type: 'schema' },
            { id: 'BLOCKED_ENDPOINT', description: 'Sovereign endpoint blocklist', type: 'access-control', count: BLOCKED_ENDPOINTS.length },
            { id: 'DESTRUCTIVE_METHOD', description: 'DELETE/TRUNCATE/DROP blocked on production', type: 'environment' },
            { id: 'DATA_RESIDENCY', description: 'EU sovereign data residency enforcement', type: 'compliance' },
            { id: 'RANSOMWARE_SIGNATURE', description: 'KMS rotation + snapshot drop combo detection', type: 'threat-detection' },
            { id: 'TIER_RESTRICTION', description: 'T1 agents limited to GET requests', type: 'rbac' },
        ],
        blockedEndpoints: BLOCKED_ENDPOINTS,
        blockedRegions: DATA_RESIDENCY_BLOCKED_REGIONS,
    };
}
