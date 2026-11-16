"""Download a candidate pool, never publish unreviewed search results.

The application's runtime uses only data/sentences.json.
Usage: python scripts/fetch_tatoeba.py
"""
import json
import concurrent.futures
import time
import urllib.parse
import urllib.request
from pathlib import Path

QUERIES = ['experience', 'decision', 'although', 'unless', 'instead',
           'suggest', 'realized', 'opportunity', 'responsible', 'managed',
           'expected', 'avoid', 'rather', 'whether', 'recently',
           'already', 'used to', 'would have', 'as soon as', 'despite',
           'necessary', 'consider', 'supposed', 'permission', 'improve',
           'provided', 'hardly', 'succeeded', 'regret', 'prefer']


def fetch_query(query):
    pool = {}
    for page in (1, 2):
            params = urllib.parse.urlencode(dict(
                **{'from': 'eng', 'to': 'rus'}, query=query, page=page,
                trans_filter='limit', trans_to='rus', sort='random'))
            url = 'https://tatoeba.org/en/api_v0/search?' + params
            request = urllib.request.Request(url, headers={'User-Agent': 'EnglishTyping/1.0 (educational corpus preparation)'})
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(request, timeout=40) as response:
                        payload = json.load(response)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2)
            for item in payload['results']:
                translations = [t for group in item['translations'] for t in group
                                if t.get('isDirect') and t['lang'] == 'rus']
                if not translations or not 5 <= len(item['text'].split()) <= 15:
                    continue
                if not item['text'].isascii() or any(c in item['text'] for c in '0123456789";:'):
                    continue
                translation = translations[0]
                pool[str(item['id'])] = dict(
                    id=str(item['id']), en=item['text'], ru=translation['text'],
                    ruId=str(translation['id']), author=(item.get('user') or {}).get('username'),
                    license=item.get('license', 'CC BY 2.0 FR'), query=query)
            time.sleep(.25)
    return list(pool.values())


def main():
    pool = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for query, result in zip(QUERIES, executor.map(fetch_query, QUERIES)):
            for row in result:
                pool[row['id']] = row
            print(query, len(pool), flush=True)
    out = Path(__file__).resolve().parents[1] / 'data' / 'candidates.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(list(pool.values()), ensure_ascii=False, indent=2), encoding='utf-8')
    print('Saved', len(pool), 'candidates to', out)


if __name__ == '__main__':
    main()
