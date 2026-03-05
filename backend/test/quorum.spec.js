import { jest } from '@jest/globals';

/**
 * SemaProof SLM Quorum — Spec
 *
 * Tests the cloud LLM consensus layer (Layer 3).
 * Uses mocked fetch to simulate OpenRouter responses.
 */

import { createQuorum } from '../src/engine/quorum.js';

describe('SLM Quorum Engine', () => {

    let quorum;

    beforeEach(() => {
        quorum = createQuorum({ apiKey: 'test-key', timeoutMs: 1000 });
    });

    test('should return 3 models in the registry', () => {
        const models = quorum.getModels();
        expect(models).toHaveLength(3);
        expect(models.map(m => m.provider)).toEqual(['Alibaba', 'Google', 'Meta']);
    });

    test('should ALLOW when 3-of-3 models return SAFE', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: 'SAFE' } }] })
            })
        );

        const result = await quorum.evaluate({
            method: 'GET',
            endpoint: '/api/status',
            body: {}
        });

        expect(result.safe).toBe(true);
        expect(result.approvals).toBe(3);
        expect(result.rejections).toBe(0);
    });

    test('should ALLOW when 2-of-3 models return SAFE (majority)', async () => {
        let callCount = 0;
        global.fetch = jest.fn(() => {
            callCount++;
            const content = callCount <= 2 ? 'SAFE' : 'MALICIOUS';
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content } }] })
            });
        });

        const result = await quorum.evaluate({
            method: 'POST',
            endpoint: '/api/ambiguous',
            body: {}
        });

        expect(result.safe).toBe(true);
        expect(result.approvals).toBe(2);
        expect(result.rejections).toBe(1);
    });

    test('should BLOCK when 2-of-3 models return MALICIOUS', async () => {
        let callCount = 0;
        global.fetch = jest.fn(() => {
            callCount++;
            const content = callCount === 1 ? 'SAFE' : 'MALICIOUS';
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content } }] })
            });
        });

        const result = await quorum.evaluate({
            method: 'DELETE',
            endpoint: '/production/db',
            body: {}
        });

        expect(result.safe).toBe(false);
        expect(result.approvals).toBe(1);
        expect(result.rejections).toBe(2);
    });

    test('should BLOCK when all models return errors', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: false })
        );

        const result = await quorum.evaluate({
            method: 'DELETE',
            endpoint: '/critical/resource',
            body: {}
        });

        expect(result.safe).toBe(false);
        expect(result.rejections).toBe(3);
    });

    test('should use semantic cache on repeated payloads', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: 'SAFE' } }] })
            })
        );

        const payload = { method: 'GET', endpoint: '/api/cached', body: {} };

        await quorum.evaluate(payload);
        expect(global.fetch).toHaveBeenCalledTimes(3);

        await quorum.evaluate(payload);
        expect(global.fetch).toHaveBeenCalledTimes(3); // Still 3 — cache hit
    });
});
