import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from sync import prepare, install, safe


class SyncTests(unittest.TestCase):
    def test_install_check_and_modified_file_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            install(prepare('mutti', root, 'test-revision'))
            self.assertIsNone(prepare('mutti', root, 'test-revision', check=True))
            lock_before = (root / 'kurt.lock.json').read_bytes()
            player = root / 'mutti/migrate/web/kurt.js'
            player.write_text('// local fix\n')
            with self.assertRaisesRegex(ValueError, 'nothing overwritten'):
                prepare('mutti', root, 'new-revision')
            self.assertEqual(player.read_text(), '// local fix\n')
            self.assertEqual((root / 'kurt.lock.json').read_bytes(), lock_before)

    def test_unmanaged_file_and_path_escape_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            player = root / 'mutti/migrate/web/kurt.js'
            player.parent.mkdir(parents=True)
            player.write_text('existing source')
            with self.assertRaisesRegex(ValueError, 'unmanaged'):
                prepare('mutti', root, 'test-revision')
            with self.assertRaisesRegex(ValueError, 'outside consumer'):
                safe(root, '../outside')

    def test_stale_version_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            install(prepare('website', root, 'old-revision'))
            with self.assertRaisesRegex(ValueError, 'snapshot differs'):
                prepare('website', root, 'new-revision', check=True)
