import test from 'node:test';
import assert from 'node:assert/strict';
import { editWord, empty, initial, migrate, review, validate } from '../js/model.js';
import { BACKUP, KEY, RECOVERY, makeStore, readExport } from '../js/storage.js';

const today = '2026-11-25';
const progress = { interval: 6, repetition: 2, easeFactor: 2.6, nextReviewDate: '2026-11-28' };
const flat = { id: 7, word: 'light', translation: 'свет', tag: 'Noun', ...progress };
const log = [{ date: '2026-11-24', res: 'ok' }];

function fixture(entries = []) {
    const data = new Map(entries);
    const failures = new Set();
    let queue = Promise.resolve();
    const locks = { request(name, fn) {
        assert.equal(name, 'vocabulary-pro.myWords');
        const next = queue.then(fn);
        queue = next.catch(() => {});
        return next;
    } };
    const storage = {
        getItem: key => data.get(key) ?? null,
        setItem(key, value) {
            if (failures.has(key)) throw new Error('write denied');
            data.set(key, value);
        }
    };
    return { data, failures, storage, locks, store: makeStore(storage, locks, () => today) };
}

test('flat records, mixed translations, partial schedules and ID collisions', () => {
    const mixed = { ...flat, translations: [
        { translation: 'свет', tag: 'Noun', interval: 4 },
        { translation: 'лёгкий', tag: 'Adjective', repetition: null, easeFactor: 1,
            nextReviewDate: '2026-02-30' }
    ] };
    const state = migrate([flat, mixed], log, today);
    assert.equal(state.words[0].id, '7');
    assert.notEqual(state.words[1].id, '7');
    assert.deepEqual(state.words[0].translations[0].schedule, progress);
    assert.deepEqual(state.words[1].translations[0].schedule, { ...progress, interval: 4 });
    assert.deepEqual(state.words[1].translations[1].schedule, initial(today));
    assert.deepEqual(state.activity, log);
    assert.deepEqual(state, migrate([flat, mixed], log, today));
});

test('first translation with different meaning does not inherit word progress', () => {
    const state = migrate([{ ...flat, translations: [{ translation: 'лёгкий', tag: 'Adjective' }] }], [], today);
    assert.deepEqual(state.words[0].translations[0].schedule, initial(today));
});

test('migration backs up exact originals and re-opening never changes IDs or schedule', async () => {
    const wordsRaw = JSON.stringify([flat], null, 2);
    const logRaw = JSON.stringify(log);
    const { store, data } = fixture([[KEY, wordsRaw], ['activityLog', logRaw]]);
    const result = await store.start();
    assert.deepEqual(JSON.parse(data.get(BACKUP)), { myWords: wordsRaw, activityLog: logRaw });
    const persisted = data.get(KEY);
    assert.deepEqual(await store.start(), result);
    assert.equal(data.get(KEY), persisted);
    assert.equal(data.get('activityLog'), logRaw);
});

test('editing transcription, adding a sense and deleting another preserve existing progress', () => {
    let n = 0;
    const newId = () => 'new-' + ++n;
    const old = migrate([flat], [], today).words[0];
    const added = editWord(old, { ...old, transcription: 'IPA', translations: [
        ...old.translations, { translation: 'лёгкий', tag: 'Adjective', context: 'A "light" bag' }
    ] }, today, newId);
    assert.equal(added.id, old.id);
    assert.deepEqual(added.translations[0], old.translations[0]);
    assert.deepEqual(added.translations[1].schedule, initial(today));
    const remaining = editWord(added, { ...added, translations: [added.translations[0]] }, today, newId);
    assert.deepEqual(remaining.translations, old.translations);
});

test('scheduling uses local days and starts with 1 and 6 days', () => {
    const now = new Date(2026, 10, 25, 0, 30);
    const first = review(initial(today), 5, now);
    assert.equal(first.interval, 1);
    assert.equal(first.nextReviewDate, '2026-11-26');
    const second = review(first, 5, new Date(2026, 10, 26));
    assert.equal(second.interval, 6);
    assert.equal(review(second, 1, now).repetition, 0);
});

test('round trip retains schedule and journal; invalid or unknown export fails', () => {
    const state = migrate([flat], log, today);
    assert.deepEqual(readExport(JSON.stringify(state), today), state);
    assert.deepEqual(readExport(JSON.stringify([flat]), today).words, state.words);
    for (const data of ['{', '{}', 'null', '[3]', '{ "version":2, "words":[], "activity":[] }']) {
        assert.throws(() => readExport(data, today));
    }
    assert.throws(() => validate({ ...state, words: [...state.words, ...state.words] }));
});

test('invalid storage does not change before explicit validated replacement', async () => {
    for (const invalid of ['{', '{}', 'null', '[3]']) {
        const { store, data } = fixture([[KEY, invalid]]);
        await assert.rejects(store.start());
        await assert.rejects(store.update(() => empty()));
        assert.equal(data.get(KEY), invalid);
        assert.equal(data.has(BACKUP), false);
        const next = migrate([flat], log, today);
        await store.replace(next, store.raw());
        assert.equal(JSON.parse(data.get(RECOVERY)).myWords, invalid);
        assert.deepEqual(store.read(), next);
    }
});

test('corrupt legacy journal remains recoverable', async () => {
    const raw = JSON.stringify([flat]);
    const { store, data } = fixture([[KEY, raw], ['activityLog', 'null']]);
    await assert.rejects(store.start());
    assert.deepEqual(store.raw(), { myWords: raw, activityLog: 'null' });
    assert.equal(data.has(BACKUP), false);
});

test('backup and write failures leave source intact', async () => {
    const raw = JSON.stringify([flat]);
    const { store, failures, data } = fixture([[KEY, raw]]);
    failures.add(BACKUP);
    await assert.rejects(store.start(), /write denied/);
    assert.equal(data.get(KEY), raw);
    failures.clear();
    failures.add(KEY);
    await assert.rejects(store.start(), /write denied/);
    assert.equal(data.get(KEY), raw);
    assert.equal(JSON.parse(data.get(BACKUP)).myWords, raw);
});

test('separate tabs serialize writes and stale import cannot overwrite a newer record', async () => {
    const { store, storage, locks } = fixture();
    await store.start();
    const other = makeStore(storage, locks, () => today);
    const before = other.raw();
    const word = migrate([flat], [], today).words[0];
    await Promise.all([
        store.update(state => { state.words.push(word); return state; }),
        other.update(state => { state.activity.push(...log); return state; })
    ]);
    assert.deepEqual(store.read().words, [word]);
    assert.deepEqual(store.read().activity, log);
    await assert.rejects(other.replace(empty(), before));
    assert.equal(store.read().words.length, 1);
});

test('without Web Locks reads work and all writes fail closed', async () => {
    const { storage, data } = fixture([[KEY, JSON.stringify([flat])]]);
    const store = makeStore(storage, undefined, () => today);
    assert.equal(store.read().words.length, 1);
    assert.throws(() => store.start(), /Web Locks/);
    assert.throws(() => store.update(() => empty()), /Web Locks/);
    assert.throws(() => store.replace(empty(), store.raw()), /Web Locks/);
    assert.ok(Array.isArray(JSON.parse(data.get(KEY))));
});

test('raw backup import recovers the legacy journal together with words', () => {
    const raw = JSON.stringify({ myWords: JSON.stringify([flat]), activityLog: JSON.stringify(log) });
    assert.deepEqual(readExport(raw, today), migrate([flat], log, today));
    assert.throws(() => readExport(JSON.stringify({ myWords: '{', activityLog: null }), today));
});
