import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from importlib.machinery import SourceFileLoader

module = SourceFileLoader('musicdump', str(Path(__file__).resolve().parents[1] / 'scripts/import-musicbrainz-jsonl.py')).load_module()

class TestDump(unittest.TestCase):
    def test_release_and_standalone_are_both_required(self):
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp) / 'release.jsonl'
            standalone = Path(temp) / 'recording.jsonl'
            release.write_text(json.dumps({'title':'Album','media':[{'tracks':[{'recording':{'id':'00000000-0000-4000-8000-000000000001','title':'World Song','artist-credit':[{'artist':{'name':'Singer'}}]}}]}]})+'\n')
            standalone.write_text(json.dumps({'id':'00000000-0000-4000-8000-000000000002','title':'Standalone Song','artist-credit':[{'artist':{'name':'Another'}}],'tags':[{'name':'non-CC0 extras'}]})+'\n')
            with sqlite3.connect(Path(temp) / 'music.sqlite') as db:
                module.import_file(db, release, 'release')
                module.import_file(db, standalone, 'recording')
                self.assertEqual(db.execute('SELECT count(*) FROM recordings').fetchone()[0],2)
                self.assertEqual(db.execute("SELECT r.name FROM recording_search s JOIN recordings r ON r.rowid=s.rowid WHERE recording_search MATCH 'World' LIMIT 1").fetchone()[0],'World Song')
                self.assertFalse('tags' in {col[1] for col in db.execute('pragma table_info(recordings)')})

if __name__ == '__main__':
    unittest.main()
