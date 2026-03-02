import { jest } from '@jest/globals';
import { VirtualGuardian } from '../src/guardian.js';

describe('VirtualGuardian', () => {
    let guardian;

    beforeEach(() => {
        guardian = new VirtualGuardian(1);
    });

    test('should instantiate properly with mathematical key-shard', () => {
        expect(guardian.guardianId).toBe('GuardianNode-1');
        expect(guardian.keyShard).toBeDefined();
        expect(guardian.publicKey).toBeDefined();
    });

    // Mock global fetch
    test('evaluatePayload should block payload if SLM returns ERROR', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false
            })
        );

        const payload = { method: 'DELETE', endpoint: '/production/db' };
        const result = await guardian.evaluatePayload(payload, new AbortController().signal);

        expect(result.safe).toBe(false);
        expect(result.reason).toContain('Semantic Evaluation failed');
    });

    test('evaluatePayload should authorize and slice BLS shards if SLM returns SAFE', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "SAFE" } }] })
            })
        );

        const payload = { method: 'GET', endpoint: '/public/status' };
        const result = await guardian.evaluatePayload(payload, new AbortController().signal);

        expect(result.safe).toBe(true);
        expect(result.guardianId).toBe('GuardianNode-1');
        expect(result.signatureShard).toBeDefined();
        expect(result.publicKey).toBeDefined();
    });

    test('evaluatePayload should abort gracefully if AbortController signals', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('AbortError')));

        const payload = { method: 'GET', endpoint: '/public/status' };
        try {
            await guardian.evaluatePayload(payload, new AbortController().signal);
        } catch (error) {
            expect(error.message).toContain('AbortError');
        }
    });

    test('semantic cache should hit on duplicate payload and bypass fetch', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "SAFE" } }] })
            })
        );

        const payload = { method: 'GET', endpoint: '/cached/data' };

        const result1 = await guardian.evaluatePayload(payload, new AbortController().signal);
        expect(result1.safe).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const result2 = await guardian.evaluatePayload(payload, new AbortController().signal);
        expect(result2.safe).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('semantic cache should clear correctly on eviction trigger', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: "SAFE" } }] })
            })
        );

        const payload = { method: 'GET', endpoint: '/eviction/test' };

        await guardian.evaluatePayload(payload, new AbortController().signal);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const { evictGlobalSemanticCache } = await import('../src/guardian.js');
        evictGlobalSemanticCache();

        await guardian.evaluatePayload(payload, new AbortController().signal);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
