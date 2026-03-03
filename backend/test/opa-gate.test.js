/**
 * OPA Gate Unit Tests
 * Tests the deterministic policy-as-code layer (Layer 1 of the Hybrid Guardrail).
 * Every rule must be 100% branch-covered — this is the "Deterministic Compliance Floor".
 */

import { evaluatePolicy, getPolicyManifest } from '../src/opa-gate.js';

describe('OPA Gate — Deterministic Policy Evaluator', () => {

    describe('Rule: PAYLOAD_SIZE', () => {
        it('blocks payloads exceeding 8192 bytes', () => {
            const largePayload = { method: 'POST', endpoint: '/api/data', body: 'x'.repeat(9000) };
            const result = evaluatePolicy(largePayload);
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('PAYLOAD_SIZE');
        });

        it('allows payloads under the limit', () => {
            const smallPayload = { method: 'GET', endpoint: '/api/data' };
            const result = evaluatePolicy(smallPayload);
            expect(result.allow).toBe(true);
        });
    });

    describe('Rule: MISSING_FIELDS', () => {
        it('blocks payloads without method', () => {
            const result = evaluatePolicy({ endpoint: '/api/data' });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('MISSING_FIELDS');
        });

        it('blocks payloads without endpoint', () => {
            const result = evaluatePolicy({ method: 'GET' });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('MISSING_FIELDS');
        });
    });

    describe('Rule: BLOCKED_ENDPOINT', () => {
        it('blocks /iam/roles/root', () => {
            const result = evaluatePolicy({ method: 'PUT', endpoint: '/iam/roles/root' });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('BLOCKED_ENDPOINT');
        });

        it('blocks wildcard matched deletion endpoints', () => {
            const result = evaluatePolicy({ method: 'POST', endpoint: '/iam/users/admin/delete' });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('BLOCKED_ENDPOINT');
        });

        it('allows non-blocked endpoints', () => {
            const result = evaluatePolicy({ method: 'GET', endpoint: '/api/v1/users' });
            expect(result.allow).toBe(true);
        });
    });

    describe('Rule: DESTRUCTIVE_METHOD', () => {
        it('blocks DELETE on production', () => {
            const result = evaluatePolicy(
                { method: 'DELETE', endpoint: '/api/records' },
                { environment: 'production' }
            );
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('DESTRUCTIVE_METHOD');
        });

        it('allows DELETE on staging', () => {
            const result = evaluatePolicy(
                { method: 'DELETE', endpoint: '/api/records' },
                { environment: 'staging' }
            );
            expect(result.allow).toBe(true);
        });
    });

    describe('Rule: DATA_RESIDENCY', () => {
        it('blocks requests targeting cn-north-1', () => {
            const result = evaluatePolicy({ method: 'GET', endpoint: '/s3/cn-north-1/bucket-data' });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('DATA_RESIDENCY');
        });

        it('allows requests to eu-west-1', () => {
            const result = evaluatePolicy({ method: 'GET', endpoint: '/s3/eu-west-1/bucket-data' });
            expect(result.allow).toBe(true);
        });
    });

    describe('Rule: RANSOMWARE_SIGNATURE', () => {
        it('blocks KMS rotation + snapshot drop combo', () => {
            const result = evaluatePolicy({
                method: 'PUT',
                endpoint: '/config/infrastructure',
                body: { kms_action: 'rotate_to_new_key', snapshot_retention_days: 0 }
            });
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('RANSOMWARE_SIGNATURE');
        });

        it('allows KMS rotation alone', () => {
            const result = evaluatePolicy({
                method: 'PUT',
                endpoint: '/config/infrastructure',
                body: { kms_action: 'rotate_to_new_key' }
            });
            expect(result.allow).toBe(true);
        });
    });

    describe('Rule: TIER_RESTRICTION', () => {
        it('blocks non-GET from T1 agents', () => {
            const result = evaluatePolicy(
                { method: 'POST', endpoint: '/api/data' },
                { agentTier: 'T1' }
            );
            expect(result.allow).toBe(false);
            expect(result.rule).toBe('TIER_RESTRICTION');
        });

        it('allows GET from T1 agents', () => {
            const result = evaluatePolicy(
                { method: 'GET', endpoint: '/api/data' },
                { agentTier: 'T1' }
            );
            expect(result.allow).toBe(true);
        });
    });

    describe('Policy Manifest', () => {
        it('returns all 7 rules', () => {
            const manifest = getPolicyManifest();
            expect(manifest.rules).toHaveLength(7);
            expect(manifest.version).toBe('1.0.0');
        });
    });

    describe('Performance', () => {
        it('evaluates in sub-1ms', () => {
            const result = evaluatePolicy({ method: 'GET', endpoint: '/api/safe-endpoint' });
            expect(result.evaluationMs).toBeLessThan(1);
        });
    });
});
