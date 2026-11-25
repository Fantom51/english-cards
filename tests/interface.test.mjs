import test from 'node:test';
import assert from 'node:assert/strict';
import { addsDuplicateSense, categoryCounts, runCardAction, suggestedTags, tagColor } from '../js/interface.js';

test('distribution counts every sense, keeps category colors independent of order and handles empty data', () => {
    const noun = { tag: 'Noun' };
    const verb = { tag: 'Verb' };
    const result = categoryCounts([verb, noun, noun]);
    assert.deepEqual(result.map(({ tag, count, share }) => [tag, count, share]),
        [['Verb', 1, 1 / 3], ['Noun', 2, 2 / 3]]);
    assert.equal(result[1].color, categoryCounts([noun, verb])[0].color);
    assert.equal(tagColor('constructor'), '#7f8c8d');
    assert.deepEqual(categoryCounts([]), []);
});

test('existing duplicate translations survive editing but new duplicates are rejected', () => {
    const old = [{ id: 'a', translation: 'light', tag: 'Noun' }, { id: 'b', translation: 'LIGHT', tag: 'Noun' }];
    assert.equal(addsDuplicateSense(old, old), false);
    assert.equal(addsDuplicateSense([...old, { translation: 'light', tag: 'Noun' }], old), true);
    assert.equal(addsDuplicateSense([{ ...old[0], translation: 'other' }, old[1]], old), false);
    assert.equal(addsDuplicateSense(old), true);
    assert.equal(addsDuplicateSense([...old, { translation: 'light', tag: 'Adjective' }], old), false);
});

test('Datamuse preserves distinct supported suggestions in response order', () => {
    assert.deepEqual(suggestedTags(['f:2', 'v', 'n', 'v', 'adj']), ['Verb', 'Noun', 'Adjective']);
    assert.deepEqual(suggestedTags('noun'), []);
});

test('card action commits once before animation and ignores concurrent activation', async () => {
    const active = { busy: false };
    const calls = [];
    let finish;
    const animation = new Promise(resolve => { finish = resolve; });
    const run = () => runCardAction(active, () => true, () => calls.push('commit'),
        () => { calls.push('animate'); return animation; }, () => calls.push('advance'));
    const first = run();
    await run();
    assert.deepEqual(calls, ['commit', 'animate']);
    assert.equal(active.busy, true);
    finish();
    await first;
    assert.deepEqual(calls, ['commit', 'animate', 'advance']);
    assert.equal(active.busy, false);
});

test('exit during animation does not advance or cause another save', async () => {
    const active = { busy: false };
    let current = true;
    let saves = 0;
    const run = () => runCardAction(active, () => current, () => { saves++; },
        () => { current = false; }, () => assert.fail('inactive session advanced'));
    await run();
    await run();
    assert.equal(saves, 1);
    assert.equal(active.busy, false);
});

test('failed write releases the card without starting animation', async () => {
    const active = { busy: false };
    const later = () => assert.fail('card continued after failed write');
    await assert.rejects(runCardAction(active, () => true, () => { throw Error('write denied'); }, later, later), /write denied/);
    assert.equal(active.busy, false);
});
