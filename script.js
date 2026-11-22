let vocabulary = JSON.parse(localStorage.getItem('myWords')) || [];
let activityLog = JSON.parse(localStorage.getItem('activityLog')) || [];
let currentTag = 'All', archiveIndex = 0, currentSessionWords = [];
let currentApiResponse = null;
let currentSearchQuery = '';
let currentFilterTag = 'ALL';
let isSpellingMode = false;
let randomSessionWord = null; 
let randomWordPool = []; 
let currentEditId = null;
let translationBlocksCount = 1;

const TAG_COLORS = {
    'Noun': '#4a90e2',
    'Verb': '#e74c3c',
    'Adjective': '#27ae60',
    'Adverb': '#f39c12',
    'Preposition': '#9b59b6',
    'Conjunction': '#16a085',
    'Interjection': '#e67e22',
    'Phrase': '#34495e'
};

async function initRandomWordsMode() {
    const savedPool = localStorage.getItem('randomWordPool');
    if (savedPool) {
        try {
            randomWordPool = JSON.parse(savedPool);
        } catch (e) {
            randomWordPool = [];
        }
    }

    if (!savedPool || randomWordPool.length === 0) {
        try {
            const response = await fetch('words.json');
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const allWords = await response.json();

            const currentLib = typeof vocabulary !== 'undefined' ? vocabulary : JSON.parse(localStorage.getItem('myWords') || '[]');
            const libraryWords = currentLib.map(w => w.word.toLowerCase());
            randomWordPool = allWords.filter(w => !libraryWords.includes(w.word.toLowerCase()));
            
            localStorage.setItem('randomWordPool', JSON.stringify(randomWordPool));
        } catch (e) {
            randomWordPool = [];
        }
    }

    renderRandomCard();
}

document.addEventListener('DOMContentLoaded', () => {
    const wordInput = document.getElementById('wordInput');
    if (wordInput) {
        wordInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                fetchWordData();
            }
        });
    }

    if (!document.getElementById('themeToggleBtn')) {
        const btn = document.createElement('button');
        btn.id = 'themeToggleBtn';
        btn.className = 'theme-toggle-btn';
        btn.onclick = toggleTheme;
        document.body.appendChild(btn);
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    updateThemeButtonText();
});

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    if (id === 'library') renderLibrary();
    if (id === 'stats') renderStats();
}

function startTraining(tag) {
    currentTag = tag; 
    archiveIndex = 0;
    isSpellingMode = (tag === 'Spelling');
    
    const today = new Date().toISOString().split('T')[0];
    
    let rawTasks = [];
    
    vocabulary.forEach(wordObj => {
        const transList = wordObj.translations || [{
            translation: wordObj.translation || 'Перевод отсутствует',
            context: wordObj.context || '',
            tag: wordObj.tag || 'Phrase',
            interval: wordObj.interval || 0,
            repetition: wordObj.repetition || 0,
            easeFactor: wordObj.easeFactor || 2.5,
            nextReviewDate: wordObj.nextReviewDate || today
        }];

        transList.forEach((tr, index) => {
            const taskItem = {
                wordId: wordObj.id,
                word: wordObj.word || wordObj.text,
                transcription: wordObj.transcription || '',
                translationIndex: index,
                translation: tr.translation,
                context: tr.context,
                tag: tr.tag || 'Phrase',
                interval: tr.interval,
                repetition: tr.repetition,
                easeFactor: tr.easeFactor,
                nextReviewDate: tr.nextReviewDate
            };

            if (tag === 'Archive') {
                rawTasks.push(taskItem);
            } else if (tag === 'Classic' || tag === 'All') {
                if (tr.nextReviewDate <= today) rawTasks.push(taskItem);
            } else if (tag === 'Spelling') {
                if (tr.nextReviewDate <= today) rawTasks.push(taskItem);
            } else {
                if (tr.nextReviewDate <= today && (tr.tag === tag || wordObj.tag === tag)) {
                    rawTasks.push(taskItem);
                }
            }
        });
    });

    if (tag === 'Spelling' && rawTasks.length === 0) {
        vocabulary.forEach(wordObj => {
            const transList = wordObj.translations || [{
                translation: wordObj.translation || 'Перевод отсутствует',
                context: wordObj.context || '',
                tag: wordObj.tag || 'Phrase',
                interval: wordObj.interval || 0,
                repetition: wordObj.repetition || 0,
                easeFactor: wordObj.easeFactor || 2.5,
                nextReviewDate: wordObj.nextReviewDate || today
            }];

            transList.forEach((tr, index) => {
                rawTasks.push({
                    wordId: wordObj.id,
                    word: wordObj.word || wordObj.text,
                    transcription: wordObj.transcription || '',
                    translationIndex: index,
                    translation: tr.translation,
                    context: tr.context,
                    tag: tr.tag || 'Phrase',
                    interval: tr.interval,
                    repetition: tr.repetition,
                    easeFactor: tr.easeFactor,
                    nextReviewDate: tr.nextReviewDate
                });
            });
        });
    }

    currentSessionWords = [...rawTasks].sort(() => Math.random() - 0.5);
    document.getElementById('trainingMenu').style.display = 'none';
    document.getElementById('trainingSession').style.display = 'block';
    document.getElementById('mainNav').style.display = 'none';
    
    if (isSpellingMode) {
        renderSpellingCard();
    } else {
        renderCard();
    }
}

function startRandomWords() {
    document.getElementById('trainingMenu').style.display = 'none';
    document.getElementById('trainingSession').style.display = 'block';
    document.getElementById('mainNav').style.display = 'none';
    
    // Запускаем генерацию твоих Tinder-карточек
    initRandomWordsMode();
}

function renderRandomCard() {
    const container = document.getElementById('flashcardsContainer');
    if (!container) return;

    if (randomWordPool.length === 0) {
        container.innerHTML = '<h3 style="text-align:center;">Пул слов пуст!</h3>';
        return;
    }

    const randomIndex = Math.floor(Math.random() * randomWordPool.length);
    randomSessionWord = randomWordPool[randomIndex];
    randomSessionWord._poolIndex = randomIndex;

    container.innerHTML = `
        <div class="card-wrapper" id="currentRandomCard" style="padding:25px; border:1px solid #ddd; border-radius:12px; background:white; text-align:center; box-sizing: border-box; width: 100%; cursor: pointer; user-select: none; box-shadow: 0 4px 12px rgba(0,0,0,0.05); touch-action: none;">
            <h1 style="margin-bottom:8px; font-size: 2em;">${randomSessionWord.word}</h1>
            ${randomSessionWord.transcription ? `<p style="color:#666; font-size:1.2em; margin:5px 0;">[${randomSessionWord.transcription}]</p>` : ''}
            ${randomSessionWord.context ? `<p style="color:#555; font-style:italic; margin:12px 0;">${randomSessionWord.context}</p>` : ''}
            <p id="randomTranslation" style="margin-top:20px; font-size:1.3em; font-weight:bold; color:#2c3e50; display:none;">${randomSessionWord.translation || ''}</p>
        </div>`;

    let card = document.getElementById('currentRandomCard');
    let startX = 0, isDragging = false, hasMoved = false;

    card.onpointerdown = (e) => {
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
    };

    window.onpointermove = (e) => {
        if (!isDragging) return;
        if (Math.abs(e.clientX - startX) > 5) {
            hasMoved = true;
        }
        card.style.transform = `translateX(${e.clientX - startX}px) rotate(${(e.clientX - startX) * 0.03}deg)`;
    };

    window.onpointerup = (e) => {
        if (!isDragging) return;
        isDragging = false;

        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 100) {
            if (deltaX > 0) {
                saveRandomWordAutomatically(); // Свайп вправо — сохранить в словарь
            } else {
                skipRandomWord(); // Свайп влево — пропустить
            }
        } else {
            card.style.transform = 'translateX(0) rotate(0deg)';
            if (!hasMoved) {
                const translationEl = document.getElementById('randomTranslation');
                if (translationEl) {
                    translationEl.style.display = translationEl.style.display === 'none' ? 'block' : 'none';
                }
            }
        }
    };
}

function skipRandomWord() {
    if (!randomSessionWord) return;
    if (typeof randomSessionWord._poolIndex === 'number') {
        randomWordPool.splice(randomSessionWord._poolIndex, 1);
        localStorage.setItem('randomWordPool', JSON.stringify(randomWordPool));
    }
    renderRandomCard();
}


function saveRandomWordAutomatically() {
    if (!randomSessionWord) return;

    if (typeof vocabulary === 'undefined') {
        window.vocabulary = JSON.parse(localStorage.getItem('myWords') || '[]');
    }

    const exists = vocabulary.some(w => w.word.toLowerCase() === randomSessionWord.word.toLowerCase());
    if (!exists) {
        vocabulary.push({
            id: Date.now().toString(),
            word: randomSessionWord.word,
            translation: randomSessionWord.translation || '',
            transcription: randomSessionWord.transcription || '',
            context: randomSessionWord.context || '',
            tag: randomSessionWord.tag || 'Phrase',
            interval: 0,
            repetition: 0,
            easeFactor: 2.5,
            nextReviewDate: new Date().toISOString().split('T')[0]
        });

        localStorage.setItem('myWords', JSON.stringify(vocabulary));
        if (typeof renderLibrary === 'function') renderLibrary();
    }

    skipRandomWord();
}

function showTranslationInput(knewIt) {
    const container = document.getElementById('flashcardsContainer');
    
    container.innerHTML = `
        <div class="card-wrapper" style="padding:20px; border:1px solid #4a90e2; border-radius:10px; background:#f9f9f9; text-align:center; box-sizing: border-box; width: 100%;">
            <h2>${randomSessionWord.word}</h2>
            <p style="color:#555;">[${randomSessionWord.transcription || ''}]</p>
            <p>Результат: <b>${knewIt ? 'Знаю' : 'Не знаю'}</b></p>
            
            <div style="margin-top:20px;">
                <input type="text" id="manualTranslationInput" placeholder="Введите перевод на русский..." style="padding:10px; width:100%; box-sizing: border-box; font-size:1em; border:1px solid #ccc; border-radius:5px; margin-bottom:10px;">
                <br>
                <button onclick="saveRandomWordToVocabulary()" style="padding:10px 20px; width: 100%; box-sizing: border-box; background:#4a90e2; color:white; border:none; border-radius:5px; cursor:pointer; font-size:1em;">Сохранить в словарь</button>
            </div>
        </div>`;
    
    setTimeout(() => {
        const input = document.getElementById('manualTranslationInput');
        if (input) {
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveRandomWordToVocabulary();
            });
        }
    }, 100);
}

function saveRandomWordToVocabulary() {
    const translation = document.getElementById('manualTranslationInput').value.trim();
    if (!translation) {
        alert('Пожалуйста, введите перевод!');
        return;
    }

    vocabulary.push({ 
        id: Date.now().toString(), 
        word: randomSessionWord.word, 
        translation: translation, 
        transcription: randomSessionWord.transcription || '', 
        context: randomSessionWord.context || '', 
        tag: 'Phrase', 
        interval: 0, 
        repetition: 0, 
        easeFactor: 2.5, 
        nextReviewDate: new Date().toISOString().split('T')[0] 
    });

    localStorage.setItem('myWords', JSON.stringify(vocabulary));
    renderRandomCard();
}

async function fetchWordData() {
    const wordInput = document.getElementById('wordInput');
    if (!wordInput) return;
    const word = wordInput.value.trim().toLowerCase(); 
    if (!word) { alert('Введите слово!'); return; }

    try {
        const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=dp`);
        if (!res.ok) throw new Error('Словарь недоступен');
        
        const data = await res.json();
        const match = data.find(item => item.word.toLowerCase() === word) || data[0];
        
        if (!match) {
            alert('Слово не найдено. Заполните поля вручную.');
            return;
        }

        const datamuseTagMap = { 
            'n': 'noun', 'v': 'verb', 'adj': 'adjective', 'adv': 'adverb', 
            'prep': 'preposition', 'conj': 'conjunction', 'intj': 'interjection', 'u': 'phrase'
        };

        const extractedMeanings = (match.tags || [])
            .filter(tag => datamuseTagMap[tag])
            .map(tag => ({
                partOfSpeech: datamuseTagMap[tag],
                definitions: []
            }));

        if (extractedMeanings.length === 0) {
            extractedMeanings.push({ partOfSpeech: 'phrase', definitions: [] });
        }

        currentApiResponse = { meanings: extractedMeanings };
        
        document.getElementById('transcriptionInput').value = ''; 
        document.getElementById('transInput').value = '';
        document.getElementById('contextInput').value = ''; 
        
        updateTagSelect(currentApiResponse.meanings);

    } catch (err) {
        console.error('Ошибка:', err);
        alert('Не удалось связаться со словарем. Заполните поля вручную.');
    }
}

function updateTagSelect(meanings) {
    const tagSelect = document.getElementById('tagInput');
    if (!tagSelect) return;
    
    tagSelect.innerHTML = ''; 

    const availableParts = [...new Set(meanings.map(m => m.partOfSpeech))];

    const tagMap = { 
        'noun': 'Noun', 
        'verb': 'Verb', 
        'adjective': 'Adjective', 
        'adverb': 'Adverb', 
        'preposition': 'Preposition',
        'conjunction': 'Conjunction',
        'interjection': 'Interjection',
        'pronoun': 'Noun'
    };

    const ruNames = {
        'Noun': 'Существительное',
        'Verb': 'Глагол',
        'Adjective': 'Прилагательное',
        'Adverb': 'Наречие',
        'Preposition': 'Предлог',
        'Conjunction': 'Союз',
        'Interjection': 'Междометие',
        'Phrase': 'Фраза'
    };

    availableParts.forEach(part => {
        const mappedTag = tagMap[part.toLowerCase()] || 'Phrase'; 
        if (![...tagSelect.options].some(opt => opt.value === mappedTag)) {
            const option = document.createElement('option');
            option.value = mappedTag; 
            option.textContent = ruNames[mappedTag] || mappedTag;
            tagSelect.appendChild(option);
        }
    });

    tagSelect.onchange = onTagChange;

    onTagChange();
}

function onTagChange() {
    if (!currentApiResponse || !currentApiResponse.meanings) return;

    const tagSelect = document.getElementById('tagInput');
    if (!tagSelect) return;
    
    const selectedTagUI = tagSelect.value;
    
    const tagMapReverse = { 
        'Noun': ['noun', 'pronoun'], 
        'Verb': ['verb'], 
        'Adjective': ['adjective'], 
        'Adverb': ['adverb'], 
        'Preposition': ['preposition'],
        'Conjunction': ['conjunction'],
        'Interjection': ['interjection', 'exclamation'],
        'Phrase': ['phrase', 'idiom']
    };

    const allowedApiParts = tagMapReverse[selectedTagUI] || [];

    const targetMeaning = currentApiResponse.meanings.find(m => {
        return allowedApiParts.includes(m.partOfSpeech.toLowerCase());
    });

    let example = '';
    if (targetMeaning && targetMeaning.definitions) {
        const defWithExample = targetMeaning.definitions.find(d => d.example);
        if (defWithExample) {
            example = defWithExample.example;
        }
    }

    document.getElementById('contextInput').value = example || '';
}

function addNewWord() {
    const wordInput = document.getElementById('wordInput');
    const transcriptionInput = document.getElementById('transcriptionInput');
    const container = document.getElementById('translationsContainer');
    
    const word = wordInput ? wordInput.value.trim() : '';
    const transcription = transcriptionInput ? transcriptionInput.value.trim() : '';

    if (!word) {
        alert('Введите слово!');
        return;
    }

    const translations = [];

    const primaryTrans = document.getElementById('transInput');
    const primaryContext = document.getElementById('contextInput');
    const primaryTag = document.getElementById('tagInput');

    if (primaryTrans && primaryTrans.value.trim()) {
        translations.push({
            translation: primaryTrans.value.trim(),
            context: primaryContext ? primaryContext.value.trim() : '',
            tag: primaryTag ? primaryTag.value : 'Phrase'
        });
    }

    const extraBlocks = document.querySelectorAll('.translation-block');
    extraBlocks.forEach(block => {
        const transField = block.querySelector('.transInput');
        const contextField = block.querySelector('.contextInput');
        const tagField = block.querySelector('.tagInput');

        const transVal = transField ? transField.value.trim() : '';
        if (transVal) {
            translations.push({
                translation: transVal,
                context: contextField ? contextField.value.trim() : '',
                tag: tagField ? tagField.value : 'Phrase'
            });
        }
    });

    if (translations.length === 0) {
        alert('Добавьте хотя бы один перевод!');
        return;
    }

    const flashInputs = (color) => {
        const elementsToFlash = document.querySelectorAll('#wordInput, .transInput, #transInput');
        elementsToFlash.forEach(el => {
            if (el) {
                el.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
                el.style.borderColor = color;
                el.style.boxShadow = `0 0 8px ${color}`;
            }
        });
        setTimeout(() => {
            elementsToFlash.forEach(el => {
                if (el) {
                    el.style.borderColor = '';
                    el.style.boxShadow = '';
                }
            });
        }, 1500);
    };

    const existingWordIndex = vocabulary.findIndex(w => w.word.toLowerCase() === word.toLowerCase());

    if (existingWordIndex !== -1) {
        const existingItem = vocabulary[existingWordIndex];
        
        if (!existingItem.translations) {
            existingItem.translations = [{
                translation: existingItem.translation,
                context: existingItem.context || '',
                tag: existingItem.tag || 'Phrase'
            }];
        }

        let addedCount = 0;
        translations.forEach(newTr => {
            const isDuplicateTranslation = existingItem.translations.some(
                t => t.translation.toLowerCase() === newTr.translation.toLowerCase() && t.tag === newTr.tag
            );
            if (!isDuplicateTranslation) {
                existingItem.translations.push(newTr);
                addedCount++;
            }
        });

        if (transcription && !existingItem.transcription) {
            existingItem.transcription = transcription;
        }

        if (addedCount > 0) {
            localStorage.setItem('myWords', JSON.stringify(vocabulary));
            flashInputs('#27ae60'); // Зеленый при успешном добавлении нового значения
        } else {
            flashInputs('#e74c3c'); // Красный, если такой перевод уже есть
            return;
        }
    } else {
        const mainTag = translations[0].tag;
        vocabulary.push({ 
            id: Date.now().toString(), 
            word, 
            translation: translations[0].translation, 
            context: translations[0].context, 
            tag: mainTag,
            translations: translations,
            transcription, 
            interval: 0, 
            repetition: 0, 
            easeFactor: 2.5, 
            nextReviewDate: new Date().toISOString().split('T')[0] 
        });

        localStorage.setItem('myWords', JSON.stringify(vocabulary));
        flashInputs('#27ae60'); // Зеленый при создании нового слова
    }
    
    if (wordInput) wordInput.value = '';
    if (primaryTrans) primaryTrans.value = '';
    if (primaryContext) primaryContext.value = '';
    if (transcriptionInput) transcriptionInput.value = '';
    
    if (container) {
        container.innerHTML = `
            <div class="primary-translation-block">
                <input type="text" id="transInput" class="transInput" placeholder="Перевод (на русский)..." style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px; margin-bottom:8px;">
                <input type="text" id="contextInput" class="contextInput" placeholder="Пример использования в предложении..." style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px; margin-bottom:8px;">
                <select id="tagInput" class="tagInput" style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px;">
                    <option value="Noun">Существительное</option>
                    <option value="Verb">Глагол</option>
                    <option value="Adjective">Прилагательное</option>
                    <option value="Adverb">Наречие</option>
                    <option value="Preposition">Предлог</option>
                    <option value="Conjunction">Союз</option>
                    <option value="Interjection">Междометие</option>
                    <option value="Phrase">Фраза</option>
                </select>
            </div>
        `;
    }
    
    currentApiResponse = null;
    renderLibrary();
}

function addTranslationBlock() {
    translationBlocksCount++;
    const container = document.getElementById('translationsContainer');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'translation-block';
    block.style.cssText = 'margin-top:15px; padding-top:15px; border-top:1px dashed #ddd; position:relative;';
    block.innerHTML = `
        <input type="text" class="transInput" placeholder="Перевод (на русский)..." style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px; margin-bottom:8px;">
        <input type="text" class="contextInput" placeholder="Пример использования в предложении..." style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px; margin-bottom:8px;">
        <select class="tagInput" style="padding:10px; width:100%; box-sizing:border-box; font-size:1em; border:1px solid #ccc; border-radius:5px;">
            <option value="Noun">Существительное</option>
            <option value="Verb">Глагол</option>
            <option value="Adjective">Прилагательное</option>
            <option value="Adverb">Наречие</option>
            <option value="Preposition">Предлог</option>
            <option value="Conjunction">Союз</option>
            <option value="Interjection">Междометие</option>
            <option value="Phrase">Фраза</option>
        </select>
        <button type="button" onclick="this.parentElement.remove()" style="margin-top:8px; padding:4px 8px; background:#ffebee; color:#c62828; border:none; border-radius:4px; cursor:pointer; font-size:0.85em;">Удалить этот вариант</button>
    `;
    container.appendChild(block);
}

function deleteWord(id) {
    vocabulary = vocabulary.filter(w => String(w.id) !== String(id)); 
    
    localStorage.setItem('myWords', JSON.stringify(vocabulary)); 
    renderLibrary();
    if (typeof renderStats === 'function') renderStats();
}

function renderLibrary() {
    const container = document.getElementById('wordsList');
    const countContainer = document.getElementById('wordCount');
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    
    if (!container) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedTag = filterSelect ? filterSelect.value : 'ALL';

    const filteredWords = vocabulary.filter(item => {
        const query = searchQuery.toLowerCase();
        
        const matchesWord = item.word.toLowerCase().includes(query) || 
                            (item.transcription && item.transcription.toLowerCase().includes(query));
        
        const matchesTranslations = item.translations && item.translations.some(t => 
            (t.translation && t.translation.toLowerCase().includes(query)) || 
            (t.context && t.context.toLowerCase().includes(query))
        );

        const matchesSearch = matchesWord || matchesTranslations || item.translation.toLowerCase().includes(query);
        
        const wordTags = item.translations ? item.translations.map(t => t.tag) : [item.tag];
        const matchesTag = selectedTag === 'ALL' || wordTags.includes(selectedTag);

        return matchesSearch && matchesTag;
    });

    if (countContainer) {
        countContainer.textContent = `Всего слов в словаре: ${vocabulary.length}`;
    }

    if (vocabulary.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#777; margin-top:20px;">Твой словарь пока пуст. Добавь первые слова через форму выше!</p>`;
        return;
    }

    if (filteredWords.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#777; margin-top:20px;">Ничего не найдено по вашему запросу.</p>`;
        return;
    }

    container.innerHTML = filteredWords.map(item => {
        const translations = item.translations || [{ translation: item.translation, context: item.context || '', tag: item.tag || 'Phrase' }];
        const mainTranslation = translations[0].translation;
        const extraCount = translations.length - 1;

        const uniqueTags = [...new Set(translations.map(t => t.tag || 'Phrase'))];
        const tagsBadgesHTML = uniqueTags.map(tag => `
            <span style="background:${getTagColor(tag)}; color:white; padding:3px 8px; border-radius:4px; font-size:0.75em; margin-left:4px;">${tag}</span>
        `).join('');

        const detailsHTML = translations.map((t, idx) => `
            <div style="margin-top: ${idx === 0 ? '8px' : '6px'}; padding-top: ${idx === 0 ? '0' : '6px'}; border-top: ${idx === 0 ? 'none' : '1px solid var(--border-color)'};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="margin:0; font-size:1em; color:var(--text-color);"><b>${t.translation}</b></p>
                    <span style="background:${getTagColor(t.tag || 'Phrase')}; color:white; padding:2px 6px; border-radius:3px; font-size:0.7em;">${t.tag || 'Phrase'}</span>
                </div>
                ${t.context ? `<p style="margin:2px 0 0 0; font-size:0.85em; font-style:italic; color:var(--text-muted);">Пример: "${t.context}"</p>` : ''}
            </div>
        `).join('');

        const primaryTag = translations[0].tag || item.tag;

        return `
            <div class="word-item" onclick="toggleWordCardDetails(this)" style="border-left-color: ${getTagColor(primaryTag)}; background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); cursor: pointer;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin:0 0 5px 0; color:var(--text-color);">${item.word} <span style="font-size:0.8em; font-weight:normal; color:var(--text-muted);">[${item.transcription || '—'}]</span></h3>
                        <div class="main-preview">
                            <p style="margin:0; font-size:1.1em; color:var(--text-color); display:inline-block;"><b>${mainTranslation}</b></p>
                            ${extraCount > 0 ? `<span style="margin-left:8px; font-size:0.8em; background:var(--btn-secondary-bg); color:var(--btn-secondary-text); padding:2px 6px; border-radius:4px;">+${extraCount} ещё</span>` : ''}
                        </div>
                    </div>
                    <div class="header-tags" style="display:flex; flex-wrap:wrap; gap:2px; justify-content:flex-end; max-width:40%;">
                        ${tagsBadgesHTML}
                    </div>
                </div>
                
                <div class="word-details" style="display:none; margin-top:10px;">
                    ${detailsHTML}
                </div>

                <div class="word-actions" onclick="event.stopPropagation()" style="display:flex; gap:10px; margin-top:10px;">
                    <button onclick="openEditModal('${item.id}')" style="padding:6px 12px; background:var(--btn-secondary-bg); color:var(--btn-secondary-text); border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Редактировать</button>
                    <button onclick="deleteWord('${item.id}')" style="padding:6px 12px; background:#ffebee; color:#c62828; border:none; border-radius:4px; cursor:pointer;">Удалить</button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleWordCardDetails(cardElement) {
    const details = cardElement.querySelector('.word-details');
    const preview = cardElement.querySelector('.main-preview');
    if (details) {
        const isHidden = details.style.display === 'none' || !details.style.display;
        details.style.display = isHidden ? 'block' : 'none';
        if (preview) {
            preview.style.display = isHidden ? 'none' : 'block';
        }
        // Добавляем переключение класса, чтобы теги в углу пропадали при раскрытии
        cardElement.classList.toggle('expanded', isHidden);
    }
}

function openEditModal(id) {
    const item = vocabulary.find(w => w.id == id);
    if (!item) return;

    currentEditId = id;

    document.getElementById('editWord').value = item.word || '';
    document.getElementById('editTranscription').value = item.transcription || '';
    
    const tagSelect = document.getElementById('editTag');
    if (tagSelect) {
        tagSelect.value = item.tag || 'Noun';
    }

    let translations = item.translations;
    if (!translations || translations.length === 0) {
        translations = [{
            translation: item.translation || '',
            context: item.context || '',
            tag: item.tag || 'Noun'
        }];
    }

    let editTranslationsContainer = document.getElementById('editTranslationsContainer');
    if (!editTranslationsContainer) {
        const formBody = document.querySelector('#editModal .modal-body, #editModal form, #editModal') || document.getElementById('editModal');
        editTranslationsContainer = document.createElement('div');
        editTranslationsContainer.id = 'editTranslationsContainer';
        
        const oldTransInput = document.getElementById('editTrans');
        if (oldTransInput && oldTransInput.parentElement) {
            oldTransInput.parentElement.replaceWith(editTranslationsContainer);
        } else {
            formBody.appendChild(editTranslationsContainer);
        }
    }

    editTranslationsContainer.innerHTML = `
        <label style="display:block; margin-bottom:5px; font-weight:bold;">Переводы и примеры:</label>
        <div id="editTranslationsList"></div>
        <button type="button" onclick="addEditTranslationBlock()" style="margin-top:8px; padding:6px 12px; background:#e3f2fd; color:#1565c0; border:none; border-radius:4px; cursor:pointer; font-size:0.9em;">+ Добавить вариант</button>
    `;

    const listContainer = document.getElementById('editTranslationsList');
    listContainer.innerHTML = translations.map((t, index) => `
        <div class="edit-translation-row" style="display:flex; flex-direction:column; gap:5px; margin-bottom:12px; padding:10px; border:1px solid #ddd; border-radius:6px; background:#fdfdfd; position:relative;">
            <input type="text" class="editTransInput" value="${t.translation || ''}" placeholder="Перевод..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:1em;">
            <input type="text" class="editContextInput" value="${t.context || ''}" placeholder="Пример использования..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:0.9em;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <select class="editTagInput" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
                    <option value="Noun" ${t.tag === 'Noun' ? 'selected' : ''}>Существительное</option>
                    <option value="Verb" ${t.tag === 'Verb' ? 'selected' : ''}>Глагол</option>
                    <option value="Adjective" ${t.tag === 'Adjective' ? 'selected' : ''}>Прилагательное</option>
                    <option value="Adverb" ${t.tag === 'Adverb' ? 'selected' : ''}>Наречие</option>
                    <option value="Preposition" ${t.tag === 'Preposition' ? 'selected' : ''}>Предлог</option>
                    <option value="Conjunction" ${t.tag === 'Conjunction' ? 'selected' : ''}>Союз</option>
                    <option value="Interjection" ${t.tag === 'Interjection' ? 'selected' : ''}>Междометие</option>
                    <option value="Phrase" ${t.tag === 'Phrase' ? 'selected' : ''}>Фраза</option>
                </select>
                <button type="button" onclick="this.closest('.edit-translation-row').remove()" style="padding:4px 8px; background:#ffebee; color:#c62828; border:none; border-radius:4px; cursor:pointer; font-size:0.85em;">Удалить</button>
            </div>
        </div>
    `).join('');

    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function addEditTranslationBlock() {
    const listContainer = document.getElementById('editTranslationsList');
    if (!listContainer) return;

    const row = document.createElement('div');
    row.className = 'edit-translation-row';
    row.style.cssText = 'display:flex; flex-direction:column; gap:5px; margin-bottom:12px; padding:10px; border:1px solid #ddd; border-radius:6px; background:#fdfdfd; position:relative;';
    row.innerHTML = `
        <input type="text" class="editTransInput" placeholder="Перевод..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:1em;">
        <input type="text" class="editContextInput" placeholder="Пример использования..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:0.9em;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <select class="editTagInput" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
                <option value="Noun">Существительное</option>
                <option value="Verb">Глагол</option>
                <option value="Adjective">Прилагательное</option>
                <option value="Adverb">Наречие</option>
                <option value="Preposition">Предлог</option>
                <option value="Conjunction">Союз</option>
                <option value="Interjection">Междометие</option>
                <option value="Phrase">Фраза</option>
            </select>
            <button type="button" onclick="this.closest('.edit-translation-row').remove()" style="padding:4px 8px; background:#ffebee; color:#c62828; border:none; border-radius:4px; cursor:pointer; font-size:0.85em;">Удалить</button>
        </div>
    `;
    listContainer.appendChild(row);
}

function saveEdit() {
    if (!currentEditId) return;

    const index = vocabulary.findIndex(w => w.id == currentEditId);
    if (index === -1) return;

    const rows = document.querySelectorAll('.edit-translation-row');
    const translations = [];

    rows.forEach(row => {
        const transVal = row.querySelector('.editTransInput').value.trim();
        const contextVal = row.querySelector('.editContextInput').value.trim();
        const tagVal = row.querySelector('.editTagInput').value;

        if (transVal) {
            translations.push({
                translation: transVal,
                context: contextVal,
                tag: tagVal
            });
        }
    });

    if (translations.length === 0) {
        alert('У слова должен остаться хотя бы один перевод!');
        return;
    }

    vocabulary[index] = {
        ...vocabulary[index],
        word: document.getElementById('editWord').value.trim(),
        transcription: document.getElementById('editTranscription').value.trim(),
        tag: translations[0].tag,
        translation: translations[0].translation,
        context: translations[0].context,
        translations: translations
    };

    localStorage.setItem('myWords', JSON.stringify(vocabulary));

    closeModal();
    renderLibrary();
    if (typeof renderStats === 'function') renderStats();
}

function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentEditId = null;
}

function handleSearchInput(val) {
    currentSearchQuery = val;
    renderLibrary();
    const newInput = document.getElementById('searchInput');
    if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
    }
}

function handleTagFilter(tag) {
    currentFilterTag = tag;
    renderLibrary();
}

function renderStats() {
    const container = document.getElementById('statsContent');
    if (!container) return;

    const total = vocabulary.length || 1;
    
    const cats = {};
    vocabulary.forEach(w => {
        cats[w.tag] = (cats[w.tag] || 0) + 1;
    });

    let cumulativePercent = 0;
    let gradientStops = [];
    
    Object.entries(cats).forEach(([cat, count]) => {
        const percentage = (count / total) * 100;
        const start = cumulativePercent;
        cumulativePercent += percentage;
        const color = TAG_COLORS[cat] || '#7f8c8d';
        gradientStops.push(`${color} ${start}% ${cumulativePercent}%`);
    });

    const gradientString = gradientStops.length > 0 ? `conic-gradient(${gradientStops.join(', ')})` : '#ddd';

    const hard = [...vocabulary].sort((a, b) => a.easeFactor - b.easeFactor).slice(0, 10);
    const easy = [...vocabulary].sort((a, b) => b.easeFactor - a.easeFactor).slice(0, 10);
    
    let activityHTML = '';
    for(let i = 6; i >= 0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i); 
        let dateStr = d.toISOString().split('T')[0];
        let logs = activityLog.filter(l => l.date === dateStr);
        activityHTML += `<div style="display:flex; justify-content:space-between; padding:5px 10px; border-bottom:1px solid #eee;">
            <span>${d.toLocaleDateString('ru', {day:'2-digit', month:'2-digit'})}</span>
            <span><b style="color:green;">${logs.filter(l => l.res === 'ok').length}</b> / <b style="color:red;">${logs.filter(l => l.res === 'bad').length}</b></span>
        </div>`;
    }

    const ruCategoryNames = {
        'Noun': 'Существительное',
        'Verb': 'Глагол',
        'Adjective': 'Прилагательное',
        'Adverb': 'Наречие',
        'Preposition': 'Предлог',
        'Conjunction': 'Союз',
        'Interjection': 'Междометие',
        'Phrase': 'Фраза'
    };

    const legendHTML = Object.entries(cats).map(([cat, count]) => {
        const color = TAG_COLORS[cat] || '#7f8c8d';
        const displayName = ruCategoryNames[cat] || cat;
        return `
            <div class="legend-item" style="display:flex; align-items:center; margin:5px 10px; font-size:0.85em;">
                <div class="color-box" style="width:12px; height:12px; background:${color}; margin-right:8px; border-radius:2px;"></div>
                ${displayName}:&nbsp;<strong>${count}</strong>&nbsp;(${Math.round((count/total)*100)}%)
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <h3 style="text-align:center;">Распределение базы</h3>
        <div class="pie-chart" style="width: 150px; height: 150px; border-radius: 50%; margin: 0 auto 15px auto; background: ${gradientString}; border: 1px solid #ddd; box-sizing: border-box;"></div>
        <div style="display:flex; flex-wrap:wrap; justify-content:center; margin-bottom:20px;">${legendHTML}</div>
        
        <h3>Активность</h3>
        <div style="background:#fff; border:1px solid #ddd; border-radius:8px; margin-bottom: 20px;">${activityHTML}</div>
        
        <h3>Битва слов</h3>
        <table class="stats-table" style="width:100%; border-collapse:collapse;">
            <tr><th style="text-align:left; padding:5px;">Сложные</th><th style="text-align:left; padding:5px;">Легкие</th></tr>
            ${Array.from({length: Math.max(hard.length, easy.length, 1)}).map((_, i) => `<tr>
                <td style="padding:5px; border-top:1px solid #eee;">${hard[i]?.word || '-'}</td>
                <td style="padding:5px; border-top:1px solid #eee;">${easy[i]?.word || '-'}</td>
            </tr>`).join('')}
        </table>`;
}

function handleSwipe(direction, w) {
    const card = document.getElementById('currentCard');
    if (card) {
        card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        card.style.transform = `translateX(${direction === 1 ? 500 : -500}px) rotate(${direction === 1 ? 20 : -20}deg)`;
        card.style.opacity = '0';
    }

    setTimeout(() => {
        const grade = direction === 1 ? 5 : 1;
        updateTranslationProgress(w.wordId, w.translationIndex, grade);

        archiveIndex++;
        renderCard();
    }, 300);
}

function renderCard() {
    const container = document.getElementById('flashcardsContainer');
    if (archiveIndex >= currentSessionWords.length) { 
        container.innerHTML = '<h3>Список пуст!</h3>'; 
        return; 
    }
    
    const w = currentSessionWords[archiveIndex];
    
    container.innerHTML = `
        <div class="card-wrapper" id="currentCard" onclick="flipCard()" style="cursor:pointer; padding:30px 20px; border:1px solid #ddd; border-radius:12px; background:white; box-sizing: border-box; width: 100%; min-height: 320px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 10px rgba(0,0,0,0.05); user-select: none; -webkit-tap-highlight-color: transparent;">
            <div>
                <span style="font-size: 0.9em; color: #888; text-transform: uppercase; letter-spacing: 1px;">${w.tag || ''}</span>
                <h1 style="font-size: 2.2em; margin: 10px 0 5px 0; word-break: break-word;">${w.word}</h1>
                ${w.transcription ? `<p style="color:#555; font-size:2.2em; font-weight:bold; margin:0 0 15px 0; word-break: break-word;">[${w.transcription}]</p>` : ''}
                ${w.context ? `<p style="margin:15px 0; font-size:1.1em; font-style:italic; color:#444; line-height: 1.4;">"${w.context}"</p>` : ''}
            </div>
            
            <div>
                <div id="hiddenTranslation" style="display:none; margin-top:15px; border-top:1px solid #eee; padding-top:15px;">
                    <h2 style="color:#4a90e2; font-size: 1.8em; margin: 0; word-break: break-word;">${w.translation}</h2>
                </div>
            </div>
        </div>`;
    
    let card = document.getElementById('currentCard');
    let startX = 0, startY = 0, isDragging = false;
    
    card.onpointerdown = (e) => { 
        isDragging = true; 
        startX = e.clientX; 
        startY = e.clientY;
    };
    
    window.onpointermove = (e) => { 
        if (!isDragging) return; 
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            card.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.03}deg)`;
        }
    };
    
    window.onpointerup = (e) => { 
        if (!isDragging) return; 
        isDragging = false; 
        const deltaX = e.clientX - startX;
        
        if (Math.abs(deltaX) > 80) { 
            handleSwipe(deltaX > 0 ? 1 : 0, w); 
        } else { 
            card.style.transform = 'translateX(0) rotate(0deg)'; 
        } 
    };
}

function flipCard() {
    const translationDiv = document.getElementById('hiddenTranslation');
    if (translationDiv) {
        translationDiv.style.display = 'block';
    }
}

function getTagColor(tag) {
    return TAG_COLORS[tag] || '#7f8c8d'; 
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeButtonText();
}

function updateThemeButtonText() {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        const isDark = document.body.classList.contains('dark-theme');
        btn.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
    }
}

function renderSpellingCard() {
    const container = document.getElementById('flashcardsContainer');
    
    if (archiveIndex >= currentSessionWords.length) {
        container.innerHTML = '<h3>Тренировка завершена!</h3>';
        return;
    }

    const w = currentSessionWords[archiveIndex];
    if (!w) return;

    container.innerHTML = `
        <div class="card-wrapper" style="padding:20px; border:1px solid #ddd; border-radius:10px; background:white; text-align:center; box-sizing:border-box; width:100%;">
            <h3 style="margin-top:0;">Правописание</h3>
            <p style="font-size:1.5em; font-weight:bold; margin:20px 0; word-wrap:break-word;">${w.translation}</p>
            
            <div id="spellingInputArea">
                <input type="text" id="spellingInput" placeholder="Введите слово..." style="width:100%; box-sizing:border-box; padding:12px; font-size:1.1em; margin-bottom:15px; border:1px solid #ccc; border-radius:5px; outline:none; text-align:center;">
                
                <button id="checkSpellingBtn" onclick="checkSpelling()" style="width:100%; box-sizing:border-box; padding:12px; background:#4a90e2; color:white; border:none; border-radius:5px; font-size:1.1em; cursor:pointer;">Проверить</button>
            </div>

            <div id="spellingResultArea" style="margin-top:15px; display:none;"></div>
        </div>`;

    setTimeout(() => {
        const input = document.getElementById('spellingInput');
        if (input) {
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    checkSpelling();
                }
            });
        }
    }, 100);
}

function checkSpelling() {
    if (archiveIndex >= currentSessionWords.length) return;
    const w = currentSessionWords[archiveIndex];
    if (!w || !w.word) return;

    const input = document.getElementById('spellingInput');
    if (!input) return;
    
    const userVal = String(input.value).trim().toLowerCase();
    const targetWord = String(w.word).trim().toLowerCase();
    const isCorrect = userVal === targetWord;

    input.disabled = true;
    
    if (isCorrect) {
        input.style.backgroundColor = 'rgba(39, 174, 96, 0.1)';
        input.style.borderColor = '#27ae60';
        input.style.color = '#145c32';
    } else {
        input.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
        input.style.borderColor = '#e74c3c';
        input.style.color = '#78231a';
    }

    const checkBtn = document.getElementById('checkSpellingBtn');
    if (checkBtn) checkBtn.style.display = 'none';

    const resultArea = document.getElementById('spellingResultArea');
    if (resultArea) {
        resultArea.style.display = 'block';
        resultArea.innerHTML = `
            <p style="font-size:1.2em; font-weight:bold; color:${isCorrect ? '#27ae60' : '#e74c3c'}; margin-bottom:10px;">
                ${isCorrect ? 'Верно!' : `Ошибка! Правильно:<br><span style="font-size:1.3em; display:inline-block; margin-top:10px; color:#c0392b;">${w.word}</span>`}
            </p>
            ${w.context ? `<p style="font-style:italic; color:#777; margin:15px 0; word-wrap:break-word; line-height:1.4;">${w.context}</p>` : ''}
            
            <button onclick="proceedFromSpelling(${isCorrect ? 5 : 1})" style="width:100%; box-sizing:border-box; padding:12px; background:${isCorrect ? '#27ae60' : '#e74c3c'}; color:white; border:none; border-radius:5px; font-size:1.1em; cursor:pointer; margin-top:10px;">Дальше</button>
        `;
        
        setTimeout(() => {
            const nextBtn = resultArea.querySelector('button');
            if (nextBtn) nextBtn.focus();
        }, 100);
    }
}

function nextSpellingCard(grade) {
    const w = currentSessionWords[archiveIndex];
    if (w) {
        updateTranslationProgress(w.wordId, w.translationIndex, grade);
    }

    archiveIndex++;
    renderSpellingCard();
}

function proceedFromSpelling(quality) {
    const w = currentSessionWords[archiveIndex];
    
    activityLog.push({ date: new Date().toISOString().split('T')[0], res: quality === 1 ? 'ok' : 'bad' });
    localStorage.setItem('activityLog', JSON.stringify(activityLog.slice(-200)));
    
    if (quality === 0) { 
        w.interval = 1; 
        w.repetition = 0; 
        w.easeFactor = Math.max(1.3, w.easeFactor - 0.2); 
    } else { 
        w.interval = w.repetition === 0 ? 1 : Math.round(w.interval * w.easeFactor); 
        w.repetition++; 
    }
    
    w.nextReviewDate = new Date(Date.now() + w.interval * 86400000).toISOString().split('T')[0];
    localStorage.setItem('myWords', JSON.stringify(vocabulary));
    
    archiveIndex++; 
    renderSpellingCard();
}

function getDueTranslationTasks() {
    const today = new Date().toISOString().split('T')[0];
    const tasks = [];

    vocabulary.forEach(wordObj => {
        const transList = wordObj.translations || [{
            translation: wordObj.translation,
            context: wordObj.context || '',
            tag: wordObj.tag || 'Phrase',
            interval: wordObj.interval || 0,
            repetition: wordObj.repetition || 0,
            easeFactor: wordObj.easeFactor || 2.5,
            nextReviewDate: wordObj.nextReviewDate || today
        }];

        transList.forEach((tr, index) => {
            // Если дата повторения настала (или архив/все подряд)
            if (!tr.nextReviewDate || tr.nextReviewDate <= today) {
                tasks.push({
                    wordId: wordObj.id,
                    word: wordObj.word,
                    transcription: wordObj.transcription,
                    translationIndex: index, // индекс конкретного перевода в массиве
                    translationData: tr
                });
            }
        });
    });

    return tasks;
}

function updateTranslationProgress(wordId, translationIndex, grade) {
    const wordIndex = vocabulary.findIndex(w => String(w.id) === String(wordId));
    if (wordIndex === -1) return;

    const wordObj = vocabulary[wordIndex];
    if (!wordObj.translations) {
        wordObj.translations = [{
            translation: wordObj.translation,
            context: wordObj.context || '',
            tag: wordObj.tag || 'Phrase',
            interval: wordObj.interval || 0,
            repetition: wordObj.repetition || 0,
            easeFactor: wordObj.easeFactor || 2.5,
            nextReviewDate: wordObj.nextReviewDate || new Date().toISOString().split('T')[0]
        }];
    }

    if (!wordObj.translations[translationIndex]) return;

    let tr = wordObj.translations[translationIndex];

    if (grade >= 3) {
        if (tr.repetition === 0) {
            tr.interval = 1;
        } else if (tr.repetition === 1) {
            tr.interval = 6;
        } else {
            tr.interval = Math.round((tr.interval || 1) * (tr.easeFactor || 2.5));
        }
        tr.repetition++;
    } else {
        tr.repetition = 0;
        tr.interval = 1;
    }

    tr.easeFactor = (tr.easeFactor || 2.5) + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (tr.easeFactor < 1.3) tr.easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (tr.interval || 1));
    tr.nextReviewDate = nextDate.toISOString().split('T')[0];

    wordObj.translation = wordObj.translations[0].translation;
    wordObj.context = wordObj.translations[0].context;
    wordObj.tag = wordObj.translations[0].tag;
    wordObj.interval = wordObj.translations[0].interval;
    wordObj.repetition = wordObj.translations[0].repetition;
    wordObj.easeFactor = wordObj.translations[0].easeFactor;
    wordObj.nextReviewDate = wordObj.translations[0].nextReviewDate;

    localStorage.setItem('myWords', JSON.stringify(vocabulary));
}

function stopTraining() {
    document.getElementById('trainingSession').style.display = 'none';
    document.getElementById('trainingMenu').style.display = 'block';
    document.getElementById('mainNav').style.display = 'block';
}