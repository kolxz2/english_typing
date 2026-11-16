"""Compile reviewed, explicit phrase alignments into positional runtime data."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def compile_row(row):
    english = row['en'].split()
    russian = row['ru'].split()
    groups, candidates = [], []
    cursor = 0
    for spec in row['alignment']:
        # [exact English fragment, contextual gloss, Russian token indexes, optional drill word]
        phrase, gloss, indexes, *drill = spec
        length = len(phrase.split())
        assert english[cursor:cursor + length] == phrase.split(), (row['id'], phrase, english[cursor:cursor + length])
        assert indexes and all(isinstance(i, int) and 0 <= i < len(russian) for i in indexes), (row['id'], indexes)
        groups.append(dict(en=[cursor, cursor + length], ru=indexes, gloss=gloss))
        if drill and drill[0]:
            word, translation = drill[0]
            matches = [i for i in range(cursor, cursor + length) if re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", '', english[i]) == word]
            assert len(matches) == 1, (row['id'], word)
            candidates.append(dict(token=matches[0], word=word, gloss=translation))
        cursor += length
    assert cursor == len(english), row['id']
    assert candidates, row['id']
    return dict(id=str(row['id']), en=row['en'], ru=row['ru'], level=row['level'],
                source=dict(en=dict(id=str(row['id']), url=f"https://tatoeba.org/en/sentences/show/{row['id']}",
                                    author=row.get('author'), license=row.get('license', 'CC BY 2.0 FR')),
                            ru=dict(id=str(row['ruId']), url=f"https://tatoeba.org/en/sentences/show/{row['ruId']}",
                                    author=row.get('ruAuthor'), license='CC BY 2.0 FR')),
                groups=groups, candidates=candidates)


def main():
    rows = json.loads((ROOT / 'data/reviewed.json').read_text(encoding='utf-8'))
    corpus = dict(version=1, source='Tatoeba', prepared='2026-11-16',
                  note='Direct translations. Contextual glosses and B1/B2 estimates are editorial annotations.',
                  sentences=[compile_row(row) for row in rows])
    (ROOT / 'data/sentences.json').write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Built {len(rows)} aligned sentences.")


if __name__ == '__main__':
    main()
