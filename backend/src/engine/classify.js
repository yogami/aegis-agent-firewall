/**
 * SemaProof Classification Engine — Framework-Agnostic Orchestrator
 *
 * Sequences detection through a 3-layer pipeline:
 *   Layer 1: OPA Deterministic Gate (<1ms)
 *   Layer 2: DistilBERT ONNX Classifier (30-80ms)
 *   Layer 3: SLM Quorum Escalation (~800ms, only when needed)
 *
 * All layers are injected as dependencies — no global state, no framework coupling.
 *
 * @module engine/classify
 */

/**
 * Create a classification engine with injected layer dependencies.
 *
 * @param {Object} deps
 * @param {Object} deps.opa - OPA gate: { evaluatePolicy(payload) → OpaResult }
 * @param {Object} deps.classifier - ML classifier: { isReady(), classify(payload) → ClassifierResult }
 * @param {Object} deps.quorum - SLM quorum: { evaluate(payload) → QuorumResult }
 * @returns {{ classify: (payload: Object) => Promise<ClassificationResult> }}
 */
export function createEngine({ opa, classifier, quorum }) {
    return { classify: (payload) => classify(payload, { opa, classifier, quorum }) };
}

/**
 * Classify a payload through the 3-layer pipeline.
 *
 * @param {Object} payload - { method, endpoint, body }
 * @param {Object} deps - Injected layer implementations
 * @returns {Promise<ClassificationResult>}
 */
export async function classify(payload, { opa, classifier, quorum }) {
    const start = performance.now();

    // Layer 1: OPA Deterministic Gate
    const opaResult = opa.evaluatePolicy(payload);
    if (!opaResult.allow) {
        return buildResult({
            decision: 'BLOCK',
            layer: 'OPA_DETERMINISTIC',
            label: opaResult.rule,
            confidence: 1.0,
            mitre: null,
            eu_ai_act: null,
            latencyMs: opaResult.evaluationMs,
            signatureHash: null
        });
    }

    // Layer 2: DistilBERT ONNX Classifier
    if (classifier.isReady()) {
        const mlResult = await classifier.classify(payload);

        if (mlResult.action === 'ALLOW') {
            return buildResult({
                decision: 'ALLOW',
                layer: 'SEMAPROOF_LOCAL',
                label: mlResult.label,
                confidence: mlResult.confidence,
                mitre: mlResult.mitre,
                eu_ai_act: mlResult.eu_ai_act,
                latencyMs: mlResult.latencyMs,
                signatureHash: mlResult.signatureHash
            });
        }

        if (mlResult.action === 'BLOCK') {
            return buildResult({
                decision: 'BLOCK',
                layer: 'SEMAPROOF_LOCAL',
                label: mlResult.label,
                confidence: mlResult.confidence,
                mitre: mlResult.mitre,
                eu_ai_act: mlResult.eu_ai_act,
                latencyMs: mlResult.latencyMs,
                signatureHash: mlResult.signatureHash
            });
        }

        // ESCALATE falls through to Layer 3
    }

    // Layer 3: SLM Quorum Escalation
    const quorumResult = await quorum.evaluate(payload);
    const totalMs = performance.now() - start;

    return buildResult({
        decision: quorumResult.safe ? 'ALLOW' : 'BLOCK',
        layer: 'SLM_QUORUM',
        label: quorumResult.safe ? 'SAFE' : 'QUORUM_REJECTED',
        confidence: null,
        mitre: null,
        eu_ai_act: null,
        latencyMs: totalMs,
        signatureHash: null
    });
}

/**
 * Build a standardized classification result.
 * @private
 */
function buildResult({ decision, layer, label, confidence, mitre, eu_ai_act, latencyMs, signatureHash }) {
    return {
        decision,
        layer,
        label,
        confidence,
        mitre,
        eu_ai_act,
        latencyMs,
        signatureHash
    };
}
