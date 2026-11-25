import { senseKey } from './model.js';

const COLORS = new Map(Object.entries({
    Noun: '#4a90e2', Verb: '#e74c3c', Adjective: '#27ae60', Adverb: '#f39c12',
    Preposition: '#9b59b6', Conjunction: '#16a085', Interjection: '#e67e22', Phrase: '#34495e'
}));

export const tagColor = tag => COLORS.get(tag) ?? '#7f8c8d';

export function categoryCounts(senses) {
    const counts = new Map();
    for (const { tag } of senses) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return Array.from(counts, ([tag, count]) => ({ tag, count, share: count / senses.length, color: tagColor(tag) }));
}

export function addsDuplicateSense(translations, previous = []) {
    const existing = new Map(previous.map(sense => [sense.id, senseKey(sense)]));
    const groups = new Map();
    for (const sense of translations) {
        const key = senseKey(sense);
        const group = groups.get(key) ?? [];
        group.push(sense);
        groups.set(key, group);
    }
    return Array.from(groups).some(([key, group]) => group.length > 1 &&
        group.some(sense => existing.get(sense.id) !== key));
}

export function suggestedTags(tags) {
    const mapping = new Map(Object.entries({ n: 'Noun', v: 'Verb', adj: 'Adjective', adv: 'Adverb',
        prep: 'Preposition', conj: 'Conjunction', intj: 'Interjection', u: 'Phrase' }));
    return [...new Set((Array.isArray(tags) ? tags : []).map(tag => mapping.get(tag)).filter(Boolean))];
}

export async function runCardAction(active, isCurrent, commit, animate, advance) {
    if (active.busy || !isCurrent()) return;
    active.busy = true;
    try {
        await commit();
        if (!isCurrent()) return;
        await animate();
        if (isCurrent()) advance();
    } finally {
        active.busy = false;
    }
}
