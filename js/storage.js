import { day, migrate, validate } from './model.js';

export const KEY = 'myWords';
const LOG = 'activityLog';
export const BACKUP = 'vocabularyPro.migrationBackup';
export const RECOVERY = 'vocabularyPro.recoveryBackup';
const parse = raw => JSON.parse(raw);

function decode(snapshot, today) {
    const data = snapshot.myWords === null ? [] : parse(snapshot.myWords);
    if (!Array.isArray(data)) return validate(data);
    const log = snapshot.activityLog === null ? [] : parse(snapshot.activityLog);
    return migrate(data, log, today);
}

export function readExport(text, today = day()) {
    const data = parse(text);
    if (Array.isArray(data)) return migrate(data, [], today);
    if (data && Object.hasOwn(data, 'myWords') && Object.hasOwn(data, 'activityLog') &&
        [data.myWords, data.activityLog].every(value => value === null || typeof value === 'string')) {
        return decode(data, today);
    }
    return validate(data);
}

export function makeStore(storage, locks, today = day) {
    function raw() {
        return { myWords: storage.getItem(KEY), activityLog: storage.getItem(LOG) };
    }
    function backup(key, snapshot) {
        const text = JSON.stringify(snapshot);
        if (storage.getItem(key) === text) return;
        let target = key;
        for (let index = 1; storage.getItem(target) !== null; index++) {
            if (storage.getItem(target) === text) return;
            target = key + '.' + index;
        }
        storage.setItem(target, text);
    }
    function transaction(fn) {
        if (!locks?.request) throw new Error('Для записи нужен браузер с Web Locks и безопасный адрес (localhost или HTTPS).');
        return locks.request('vocabulary-pro.myWords', fn);
    }
    function write(state) {
        storage.setItem(KEY, JSON.stringify(validate(state)));
        return state;
    }
    function saveLegacy(snapshot) {
        if (snapshot.myWords !== null || snapshot.activityLog !== null) backup(BACKUP, snapshot);
    }
    return {
        read: () => decode(raw(), today()),
        raw,
        start: () => transaction(() => {
            const snapshot = raw();
            const state = decode(snapshot, today());
            if (snapshot.myWords === null || Array.isArray(parse(snapshot.myWords))) {
                saveLegacy(snapshot);
                return write(state);
            }
            return state;
        }),
        update: change => transaction(() => {
            const snapshot = raw();
            const next = change(decode(snapshot, today()));
            if (snapshot.myWords === null || Array.isArray(parse(snapshot.myWords))) saveLegacy(snapshot);
            return write(next);
        }),
        replace: (next, expected) => transaction(() => {
            validate(next);
            const snapshot = raw();
            if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
                throw new Error('Данные изменились в другой вкладке. Повторите восстановление.');
            }
            if (snapshot.myWords !== null || snapshot.activityLog !== null) backup(RECOVERY, snapshot);
            return write(next);
        })
    };
}
