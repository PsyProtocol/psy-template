"""Transport-only fault tests. No RPC, native proof acceptance or wallet simulation."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-source-inventory.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class TransportBudgetTests(unittest.TestCase):
    def run_capture(self, replies, **kwargs):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        driver = root / 'unexecuted-driver'
        driver.write_bytes(b'transport test only')
        output = root / 'capture'
        with patch.object(collector.subprocess, 'run', side_effect=replies) as run:
            with self.assertRaises(Exception):
                collector.collect(driver, output, 8, 30, **kwargs)
        return output, run.call_count

    def test_retry_keeps_exact_read_identity_and_preserves_failure(self):
        error = subprocess.CompletedProcess([], 35, b'', b'TLS failure')
        head = subprocess.CompletedProcess([], 0, b'{"jsonrpc":"2.0","id":1,"result":123}', b'')
        semantic = subprocess.CompletedProcess([], 0, b'{"jsonrpc":"2.0","id":1,"error":{"code":-1}}', b'')
        out, calls = self.run_capture([error, head, semantic], read_retries=1, max_retry_attempts=16)
        self.assertEqual(calls, 3)
        a, b = [json.loads((out / f'{i:05d}-request.json').read_text()) for i in [1, 2]]
        self.assertEqual(a['request'], b['request'])
        self.assertEqual(a['readIdentitySha256'], b['readIdentitySha256'])
        self.assertEqual(a['attempt'], 0)
        self.assertEqual(b['attempt'], 1)
        self.assertTrue((out / '00001-transport.json').exists())
        self.assertFalse((out / 'COMPLETE.json').exists())
        self.assertEqual(json.loads((out / 'STOPPED.json').read_text())['readTransportRetries'], 1)

    def test_default_never_retries_and_exhausted_retry_stops(self):
        error = subprocess.CompletedProcess([], 35, b'', b'TLS failure')
        _, calls = self.run_capture([error])
        self.assertEqual(calls, 1)
        out, calls = self.run_capture([error, error], read_retries=1, max_retry_attempts=1)
        self.assertEqual(calls, 2)
        self.assertEqual(json.loads((out / 'STOPPED.json').read_text())['financialOperations'], 0)

    def test_semantic_error_is_not_a_transport_retry(self):
        error = subprocess.CompletedProcess([], 0, b'{"jsonrpc":"2.0","id":1,"error":{"code":-32601}}', b'')
        out, calls = self.run_capture([error], read_retries=1, max_retry_attempts=16)
        self.assertEqual(calls, 1)
        self.assertFalse((out / 'SCOPE.json').exists())


if __name__ == '__main__':
    unittest.main()
