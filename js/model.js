export const VERSION = 1;
export const TAGS = {
    Noun: 'Существительное', Verb: 'Глагол', Adjective: 'Прилагательное',
    Adverb: 'Наречие', Preposition: 'Предлог', Conjunction: 'Союз',
    Interjection: 'Междометие', Phrase: 'Фраза'
};

export function day(date = new Date()) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';
const id = value => string(value) && value.trim() !== '';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const ease = value => Number.isFinite(value) && value >= 1.3;
const date = value => string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fields = { interval: integer, repetition: integer, easeFactor: ease, nextReviewDate: date };
export const empty = () => ({ version: VERSION, words: [], activity: [] });
export const initial = today => ({ interval: 0, repetition: 0, easeFactor: 2.5, nextReviewDate: today });
export const wordKey = word => word.trim().normalize('NFC').toLowerCase();
export const senseKey = sense => JSON.stringify([wordKey(sense.translation), sense.tag]);

function requireData(condition) {
    if (!condition) throw new Error('Неверная структура словаря или журнала.');
}

export function validate(state) {
    requireData(object(state) && state.version === VERSION && Array.isArray(state.words) &&
        Array.isArray(state.activity));
    const ids = new Set();
    function unique(value) {
        requireData(id(value) && !ids.has(value));
        ids.add(value);
    }
    for (const word of state.words) {
        requireData(object(word) && string(word.word) && string(word.transcription) &&
            Array.isArray(word.translations) && word.translations.length > 0);
        unique(word.id);
        for (const sense of word.translations) {
            requireData(object(sense) && string(sense.translation) && string(sense.context) &&
                id(sense.tag) && object(sense.schedule) &&
                Object.entries(fields).every(([key, valid]) => valid(sense.schedule[key])));
            unique(sense.id);
        }
    }
    validateActivity(state.activity);
    return state;
}

function validateActivity(activity) {
    requireData(Array.isArray(activity) && activity.every(event =>
        object(event) && date(event.date) && ['ok', 'bad'].includes(event.res)));
}

export function migrate(words, activity, today) {
    requireData(Array.isArray(words));
    validateActivity(activity);
    const reserved = new Set(words.map(word => object(word) && String(word.id ?? '')).filter(Boolean));
    const used = new Set();
    function allocate(preferred, fallback) {
        if (id(preferred) && !used.has(preferred)) {
            used.add(preferred);
            return preferred;
        }
        let result = fallback;
        for (let suffix = 1; used.has(result) || reserved.has(result); suffix++) {
            result = fallback + '-' + suffix;
        }
        used.add(result);
        return result;
    }
    const result = words.map((word, index) => {
        requireData(object(word) && string(word.word ?? word.text) &&
            (word.transcription == null || string(word.transcription)));
        requireData(word.translations == null || Array.isArray(word.translations));
        const wordId = allocate(String(word.id ?? ''), 'legacy-word-' + index);
        const translations = word.translations?.length ? word.translations : [word];
        return {
            id: wordId, word: word.word ?? word.text, transcription: word.transcription ?? '',
            translations: translations.map((sense, position) => {
                requireData(object(sense) && string(sense.translation) &&
                    (sense.context == null || string(sense.context)) &&
                    (sense.tag == null || string(sense.tag)));
                const sameFirst = position === 0 && sense.translation === word.translation &&
                    (sense.tag || 'Phrase') === (word.tag || 'Phrase');
                const schedule = initial(today);
                for (const [key, valid] of Object.entries(fields)) {
                    if (valid(sense[key])) schedule[key] = sense[key];
                    else if (sameFirst && valid(word[key])) schedule[key] = word[key];
                }
                return { id: allocate('', 'legacy-sense-' + index + '-' + position),
                    translation: sense.translation, context: sense.context ?? '',
                    tag: sense.tag || 'Phrase', schedule };
            })
        };
    });
    return validate({ version: VERSION, words: result, activity });
}

export function editWord(existing, draft, today, newId) {
    const previous = new Map(existing?.translations.map(sense => [sense.id, sense]));
    if ((!draft.word.trim() && existing?.word !== '') || draft.translations.length === 0 ||
        draft.translations.some(sense => !sense.translation.trim() && previous.get(sense.id)?.translation !== '')) {
        throw new Error('Укажите слово и заполните переводы.');
    }
    return {
        id: existing?.id ?? newId(), word: draft.word.trim(), transcription: draft.transcription.trim(),
        translations: draft.translations.map(({ id, translation, context, tag }) => {
            const old = previous.get(id);
            return { id: old?.id ?? newId(), translation: translation.trim(), context: context.trim(),
                tag, schedule: old?.schedule ?? initial(today) };
        })
    };
}

export function review(schedule, grade, now = new Date()) {
    const success = grade >= 3;
    const { repetition, easeFactor } = schedule;
    const interval = success && repetition > 0
        ? repetition === 1 ? 6 : Math.max(1, Math.round(schedule.interval * easeFactor))
        : 1;
    const next = new Date(now);
    next.setDate(next.getDate() + interval);
    if (!date(day(next))) throw new Error('Интервал выходит за диапазон календаря.');
    return { interval, repetition: success ? repetition + 1 : 0,
        easeFactor: Math.max(1.3, easeFactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
        nextReviewDate: day(next) };
}
