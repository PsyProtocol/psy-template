"""Application provenance regression; no SDK sources, Cargo or network used."""
import unittest
from prepare_mainnet_beta_application import stamp_sdk_metadata


class ProvenanceTests(unittest.TestCase):
    def test_selected_metadata_does_not_rewrite_dependency_revisions(self):
        text = '[dependencies]\nlib = { git = "repo", rev = "old" }\n\n[package.metadata.psy-sdk]\nbranch = "old"\ncommit = "old"\nclient-commit = "old"\n\n[[bin]]\nname = "old"\n'
        manifest = {'sdkCommit': 'a' * 40, 'clientCommit': 'b' * 40}
        actual = stamp_sdk_metadata(text, manifest, 'mainnet-beta')
        self.assertIn('branch = "mainnet-beta"', actual)
        self.assertIn('commit = "' + 'a' * 40 + '"', actual)
        self.assertIn('client-commit = "' + 'b' * 40 + '"', actual)
        self.assertEqual(actual.split('[package.metadata')[0], text.split('[package.metadata')[0])
        self.assertEqual(actual.split('[[bin]]')[1], text.split('[[bin]]')[1])

    def test_ambiguous_or_missing_provenance_refuses(self):
        manifest = {'sdkCommit': 'a' * 40, 'clientCommit': 'b' * 40}
        for text in ['', '[package.metadata.psy-sdk]\ncommit = "old"\n',
                     '[package.metadata.psy-sdk]\n[package.metadata.psy-sdk]\n']:
            with self.assertRaises(ValueError):
                stamp_sdk_metadata(text, manifest, 'mainnet-beta')


if __name__ == '__main__':
    unittest.main()
