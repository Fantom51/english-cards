import { createClusterView } from './js/clusters.js';
import { day, editWord, review, senseKey, TAGS, wordKey } from './js/model.js';
import { addsDuplicateSense, categoryCounts, runCardAction, suggestedTags, tagColor } from './js/interface.js';
import { BACKUP, KEY, RECOVERY, makeStore, readExport } from './js/storage.js';

const $ = id => document.getElementById(id);
const clear = node => node.replaceChildren();
const id = () => crypto.randomUUID();
let store;
let state;
let editing;
let session;
let lookup;
const clusterView = createClusterView($('clusters'));

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(text, action, className) {
    const node = element('button', text, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
}

function report(message = '') {
    $('storageStatus').textContent = message;
    $('editStatus').textContent = message;
}

function reportError(error) {
    report(error.message || 'Не удалось выполнить операцию.');
}

async function perform(action) {
    try {
        await action();
    } catch (error) {
        reportError(error);
    }
}

function refresh() {
    clusterView.update(state?.words);
    renderLibrary();
    renderStats();
    $('startClassic').disabled = $('startArchive').disabled = $('startSpelling').disabled = !state;
}

async function mutate(change) {
    if (!store) throw new Error('Хранилище недоступно.');
    state = await store.update(change);
    report();
    refresh();
}

function readState() {
    try {
        state = store.read();
    } catch (error) {
        state = undefined;
        report('Словарь недоступен. Исходные данные сохранены. ' + error.message);
    }
    refresh();
}

function showSection(section) {
    for (const node of document.querySelectorAll('.section')) node.hidden = node.id !== section;
}

function tags(value) {
    const select = element('select');
    select.setAttribute('aria-label', 'Часть речи');
    const options = { ...TAGS };
    if (value && !Object.hasOwn(options, value)) {
        select.append(new Option(value, value));
    }
    for (const [key, label] of Object.entries(options)) select.append(new Option(label, key));
    select.value = value || 'Noun';
    return select;
}

function textInput(label, value = '') {
    const input = element('input');
    input.type = 'text';
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    input.value = value;
    return input;
}

function addSenseRow(container, sense = {}) {
    const row = element('div', null, 'edit-translation-row sense-fields');
    const translation = textInput('Перевод', sense.translation);
    const context = textInput('Пример', sense.context);
    const tag = tags(sense.tag);
    row.append(translation, context, tag, button('Удалить вариант', () => row.remove()));
    row.readSense = () => ({ id: sense.id, translation: translation.value.trim(),
        context: context.value, tag: tag.value });
    container.append(row);
}

function formDraft(isEdit) {
    const fields = isEdit ? $('editTranslationsContainer') : $('translationsContainer');
    return { word: $(isEdit ? 'editWord' : 'wordInput').value.trim(),
        transcription: $(isEdit ? 'editTranscription' : 'transcriptionInput').value,
        translations: Array.from(fields.children, row => row.readSense()).filter(sense => sense.id || sense.translation) };
}

function resetAdd() {
    $('wordInput').value = $('transcriptionInput').value = '';
    clear($('translationsContainer'));
    addSenseRow($('translationsContainer'));
}

function ensureDraft(draft, previous) {
    if (addsDuplicateSense(draft.translations, previous)) {
        throw new Error('В форме есть одинаковые переводы с одной частью речи.');
    }
}

function formFeedback(kind, message) {
    $('addForm').dataset.feedback = kind;
    $('addFeedback').textContent = message;
}

async function addDraft(draft) {
    await mutate(current => {
        const existing = current.words.find(word => wordKey(word.word) === wordKey(draft.word));
        if (existing) {
            const oldKeys = new Set(existing.translations.map(senseKey));
            const additions = draft.translations.filter(sense => !oldKeys.has(senseKey(sense)));
            const transcription = existing.transcription || draft.transcription.trim();
            if (!additions.length && transcription === existing.transcription) {
                formFeedback('error', 'Это слово с данным переводом уже в словаре.');
                throw new Error('Это слово с данным переводом уже в словаре.');
            }
            // Existing entries may contain historical empty fields. Preserve them as stored.
            const newSenses = additions.length ? editWord(null, { ...draft, translations: additions }, day(), id).translations : [];
            Object.assign(existing, { transcription, translations: [...existing.translations, ...newSenses] });
        } else {
            current.words.push(editWord(null, draft, day(), id));
        }
        return current;
    });
}

function openEditor(word) {
    editing = word;
    $('editStatus').textContent = '';
    $('editWord').value = word.word;
    $('editTranscription').value = word.transcription;
    clear($('editTranslationsContainer'));
    for (const sense of word.translations) addSenseRow($('editTranslationsContainer'), sense);
    $('editModal').showModal();
    $('editWord').focus();
}

function unchanged(current, previous) {
    if (JSON.stringify(current) !== JSON.stringify(previous)) {
        throw new Error('Запись изменилась в другой вкладке. Откройте её заново.');
    }
}

async function saveEdit() {
    const original = editing;
    const draft = formDraft(true);
    ensureDraft(draft, original.translations);
    await mutate(current => {
        const index = current.words.findIndex(word => word.id === original.id);
        unchanged(current.words[index], original);
        if (current.words.some(word => word.id !== original.id &&
            wordKey(word.word) === wordKey(draft.word) && wordKey(word.word) !== wordKey(original.word))) {
            throw new Error('Слово с таким написанием уже есть.');
        }
        current.words[index] = editWord(original, draft, day(), id);
        return current;
    });
    $('editModal').close();
}

function deleteWord(word) {
    if (!confirm('Удалить «' + word.word + '» и все его значения?')) return;
    void perform(() => mutate(current => {
        unchanged(current.words.find(entry => entry.id === word.id), word);
        current.words = current.words.filter(entry => entry.id !== word.id);
        return current;
    }));
}

function renderLibrary() {
    const list = $('wordsList');
    clear(list);
    $('wordCount').textContent = state ? 'Всего слов в словаре: ' + state.words.length : '';
    if (!state) return;
    const query = wordKey($('searchInput').value);
    const filter = $('filterSelect').value;
    for (const word of state.words) {
        if (filter !== 'ALL' && !word.translations.some(sense => sense.tag === filter)) continue;
        if (![word.word, word.transcription, ...word.translations.flatMap(sense => [sense.translation, sense.context])]
            .some(text => wordKey(text).includes(query))) continue;
        const item = element('article', null, 'word-item');
        item.style.borderLeftColor = tagColor(word.translations[0].tag);
        item.append(element('h3', word.word + (word.transcription ? ' ' + word.transcription : '')));
        const details = element('details');
        const first = word.translations[0].translation;
        const summary = element('summary');
        const badges = element('span', null, 'category-badges');
        for (const tag of new Set(word.translations.map(sense => sense.tag))) badges.append(tagBadge(tag));
        summary.append(document.createTextNode(first + (word.translations.length > 1 ? ' · +' + (word.translations.length - 1) : '')), badges);
        details.append(summary);
        for (const sense of word.translations) {
            const line = element('p', sense.translation + ' ');
            line.append(tagBadge(sense.tag));
            details.append(line);
            if (sense.context) details.append(element('p', sense.context, 'example'));
        }
        const actions = element('div', null, 'word-actions');
        actions.append(button('Редактировать', () => openEditor(word), 'edit-word-btn'),
            button('Удалить', () => deleteWord(word)));
        item.addEventListener('click', event => {
            if (event.target.closest('.word-actions, details')) return;
            details.open = !details.open;
        });
        item.append(details, actions);
        list.append(item);
    }
    if (!list.childElementCount) {
        list.append(element('p', state.words.length ? 'Ничего не найдено.' : 'Словарь пока пуст.'));
    }
}

function tagBadge(tag) {
    const badge = element('span', Object.hasOwn(TAGS, tag) ? TAGS[tag] : tag, 'category-badge');
    badge.style.setProperty('--category-color', tagColor(tag));
    return badge;
}

function renderStats() {
    const view = $('statsContent');
    clear(view);
    if (!state) return;
    const senses = state.words.flatMap(word => word.translations.map(sense => ({ ...sense, word: word.word })));
    const categories = categoryCounts(senses);
    const chart = element('div', null, 'pie-chart');
    chart.setAttribute('aria-hidden', 'true');
    const legend = element('ul', null, 'stats-legend');
    let start = 0;
    const segments = categories.map(({ tag, count, share, color }) => {
        const end = start + share * 100;
        const segment = color + ' ' + start + '% ' + end + '%';
        start = end;
        const item = element('li', null, 'legend-item');
        const marker = element('span', null, 'color-box');
        marker.style.backgroundColor = color;
        item.append(marker, document.createTextNode((Object.hasOwn(TAGS, tag) ? TAGS[tag] : tag) +
            ': ' + count + ' (' + Math.round(share * 100) + '%)'));
        legend.append(item);
        return segment;
    });
    chart.style.background = segments.length ? 'conic-gradient(' + segments.join(', ') + ')' : '#ddd';
    view.append(element('h3', 'Распределение значений', 'stats-distribution-title'), chart,
        categories.length ? legend : element('p', 'В словаре пока нет значений.', 'stats-distribution-title'));

    view.append(element('h3', 'Активность за 7 дней'));
    const activity = element('div', null, 'stats-activity');
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const logs = state.activity.filter(event => event.date === day(date));
        const ok = logs.filter(event => event.res === 'ok').length;
        const row = element('div', null, 'stats-day');
        const scores = element('span', null, 'stats-scores');
        scores.append(element('span', 'верно ' + ok, 'result-ok'),
            element('span', 'ошибок ' + (logs.length - ok), 'result-bad'));
        row.append(element('span', date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })), scores);
        activity.append(row);
    }
    view.append(activity);
    if (state.activity.some(event => !event.mode)) {
        view.append(element('p', 'Результаты из старой версии включены в активность и могли записываться с ошибками.'));
    }

    const studied = senses.filter(sense => sense.schedule.interval > 0)
        .sort((a, b) => a.schedule.easeFactor - b.schedule.easeFactor);
    const hard = studied.slice(0, 10);
    const easy = studied.slice(-10).reverse();
    const table = element('table', null, 'stats-table');
    const heading = table.createTHead().insertRow();
    for (const label of ['Сложные', 'Лёгкие']) {
        const cell = element('th', label);
        cell.scope = 'col';
        heading.append(cell);
    }
    const body = table.createTBody();
    const label = sense => sense ? sense.word + ' · ' + sense.translation : '—';
    for (let i = 0; i < Math.max(1, hard.length, easy.length); i++) {
        const row = body.insertRow();
        row.insertCell().textContent = label(hard[i]);
        row.insertCell().textContent = label(easy[i]);
    }
    view.append(element('h3', 'Битва слов'), table);
}

function showSession(mode) {
    session = { mode, index: 0, tasks: [], busy: false };
    $('trainingMenu').hidden = $('mainNav').hidden = true;
    $('trainingSession').hidden = false;
    return session;
}

function stopTraining() {
    session = null;
    $('trainingSession').hidden = true;
    $('trainingMenu').hidden = $('mainNav').hidden = false;
    clear($('flashcardsContainer'));
}

function startTraining(mode) {
    if (!state) return;
    const active = showSession(mode);
    const all = state.words.flatMap(word => word.translations.map(sense => ({ word, sense })));
    const due = all.filter(({ sense }) => sense.schedule.nextReviewDate <= day());
    active.tasks = mode === 'Archive' || (mode === 'Spelling' && !due.length) ? all : due;
    for (let i = active.tasks.length - 1; i > 0; i--) {
        const next = Math.floor(Math.random() * (i + 1));
        [active.tasks[i], active.tasks[next]] = [active.tasks[next], active.tasks[i]];
    }
    renderCard(active);
}

async function answer(active, task, card, grade) {
    const isCurrent = () => session === active && active.tasks[active.index] === task && card.isConnected;
    try {
        await runCardAction(active, isCurrent, async () => {
            await mutate(current => {
                if (!isCurrent()) throw new Error('Тренировка завершена.');
                const word = current.words.find(item => item.id === task.word.id);
                const sense = word?.translations.find(item => item.id === task.sense.id);
                if (word?.word !== task.word.word) throw new Error('Слово изменилось. Начните тренировку заново.');
                unchanged(sense, task.sense);
                const now = new Date();
                sense.schedule = review(sense.schedule, grade, now);
                current.activity.push({ date: day(now), res: grade >= 3 ? 'ok' : 'bad',
                    senseId: sense.id, mode: active.mode, grade, at: now.toISOString() });
                return current;
            });
        }, () => animateExit(card, grade >= 3), () => {
            const restoreFocus = card.contains(document.activeElement);
            active.index++;
            renderCard(active);
            if (restoreFocus && active.mode !== 'Spelling') {
                $('flashcardsContainer').querySelector('button')?.focus();
            }
        });
    } finally {
        if (!active.busy) card.style.transform = '';
    }
}

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const degrees = dx => Math.max(-20, Math.min(20, dx * 0.035));
const swipeTransform = dx => 'translateX(' + dx + 'px) rotate(' + degrees(dx) + 'deg)';

async function animateExit(card, right, showResult = true) {
    if (showResult) {
        card.classList.add(right ? 'card-correct' : 'card-incorrect');
        if (!card.querySelector('[role="status"]')) {
            const status = element('p', right ? 'Знаю' : 'На повторение',
                right ? 'result-ok' : 'result-bad');
            status.setAttribute('role', 'status');
            card.append(status);
        }
    }
    if (motion.matches || typeof card.animate !== 'function') {
        if (showResult) await new Promise(resolve => setTimeout(resolve, 240));
        return;
    }
    const distance = Math.max(window.innerWidth, card.offsetWidth) * (right ? 1 : -1);
    const from = card.style.transform || 'none';
    await card.animate([
        { transform: from, opacity: 1 },
        { transform: swipeTransform(distance), opacity: 0 }
    ], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
}

function recentSwipe(card, active, onSwipe) {
    card.classList.add('swipe-card');
    let start;
    let suppressClick = false;
    function reset() {
        start = undefined;
        card.classList.remove('dragging');
        card.style.transform = '';
    }
    card.addEventListener('pointerdown', event => {
        if (active.busy || !event.isPrimary || event.button !== 0 || event.target.closest('button,input')) return;
        suppressClick = false;
        start = { x: event.clientX, y: event.clientY, id: event.pointerId };
        card.setPointerCapture(event.pointerId);
    });
    card.addEventListener('pointermove', event => {
        if (!start || start.id !== event.pointerId || active.busy) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) suppressClick = true;
        if (Math.abs(dx) > Math.abs(dy) && !motion.matches) {
            card.classList.add('dragging');
            card.style.transform = swipeTransform(dx);
        }
    });
    card.addEventListener('pointercancel', reset);
    card.addEventListener('lostpointercapture', () => { if (start) reset(); });
    card.addEventListener('pointerup', event => {
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!active.busy && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) {
            start = undefined;
            suppressClick = true;
            card.classList.remove('dragging');
            onSwipe(dx > 0);
        } else {
            reset();
        }
    });
    card.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        if (event.target.closest('button')) return;
        event.stopImmediatePropagation();
    }, true);
}

function renderCard(active) {
    const view = $('flashcardsContainer');
    clear(view);
    const task = active.tasks[active.index];
    if (!task) {
        view.append(element('h3', active.index ? 'Тренировка завершена!' : 'Нет карточек для тренировки.'));
        return;
    }
    const { word, sense } = task;
    const card = element('div', null, 'card-wrapper');
    view.append(card);
    const record = grade => void perform(() => answer(active, task, card, grade));
    if (active.mode === 'Spelling') {
        const form = element('form');
        const input = textInput('Введите английское слово');
        input.required = true;
        input.autocomplete = 'off';
        input.spellcheck = false;
        const check = element('button', 'Проверить');
        check.type = 'submit';
        form.append(input, check);
        card.append(tagBadge(sense.tag), element('h3', sense.translation), form);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (input.readOnly) return;
            const correct = wordKey(input.value) === wordKey(word.word);
            input.readOnly = true;
            input.classList.add(correct ? 'input-correct' : 'input-incorrect');
            check.hidden = true;
            const result = element('p', correct ? 'Верно!' : 'Правильно: ' + word.word,
                correct ? 'result-ok' : 'result-bad');
            result.setAttribute('role', 'status');
            const next = button('Дальше', () => record(correct ? 5 : 1));
            card.append(result);
            if (sense.context) card.append(element('p', sense.context, 'example'));
            card.append(next);
            next.focus();
        });
        input.focus();
        return;
    }
    card.append(tagBadge(sense.tag), element('h2', word.word),
        element('p', word.transcription), element('p', sense.context, 'example'));
    const translation = element('p', sense.translation);
    translation.hidden = true;
    const reveal = () => { translation.hidden = false; };
    const revealButton = button('Показать перевод', reveal);
    card.append(translation, revealButton,
        button('Повторить', () => record(1)), button('Знаю', () => record(5)));
    card.addEventListener('click', event => { if (!event.target.closest('button')) reveal(); });
    recentSwipe(card, active, right => record(right ? 5 : 1));
}

function preference(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function setPreference(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { reportError(error); }
}

async function startRandomWords() {
    const active = showSession('Random');
    $('flashcardsContainer').textContent = 'Загрузка…';
    try {
        let saved;
        try { saved = JSON.parse(preference('randomWordPool')); } catch { saved = null; }
        const valid = word => typeof word?.word === 'string' && typeof word.translation === 'string';
        active.pool = Array.isArray(saved) ? saved.filter(valid) : [];
        if (!active.pool.length) {
            const response = await fetch('words.json');
            if (!response.ok) throw new Error('Каталог недоступен.');
            active.pool = (await response.json()).filter(valid);
        }
        if (session === active) renderRandom(active);
    } catch (error) {
        if (session === active) $('flashcardsContainer').textContent = 'Не удалось загрузить каталог: ' + error.message;
    }
}

function renderRandom(active) {
    const view = $('flashcardsContainer');
    clear(view);
    const owned = new Set(state?.words.map(word => wordKey(word.word)));
    active.pool = active.pool.filter(word => !owned.has(wordKey(word.word)));
    if (!active.pool.length) {
        view.append(element('h3', 'Пул слов пуст!'));
        return;
    }
    const index = Math.floor(Math.random() * active.pool.length);
    const candidate = active.pool[index];
    const card = element('div', null, 'card-wrapper');
    const translation = element('p', candidate.translation);
    translation.hidden = true;
    const reveal = () => { translation.hidden = !translation.hidden; };
    const advance = save => void perform(async () => {
        const isCurrent = () => session === active && card.isConnected;
        try {
            await runCardAction(active, isCurrent, async () => {
                if (save) await mutate(current => {
                    if (!isCurrent()) throw new Error('Сессия завершена.');
                    if (!current.words.some(word => wordKey(word.word) === wordKey(candidate.word))) {
                        current.words.push(editWord(null, { word: candidate.word, transcription: candidate.transcription || '',
                            translations: [{ translation: candidate.translation, context: candidate.context || '',
                                tag: candidate.tag || 'Phrase' }] }, day(), id));
                    }
                    return current;
                });
                active.pool.splice(index, 1);
                setPreference('randomWordPool', JSON.stringify(active.pool));
            }, () => animateExit(card, save, false), () => {
                const restoreFocus = card.contains(document.activeElement);
                renderRandom(active);
                if (restoreFocus) view.querySelector('button')?.focus();
            });
        } finally {
            if (!active.busy) card.style.transform = '';
        }
    });
    card.append(element('h2', candidate.word), element('p', candidate.transcription),
        element('p', candidate.context, 'example'), translation, button('Показать перевод', reveal),
        button('Пропустить', () => advance(false)), button('Добавить в словарь', () => advance(true)));
    card.addEventListener('click', event => { if (!event.target.closest('button')) reveal(); });
    recentSwipe(card, active, advance);
    view.append(card);
}

async function fetchWordData() {
    const word = $('wordInput').value.trim();
    const baseRow = $('translationsContainer').firstElementChild;
    if (!word || !baseRow) return;
    lookup?.abort();
    const request = new AbortController();
    lookup = request;
    const select = baseRow.querySelector('select');

    try {
        const response = await fetch('https://api.datamuse.com/words?md=p&sp=' +
            encodeURIComponent(word), { signal: request.signal });
        if (!response.ok) throw new Error('Словарь Datamuse недоступен.');
        const data = await response.json();
        const match = data.find(item => wordKey(item.word) === wordKey(word));
        if (lookup !== request || $('wordInput').value.trim() !== word || !baseRow.isConnected ||
            $('translationsContainer').firstElementChild !== baseRow) return;
        const suggestions = suggestedTags(match?.tags);
        const selected = select.value;
        select.querySelector('optgroup')?.remove();
        if (suggestions.length) {
            const group = element('optgroup');
            group.label = 'Подсказки Datamuse';
            for (const tag of suggestions) group.append(new Option(TAGS[tag], tag));
            select.prepend(group);
        }
        select.value = selected;
        formFeedback('info', suggestions.length
            ? 'В списке частей речи появились подсказки Datamuse.'
            : 'Datamuse не предложил часть речи для этого слова.');
    } catch (error) {
        if (error.name !== 'AbortError') reportError(error);
    }
}

function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = element('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData() {
    download('vocabulary-pro.json', JSON.stringify(store.read(), null, 2));
}

function exportRaw() {
    download('vocabulary-pro-recovery.json', JSON.stringify({
        ...store.raw(),
        backups: Object.fromEntries(Object.keys(localStorage)
            .filter(key => [BACKUP, RECOVERY].some(prefix => key === prefix || key.startsWith(prefix + '.')))
            .map(key => [key, localStorage.getItem(key)]))
    }, null, 2));
}

async function importFile(file) {
    const snapshot = store.raw();
    const next = readExport(await file.text());
    if (!confirm('Заменить текущий словарь и журнал? В файле слов: ' + next.words.length +
        '. Перед заменой браузер сохранит исходные данные.')) return;
    state = await store.replace(next, snapshot);
    stopTraining();
    $('editModal').close();
    refresh();
    report('Словарь восстановлен из файла.');
}

function wire() {
    for (const node of document.querySelectorAll('[data-section]')) {
        node.addEventListener('click', () => showSection(node.dataset.section));
    }
    for (const [name, action] of Object.entries({
        startClassic: () => startTraining('Classic'), startArchive: () => startTraining('Archive'),
        startSpelling: () => startTraining('Spelling'), startRandom: startRandomWords, stopTraining,
        addSense: () => addSenseRow($('translationsContainer')),
        editSense: () => addSenseRow($('editTranslationsContainer')),
        cancelEdit: () => $('editModal').close(), lookup: fetchWordData,
        exportData, exportRaw, importData: () => $('importFile').click()
    })) $(name).addEventListener('click', () => void perform(action));
    $('addForm').addEventListener('submit', event => {
        event.preventDefault();
        void perform(async () => {
            const draft = formDraft(false);
            try {
                ensureDraft(draft);
            } catch (error) {
                formFeedback('error', error.message);
                return;
            }
            await addDraft(draft);
            resetAdd();
            formFeedback('success', 'Словарь обновлён.');
        });
    });
    $('editForm').addEventListener('submit', event => {
        event.preventDefault();
        void perform(saveEdit);
    });
    $('importFile').addEventListener('change', event => {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) void perform(() => importFile(file));
    });
    $('searchInput').addEventListener('input', renderLibrary);
    $('filterSelect').addEventListener('change', renderLibrary);
    function updateThemeLabel() {
        theme.textContent = document.body.classList.contains('dark-theme') ? 'Светлая тема' : 'Тёмная тема';
    }
    const theme = button('', () => {
        const dark = document.body.classList.toggle('dark-theme');
        setPreference('theme', dark ? 'dark' : 'light');
        updateThemeLabel();
    }, 'theme-toggle-btn');
    document.body.classList.toggle('dark-theme', preference('theme') === 'dark');
    updateThemeLabel();
    document.body.append(theme);
    for (const [key, label] of Object.entries(TAGS)) $('filterSelect').append(new Option(label, key));
    resetAdd();
}

wire();
void perform(async () => {
    store = makeStore(window.localStorage, navigator.locks);
    try {
        state = await store.start();
    } catch (error) {
        readState();
        if (state) reportError(error);
    }
    refresh();
    window.addEventListener('storage', event => {
        if (event.key === KEY || event.key === null) readState();
    });
});
