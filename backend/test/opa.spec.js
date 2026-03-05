/**
 * SemaProof OPA Gate — Spec
 *
 * Tests the deterministic policy-as-code layer (Layer 1).
 * These rules run in sub-1ms and cannot be bypassed by ML/LLM.
 */

import { evaluatePolicy, getPolicyManifest } from '../src/opa-gate.js';

describe('OPA Deterministic Gate', () => {

    describe('Rule Pipeline', () => {

        test('should ALLOW safe GET requests', () => {
            const result = evaluatePolicy({
                method: 'GET',
                endpoint: '/api/v1/users',
                body: {}
            });

            expect(result.allow).toBe(true);
            expect(result.rule).toBe('ALL_RULES_PASSED');
            expect(result.evaluationMs).toBeLessThan(5);
        });

        test('should BLOCK sovereign blocklisted endpoints', () => {
            const result = evaluatePolicy({
                method: 'GET',
                endpoint: '/iam/roles/root',
                body: {}
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('BLOCKED_ENDPOINT');
        });

        test('should BLOCK destructive methods on production', () => {
            const result = evaluatePolicy(
                { method: 'DELETE', endpoint: '/api/records', body: {} },
                { environment: 'production' }
            );

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('DESTRUCTIVE_METHOD');
        });

        test('should ALLOW destructive methods on staging', () => {
            const result = evaluatePolicy(
                { method: 'DELETE', endpoint: '/api/records', body: {} },
                { environment: 'staging' }
            );

            expect(result.allow).toBe(true);
        });

        test('should BLOCK KMS + snapshot ransomware combo', () => {
            const result = evaluatePolicy({
                method: 'PUT',
                endpoint: '/config',
                body: { kms_action: 'rotate_to_new_key', snapshot_retention_days: 0 }
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('RANSOMWARE_SIGNATURE');
        });

        test('should BLOCK data residency violations', () => {
            const result = evaluatePolicy({
                method: 'GET',
                endpoint: '/s3/cn-north-1/bucket-data',
                body: {}
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('DATA_RESIDENCY');
        });

        test('should BLOCK deeply nested payloads (semantic smuggling)', () => {
            const result = evaluatePolicy({
                method: 'GET',
                endpoint: '/api/data',
                body: { a: { b: { c: { d: { e: { f: 'deep' } } } } } }
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('SEMANTIC_SMUGGLING');
        });

        test('should BLOCK obfuscation patterns (eval/base64)', () => {
            const result = evaluatePolicy({
                method: 'GET',
                endpoint: '/api/data',
                body: { command: 'eval(decode_base64(payload))' }
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('OBFUSCATION_DETECTED');
        });

        test('should BLOCK T1 agents from non-GET operations', () => {
            const result = evaluatePolicy(
                { method: 'POST', endpoint: '/api/data', body: {} },
                { agentTier: 'T1' }
            );

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('TIER_RESTRICTION');
        });

        test('should BLOCK payloads exceeding size limit', () => {
            const result = evaluatePolicy({
                method: 'POST',
                endpoint: '/api/data',
                body: { data: 'x'.repeat(9000) }
            });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('PAYLOAD_SIZE');
        });

        test('should BLOCK payloads missing required fields', () => {
            const result = evaluatePolicy({ body: {} });

            expect(result.allow).toBe(false);
            expect(result.rule).toBe('MISSING_FIELDS');
        });
    });

    describe('Sub-Millisecond Performance', () => {

        test('should evaluate all rules in under 1ms', () => {
            const start = performance.now();
            evaluatePolicy({
                method: 'GET',
                endpoint: '/api/safe',
                body: {}
            });
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(1);
        });
    });

    describe('Policy Manifest', () => {

        test('should return 9 rules in manifest', () => {
            const manifest = getPolicyManifest();

            expect(manifest.version).toBe('1.1.0');
            expect(manifest.rules).toHaveLength(9);
            expect(manifest.blockedEndpoints).toBeDefined();
            expect(manifest.blockedRegions).toBeDefined();
        });
    });
});
