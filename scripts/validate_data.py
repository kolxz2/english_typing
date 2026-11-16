"""Validate completeness, provenance and positional integrity, not linguistic truth."""
import json
from pathlib import Path
from build_corpus import compile_row

ROOT = Path(__file__).resolve().parents[1]


def main():
    data = json.loads((ROOT / 'data/sentences.json').read_text(encoding='utf-8'))
    reviewed = json.loads((ROOT / 'data/reviewed.json').read_text(encoding='utf-8'))
    rows = data['sentences']
    assert data['version'] == 1
    assert len(rows) == 200, len(rows)
    assert len({s['id'] for s in rows}) == len(rows)
    assert len({s['en'].casefold() for s in rows}) == len(rows)
    assert rows == [compile_row(row) for row in reviewed]
    levels = {'B1': 0, 'B2': 0}
    for s in rows:
        levels[s['level']] += 1
        english, russian = s['en'].split(), s['ru'].split()
        covered = []
        for group in s['groups']:
            covered.extend(range(*group['en']))
            assert group['gloss'].strip()
            assert all(0 <= i < len(russian) for i in group['ru'])
        assert covered == list(range(len(english))), s['id']
        assert set(i for g in s['groups'] for i in g['ru']) == set(range(len(russian))), ('unmapped Russian', s['id'])
        assert s['candidates']
        for language in ('en', 'ru'):
            source = s['source'][language]
            assert source['id'].isdigit()
            assert source['url'] == 'https://tatoeba.org/en/sentences/show/' + source['id']
            assert source['license'] in ('CC BY 2.0 FR', 'CC0 1.0')
    assert all(n >= 50 for n in levels.values()), levels
    print(f'PASS: {len(rows)} unique direct pairs; levels {levels}; complete EN/RU alignments; candidates; source links; rebuild parity.')


if __name__ == '__main__':
    main()
