import json
import os

INPUT_FILE = 'top3000.json'
OUTPUT_FILE = 'words.json'

def guess_tag(word, translation):
    if word in ['the', 'a', 'an']:
        return 'Preposition'
    if translation.startswith('to '):
        return 'Verb'
    if word.endswith('ly'):
        return 'Adverb'
    if word.endswith(('tion', 'ity', 'ness')):
        return 'Noun'
    if word.endswith(('ous', 'ive', 'al', 'ful')):
        return 'Adjective'
    return 'Noun'

def clean_translation(text):
    if not text:
        return '—'
    # Берем часть до первой точки и убираем лишние пробелы
    cleaned = text.split('.')[0].strip()
    if len(cleaned) > 50:
        cleaned = cleaned[:47] + '...'
    return cleaned

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Ошибка: файл {INPUT_FILE} не найден!")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        words_array = json.load(f)

    formatted_words = []
    for index, item in enumerate(words_array):
        word = item.get('word', '')
        raw_translation = item.get('translation', '')
        
        formatted_words.append({
            "id": f"word_{index + 1}",
            "word": word,
            "translation": clean_translation(raw_translation),
            "transcription": item.get('transcription', '[]'),
            "context": f'Example context for "{word}".',
            "tag": guess_tag(word, raw_translation)
        })

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(formatted_words, f, ensure_ascii=False, indent=2)

    print(f"Успешно обработано слов: {len(formatted_words)} -> {OUTPUT_FILE}")

if __name__ == '__main__':
    main()