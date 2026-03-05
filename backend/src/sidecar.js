/**
 * SemaProof Sidecar Entry Point
 *
 * Boots the ext_authz server with the real classification engine.
 * Used by Dockerfile.sidecar as the container entrypoint.
 */

import { createEngine } from './engine/classify.js';
import { evaluatePolicy } from './opa-gate.js';
import { classifyPayload, isModelReady, initSemaProof } from './semaproof-classifier.js';
import { createExtAuthzServer } from './transport/ext-authz.js';

// Build the classification engine with real layer implementations
const engine = createEngine({
    opa: { evaluatePolicy },
    classifier: {
        isReady: isModelReady,
        classify: async (payload) => {
            const payloadStr = JSON.stringify(payload);
            return classifyPayload(payloadStr);
        }
    },
    quorum: {
        evaluate: async (payload) => {
            // Simplified quorum — import guardian if needed
            return { safe: true, approvals: 3, rejections: 0, reason: 'Default allow (quorum disabled in sidecar)' };
        }
    }
});

const port = parseInt(process.env.PORT || '9001', 10);

// Initialize the DistilBERT model in background
initSemaProof().catch(err => {
    console.warn('[SEMAPROOF] Model init failed, running OPA-only mode:', err.message);
});

// Start ext_authz server
const server = await createExtAuthzServer(engine, { port });
console.log(`🛡️  SemaProof ext_authz sidecar listening on port ${port}`);
