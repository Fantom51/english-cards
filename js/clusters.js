const ENDPOINT = 'http://127.0.0.1:8000/api/cluster';

export function clusterEntries(words) {
    return words.filter(word => word.word.trim()).map(word => ({ id: word.id, text: word.word.trim() }));
}

export async function requestClusters(entries, distanceThreshold, signal, fetcher = fetch) {
    let response;
    try {
        response = await fetcher(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries, distance_threshold: distanceThreshold }),
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error('Сервер кластеризации недоступен. Запустите Uvicorn на порту 8000 и повторите.');
    }
    if (response.status === 422) throw new Error('Проверьте порог и словарь: до 500 слов, до 200 символов на запись.');
    if (response.status === 503) throw new Error('Сервер запущен, но модель недоступна. Проверьте кэш весов.');
    if (!response.ok) throw new Error('Сервер не смог завершить кластеризацию. Попробуйте снова.');
    return response.json();
}

function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}

export function createClusterView(panel) {
    const count = panel.querySelector('#clusterWordCount');
    const form = panel.querySelector('form');
    const button = form.querySelector('button');
    const threshold = form.querySelector('input');
    const status = panel.querySelector('#clusterStatus');
    const progress = panel.querySelector('#clusterProgress');
    const results = panel.querySelector('#clusterResults');
    let words;
    let signature;
    let active;
    let result;

    function render() {
        results.replaceChildren();
        if (!result) return;
        const byId = new Map(words.map(word => [word.id, word]));
        results.append(element('h3', 'Найдено кластеров: ' + result.groups.length));
        result.groups.forEach((ids, index) => appendGroup('Кластер ' + (index + 1), ids));
        appendGroup('Без группы', result.ungrouped);

        function appendGroup(title, ids) {
            const card = element('article', '');
            card.className = 'word-item';
            card.append(element('h4', title + ' · ' + ids.length));
            if (!ids.length) card.append(element('p', 'Нет слов.'));
            else {
                const list = element('ul', '');
                for (const id of ids) {
                    const word = byId.get(id);
                    if (word) list.append(element('li', word.word + ' — ' +
                        word.translations.map(sense => sense.translation).join('; ')));
                }
                card.append(list);
            }
            results.append(card);
        }
    }

    function sync() {
        button.disabled = !words?.length || Boolean(active) || !signature || signature === '[]';
        progress.hidden = !active;
        results.setAttribute('aria-busy', String(Boolean(active)));
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        const operation = new AbortController();
        active = operation;
        const timeout = setTimeout(() => operation.abort(), 90000);
        result = undefined;
        render();
        sync();
        status.textContent = 'Вычисляю кластеры… Первый запуск включает загрузку модели.';
        try {
            const response = await requestClusters(clusterEntries(words), threshold.valueAsNumber, operation.signal);
            if (active !== operation || operation.signal.aborted) return;
            result = response;
            status.textContent = 'Обработано слов: ' + result.processed_count +
                ' · порог: ' + result.parameters.distance_threshold + ' · сервер: ' + result.elapsed_ms + ' мс';
            render();
        } catch (error) {
            if (active === operation) status.textContent = operation.signal.aborted
                ? 'Сервер не ответил за 90 секунд. Попробуйте снова.'
                : error.message;
        } finally {
            clearTimeout(timeout);
            if (active === operation) {
                active = undefined;
                sync();
            }
        }
    });

    return {
        update(nextWords) {
            words = nextWords;
            const entries = clusterEntries(words ?? []);
            const nextSignature = JSON.stringify(entries);
            if (nextSignature !== signature) {
                const previouslyRun = Boolean(active || result);
                active?.abort();
                active = undefined;
                result = undefined;
                signature = nextSignature;
                status.textContent = previouslyRun ? 'Словарь изменился. Запустите кластеризацию снова.' : '';
            }
            count.textContent = words ? 'Слов в личном словаре: ' + words.length : 'Личный словарь недоступен.';
            if (words && !entries.length) status.textContent = 'Добавьте слова в личный словарь, чтобы построить кластеры.';
            sync();
            render();
        }
    };
}
