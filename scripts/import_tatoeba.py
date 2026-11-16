"""Import official TSV exports into a candidate JSON file for human review.

Accepts sentences.csv (id, lang, text), links.csv (id, translation_id),
and optionally sentences_detailed.csv (id, lang, text, username, ...).
No downloaded text is automatically added to the published corpus.
Files can be plain TSV or .bz2. All paths are explicit CLI arguments.
"""
import argparse
import bz2
import csv
import json
from pathlib import Path


def rows(path):
    opener = bz2.open if str(path).endswith('.bz2') else open
    with opener(path, 'rt', encoding='utf-8', newline='') as f:
        yield from csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sentences', type=Path, required=True)
    parser.add_argument('--links', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--min-words', type=int, default=5)
    parser.add_argument('--max-words', type=int, default=18)
    parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args()
    english, russian = {}, {}
    for row in rows(args.sentences):
        if len(row) < 3:
            continue
        sid, lang, text = row[:3]
        if lang == 'eng' and args.min_words <= len(text.split()) <= args.max_words:
            english[sid] = (text, row[3] if len(row) > 3 else None)
        elif lang == 'rus':
            russian[sid] = (text, row[3] if len(row) > 3 else None)
    result, seen = [], set()
    for row in rows(args.links):
        if len(row) < 2:
            continue
        eng, rus = row[:2]
        if eng not in english or rus not in russian:
            continue
        en, author = english[eng]
        ru, ru_author = russian[rus]
        key = (en.casefold(), ru.casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(dict(id=eng, en=en, ru=ru, ruId=rus, author=author,
                           ruAuthor=ru_author, license='CC BY 2.0 FR', reviewed=False))
        if len(result) >= args.limit:
            break
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Imported {len(result)} direct pairs. Translation review and positional alignment required.')


if __name__ == '__main__':
    main()
