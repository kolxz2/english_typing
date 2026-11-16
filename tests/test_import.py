import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ImportTest(unittest.TestCase):
    def test_only_direct_pairs_and_deduplication(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            sentences = folder / 'sentences.tsv'
            links = folder / 'links.tsv'
            output = folder / 'output.json'
            sentences.write_text('1\teng\tWe have never been there.\tAlice\n'
                                 '2\trus\tМы никогда там не были.\tBoris\n'
                                 '3\tdeu\tWir waren noch nie dort.\n'
                                 '4\teng\tWe have never been there.\tAlice\n'
                                 '5\trus\tДругой перевод.\n', encoding='utf-8')
            links.write_text('1\t2\n1\t3\n3\t5\n4\t2\n2\t1\n', encoding='utf-8')
            subprocess.run([sys.executable, str(ROOT / 'scripts/import_tatoeba.py'),
                            '--sentences', str(sentences), '--links', str(links), '--output', str(output)],
                           check=True, capture_output=True)
            data = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]['id'], '1')
            self.assertEqual(data[0]['ruId'], '2')
            self.assertEqual(data[0]['ruAuthor'], 'Boris')
            self.assertFalse(data[0]['reviewed'])


if __name__ == '__main__':
    unittest.main()
