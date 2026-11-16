"""Serve a temporary GitHub Pages-like subdirectory and check all runtime assets."""
import functools
import http.server
import json
import shutil
import tempfile
import threading
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ['index.html', 'styles.css', 'app.js', 'engine.js', 'favicon.svg', 'data/sentences.json', '.nojekyll']


def main():
    with tempfile.TemporaryDirectory(prefix='english-typing-check-') as temp:
        directory = Path(temp) / 'english_typing'
        for file in FILES:
            target = directory / file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / file, target)
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=temp)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}/english_typing/'
            for file in FILES:
                with urllib.request.urlopen(base + file, timeout=5) as response:
                    assert response.status == 200
                    body = response.read()
                    if file == 'data/sentences.json':
                        assert len(json.loads(body)['sentences']) == 200
                    if file.endswith('.js'):
                        assert 'javascript' in response.headers['Content-Type']
            print('PASS: all runtime files served under /english_typing/ with HTTP 200; JS MIME and 200-pair JSON verified.')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    main()
