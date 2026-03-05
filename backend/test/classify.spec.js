import { jest } from '@jest/globals';

/**
 * SemaProof Classification Engine — Spec (RED Phase)
 *
 * Tests the framework-agnostic detection orchestrator that sequences:
 *   Layer 1: OPA Deterministic Gate
 *   Layer 2: DistilBERT ONNX Classifier
 *   Layer 3: SLM Quorum Escalation
 *
 * All layer implementations are injected as dependencies (no global mutable state).
 */

// The module under test — does not exist yet (RED phase)
let classify;
let createEngine;

beforeAll(async () => {
    try {
        const mod = await import('../src/engine/classify.js');
        classify = mod.classify;
        createEngine = mod.createEngine;
    } catch {
        // Expected in RED phase — module not yet built
    }
});

describe('SemaProof Classification Engine', () => {

    describe('Layer 1: OPA Deterministic Gate', () => {

        test('should BLOCK deterministically for known-bad endpoint', async () => {
            const engine = createEngine({
                opa: {
                    evaluatePolicy: (payload) => ({
                        allow: false,
                        rule: 'BLOCKED_ENDPOINT',
                        reason: 'Sovereign policy violation',
                        evaluationMs: 0.1
                    })
                },
                classifier: { isReady: () => true },
                quorum: {}
            });

            const result = await engine.classify({
                method: 'GET',
                endpoint: '/iam/roles/root',
                body: {}
            });

            expect(result.decision).toBe('BLOCK');
            expect(result.layer).toBe('OPA_DETERMINISTIC');
            expect(result.label).toBe('BLOCKED_ENDPOINT');
            expect(result.latencyMs).toBeLessThan(5);
        });

        test('should BLOCK ransomware signature via OPA before ML layer', async () => {
            const engine = createEngine({
                opa: {
                    evaluatePolicy: (payload) => ({
                        allow: false,
                        rule: 'RANSOMWARE_SIGNATURE',
                        reason: 'KMS + snapshot drop combo',
                        evaluationMs: 0.2
                    })
                },
                classifier: { isReady: () => true },
                quorum: {}
            });

            const result = await engine.classify({
                method: 'PUT',
                endpoint: '/config',
                body: { kms_action: 'rotate_to_new_key', snapshot_retention_days: 0 }
            });

            expect(result.decision).toBe('BLOCK');
            expect(result.layer).toBe('OPA_DETERMINISTIC');
            expect(result.label).toBe('RANSOMWARE_SIGNATURE');
        });
    });

    describe('Layer 2: DistilBERT ONNX Classifier', () => {

        test('should ALLOW via DistilBERT with ≥95% SAFE confidence', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.1 }) },
                classifier: {
                    isReady: () => true,
                    classify: async (payload) => ({
                        label: 'SAFE',
                        confidence: 0.987,
                        action: 'ALLOW',
                        escalate: false,
                        mitre: null,
                        eu_ai_act: null,
                        latencyMs: 42,
                        signatureHash: 'abc123'
                    })
                },
                quorum: {}
            });

            const result = await engine.classify({
                method: 'GET',
                endpoint: '/api/v1/users',
                body: {}
            });

            expect(result.decision).toBe('ALLOW');
            expect(result.layer).toBe('SEMAPROOF_LOCAL');
            expect(result.label).toBe('SAFE');
            expect(result.confidence).toBeGreaterThanOrEqual(0.95);
            expect(result.latencyMs).toBeLessThan(100);
        });

        test('should BLOCK via DistilBERT with ≥95% threat confidence', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.1 }) },
                classifier: {
                    isReady: () => true,
                    classify: async (payload) => ({
                        label: 'RANSOMWARE_SIGNATURE',
                        confidence: 0.986,
                        action: 'BLOCK',
                        escalate: false,
                        mitre: 'T1486',
                        eu_ai_act: 'Article 15',
                        latencyMs: 33,
                        signatureHash: 'def456'
                    })
                },
                quorum: {}
            });

            const result = await engine.classify({
                method: 'PUT',
                endpoint: '/config',
                body: { backup_policy: 'disable', encrypt_volumes: true }
            });

            expect(result.decision).toBe('BLOCK');
            expect(result.layer).toBe('SEMAPROOF_LOCAL');
            expect(result.label).toBe('RANSOMWARE_SIGNATURE');
            expect(result.confidence).toBeGreaterThanOrEqual(0.95);
            expect(result.mitre).toBe('T1486');
            expect(result.eu_ai_act).toBe('Article 15');
        });

        test('should ESCALATE to SLM Quorum when confidence < 95%', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.1 }) },
                classifier: {
                    isReady: () => true,
                    classify: async (payload) => ({
                        label: 'CREDENTIAL_THEFT',
                        confidence: 0.72,
                        action: 'ESCALATE',
                        escalate: true,
                        mitre: 'T1528',
                        eu_ai_act: 'Article 9',
                        latencyMs: 55,
                        signatureHash: 'ghi789'
                    })
                },
                quorum: {
                    evaluate: async (payload) => ({
                        safe: false,
                        approvals: 1,
                        rejections: 2,
                        reason: 'Quorum rejected: CREDENTIAL_THEFT'
                    })
                }
            });

            const result = await engine.classify({
                method: 'POST',
                endpoint: '/api/keys/rotate',
                body: { target: 'admin_credentials' }
            });

            expect(result.decision).toBe('BLOCK');
            expect(result.layer).toBe('SLM_QUORUM');
        });
    });

    describe('Fallback Behavior', () => {

        test('should fall back to SLM Quorum when model is not loaded', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.1 }) },
                classifier: {
                    isReady: () => false,
                    classify: async () => ({ label: null, confidence: 0, escalate: true })
                },
                quorum: {
                    evaluate: async (payload) => ({
                        safe: true,
                        approvals: 3,
                        rejections: 0,
                        reason: 'Quorum approved: SAFE'
                    })
                }
            });

            const result = await engine.classify({
                method: 'GET',
                endpoint: '/api/status',
                body: {}
            });

            expect(result.decision).toBe('ALLOW');
            expect(result.layer).toBe('SLM_QUORUM');
        });
    });

    describe('MITRE & EU AI Act Mapping', () => {

        test('should return valid MITRE mapping for threat categories', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.1 }) },
                classifier: {
                    isReady: () => true,
                    classify: async () => ({
                        label: 'DATA_EXFILTRATION',
                        confidence: 0.97,
                        action: 'BLOCK',
                        escalate: false,
                        mitre: 'T1567',
                        eu_ai_act: 'Article 10',
                        latencyMs: 40,
                        signatureHash: 'jkl012'
                    })
                },
                quorum: {}
            });

            const result = await engine.classify({
                method: 'POST',
                endpoint: '/s3/upload',
                body: { destination: 'external-bucket' }
            });

            expect(result.mitre).toBe('T1567');
            expect(result.eu_ai_act).toBe('Article 10');
        });
    });

    describe('Performance Contract', () => {

        test('should not exceed 100ms for OPA + DistilBERT combined', async () => {
            const engine = createEngine({
                opa: { evaluatePolicy: () => ({ allow: true, rule: 'ALL_RULES_PASSED', evaluationMs: 0.5 }) },
                classifier: {
                    isReady: () => true,
                    classify: async () => ({
                        label: 'SAFE',
                        confidence: 0.99,
                        action: 'ALLOW',
                        escalate: false,
                        mitre: null,
                        eu_ai_act: null,
                        latencyMs: 30,
                        signatureHash: 'mno345'
                    })
                },
                quorum: {}
            });

            const start = performance.now();
            const result = await engine.classify({
                method: 'GET',
                endpoint: '/api/health',
                body: {}
            });
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(100);
            expect(result.decision).toBe('ALLOW');
        });
    });
});
