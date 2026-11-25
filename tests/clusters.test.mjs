import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterEntries, requestClusters } from '../js/clusters.js';
import { readExport } from '../js/storage.js';

test('cluster request sends only personal IDs and English spelling without mutating the imported state', async () => {
    const state = readExport(readFileSync(new URL('../demo-vocabulary.json', import.meta.url), 'utf8'));
    assert.equal(state.words.length, 38);
    const before = structuredClone(state);
    const entries = clusterEntries(state.words);
    const fetcher = async (url, options) => {
        assert.match(url, /\/api\/cluster$/);
        assert.equal(options.method, 'POST');
        const payload = JSON.parse(options.body);
        assert.deepEqual(payload.entries, before.words.map(word => ({ id: word.id, text: word.word })));
        assert.equal(payload.distance_threshold, 0.65);
        return { ok: true, json: async () => ({ groups: [] }) };
    };
    await requestClusters(entries, 0.65, undefined, fetcher);
    assert.deepEqual(state, before);
});

test('connection failures and missing model give different messages', async () => {
    await assert.rejects(requestClusters([], 0.65, undefined, async () => {
        throw new TypeError('fetch failed');
    }), /8000/);
    await assert.rejects(requestClusters([], 0.65, undefined, async () => ({ status: 503 })), /кэш/);
});
