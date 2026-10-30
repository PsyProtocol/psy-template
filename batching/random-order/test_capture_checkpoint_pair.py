"""Transport-envelope regressions only; no RPC or cryptographic verification."""
import hashlib
import json
from pathlib import Path
import sys
import unittest
import tempfile
import subprocess
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_checkpoint_pair import decode_proof_response, capture_read


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.data = bytes([0, 127, 255, 42])
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.reply = {'jsonrpc': '2.0', 'id': 18504, 'result': list(self.data)}

    def parse(self, reply):
        return decode_proof_response(json.dumps(reply), 18504, self.digest)

    def test_exact_bytes(self):
        self.assertEqual(self.parse(self.reply), self.data)

    def test_wrong_request_id(self):
        self.reply['id'] = 18505
        with self.assertRaises(ValueError): self.parse(self.reply)

    def test_float_request_id(self):
        self.reply['id'] = 18504.0
        with self.assertRaises(ValueError): self.parse(self.reply)

    def test_rpc_error_never_becomes_empty_proof(self):
        self.reply['error'] = {'code': -1, 'message': 'unavailable'}
        with self.assertRaises(ValueError): self.parse(self.reply)

    def test_malformed_and_truncated_json(self):
        for raw in ['{', '', '[1,2]']:
            with self.assertRaises((ValueError, TypeError)):
                decode_proof_response(raw, 18504, self.digest)

    def test_bool_float_and_out_of_range_bytes(self):
        for bad in [True, 1.0, -1, 256, '42']:
            self.reply['result'] = [bad]
            with self.assertRaises(ValueError): self.parse(self.reply)

    def test_different_original_digest(self):
        self.reply['result'][0] = 1
        with self.assertRaises(ValueError): self.parse(self.reply)

    def test_empty_proof(self):
        self.reply['result'] = []
        with self.assertRaises(ValueError): self.parse(self.reply)

    def test_partial_wrapper_timeout_is_preserved_without_retry(self):
        calls=[]
        def runner(*args,**kwargs):
            calls.append(args)
            raise subprocess.TimeoutExpired('curl',45,output=b'{"partial":',stderr=b'timeout')
        with tempfile.TemporaryDirectory()as name:
            root=Path(name)
            with self.assertRaises(RuntimeError):capture_read(root,'proof',self.reply,runner)
            self.assertEqual((root/'proof-response.raw').read_bytes(),b'{"partial":')
            report=json.loads((root/'proof-transport.json').read_text())
            self.assertTrue(report['wrapperTimedOut']);self.assertIsNone(report['exitCode'])
            self.assertEqual(len(calls),1)

    def test_transport_failure_preserves_complete_looking_json(self):
        def runner(*args,**kwargs):return subprocess.CompletedProcess(args,28,stdout=json.dumps(self.reply).encode(),stderr=b'curl timeout')
        with tempfile.TemporaryDirectory()as name:
            root=Path(name)
            with self.assertRaises(RuntimeError):capture_read(root,'proof',self.reply,runner)
            self.assertEqual(json.loads((root/'proof-response.raw').read_text()),self.reply)


if __name__ == '__main__':
    unittest.main()
