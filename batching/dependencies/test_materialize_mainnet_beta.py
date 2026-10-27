import io
import tarfile
import tempfile
import unittest
from pathlib import Path
from materialize_mainnet_beta import read_archive, verify, materialize


class MainnetBetaSourceTests(unittest.TestCase):
    def test_archive_links_and_traversal_do_not_write_files(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/escape', tarfile.REGTYPE),
                           ('link', tarfile.SYMTYPE), ('hardlink', tarfile.LNKTYPE)]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w') as archive:
                info = tarfile.TarInfo(name)
                info.type = kind
                archive.addfile(info)
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    read_archive(data.getvalue(), Path(directory))
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            sentinel = Path(directory) / 'original'
            sentinel.write_text('preserve')
            with self.assertRaises(ValueError):
                materialize({'sourcePins': []}, {}, Path(directory))
            self.assertEqual(sentinel.read_text(), 'preserve')

    def test_source_hash_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.rs'
            path.write_text('changed')
            with self.assertRaises(ValueError):
                verify(Path(directory), {'path': 'psy-sdk', 'sourceFiles': {'source.rs': '0' * 64}})


if __name__ == '__main__':
    unittest.main()
