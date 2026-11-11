import json
from pathlib import Path
import tempfile
import unittest
import http.client
import ssl
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch, MagicMock
from public_read_transport import PublicReadPool, PublicReadFailure


class PublicReadTransportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.ca = Path(self.directory.name) / 'ca.pem'
        self.ca.write_bytes(b'reviewed CA test fixture')
        self.endpoint = 'https://realm0-stg.psy-protocol.xyz'
        self.body = json.dumps({'jsonrpc':'2.0', 'id':1, 'method':'psy_get_user_tree_merkle_proof', 'params':{}}).encode()

    def tearDown(self):
        self.directory.cleanup()

    def pool(self):
        with patch('public_read_transport.ssl.create_default_context') as context:
            pool = PublicReadPool([self.endpoint], self.ca)
            context.assert_called_once_with(cafile=str(self.ca))
        return pool

    def test_only_connections_are_reused_and_every_read_is_sent(self):
        pool = self.pool()
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status, response.will_close = 200, False
        response.read1.side_effect = [b'first', b'', b'fresh', b'']
        with patch('public_read_transport.http.client.HTTPSConnection', return_value=connection) as factory:
            self.assertEqual(pool.read(self.endpoint, self.body, 20, 100), (200, b'first'))
            self.assertEqual(pool.read(self.endpoint, self.body, 20, 100), (200, b'fresh'))
            self.assertEqual(factory.call_count, 1)
            self.assertEqual(connection.request.call_count, 2)
        pool.close()
        self.assertFalse(pool.connections)

    def test_mutations_endpoint_substitution_and_trust_change_are_rejected_before_io(self):
        pool = self.pool()
        mutation = json.dumps({'method':'psy_submit_user_end_cap'}).encode()
        with patch('public_read_transport.http.client.HTTPSConnection') as factory:
            for endpoint, body in [(self.endpoint, mutation), ('http://realm0-stg.psy-protocol.xyz', self.body),
                                   ('https://realm0-stg.psy-protocol.xyz.evil.invalid', self.body)]:
                with self.assertRaises(ValueError): pool.read(endpoint, body, 20, 100)
            self.ca.write_bytes(b'changed')
            with self.assertRaises(ValueError): pool.read(self.endpoint, self.body, 20, 100)
            factory.assert_not_called()

    def test_transport_failure_never_resends_and_discards_connection(self):
        pool = self.pool()
        connection = MagicMock()
        connection.request.side_effect = ConnectionResetError('test')
        with patch('public_read_transport.http.client.HTTPSConnection', return_value=connection):
            with self.assertRaises(PublicReadFailure): pool.read(self.endpoint, self.body, 20, 100)
        self.assertEqual(connection.request.call_count, 1)
        self.assertFalse(pool.connections)
        connection.close.assert_called_once()

    def test_redirect_is_returned_to_guard_without_following_and_oversize_rejects(self):
        pool = self.pool()
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status, response.will_close = 307, False
        response.read1.side_effect = [b'redirect', b'']
        with patch('public_read_transport.http.client.HTTPSConnection', return_value=connection):
            self.assertEqual(pool.read(self.endpoint, self.body, 20, 100), (307, b'redirect'))
            self.assertEqual(connection.request.call_count, 1)
            response.read1.side_effect = [b'x'*101]
            with self.assertRaises(PublicReadFailure): pool.read(self.endpoint, self.body, 20, 100)
        self.assertFalse(pool.connections)

    def test_partial_failure_is_preserved_and_certificate_failure_is_not_retryable(self):
        for failure, code in [(http.client.IncompleteRead(b'tail', 10), 56),
                              (ssl.SSLCertVerificationError('test certificate refusal'), 60)]:
            pool = self.pool()
            connection = MagicMock()
            connection.getresponse.return_value.read1.side_effect = [b'prefix', failure]
            with patch('public_read_transport.http.client.HTTPSConnection', return_value=connection):
                with self.assertRaises(PublicReadFailure) as caught:
                    pool.read(self.endpoint, self.body, 20, 100)
            self.assertEqual(caught.exception.code, code)
            self.assertEqual(caught.exception.raw, b'prefixtail' if code == 56 else b'prefix')
            self.assertEqual(connection.request.call_count, 1)
            self.assertFalse(pool.connections)

    def test_total_deadline_interrupts_a_stalled_read_without_retry(self):
        pool = self.pool()
        connection = MagicMock()
        connection.getresponse.return_value.read1.side_effect = lambda _n: time.sleep(0.2)
        started = time.monotonic()
        with patch('public_read_transport.http.client.HTTPSConnection', return_value=connection):
            with self.assertRaises(PublicReadFailure) as caught:
                pool.read(self.endpoint, self.body, 0.01, 100)
        self.assertEqual(caught.exception.code, 28)
        self.assertLess(time.monotonic() - started, 0.15)
        self.assertEqual(connection.request.call_count, 1)
        self.assertFalse(pool.connections)

    def test_real_http_response_lifecycle_allows_multiple_requests(self):
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def do_POST(self):
                self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(200)
                self.send_header('Content-Length', '2')
                self.end_headers()
                self.wfile.write(b'{}')
            def log_message(self, *_args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        endpoint = f'https://127.0.0.1:{server.server_port}'
        with patch('public_read_transport.ssl.create_default_context'):
            pool = PublicReadPool([endpoint], self.ca)
        def connection(host, port, timeout, context):
            return http.client.HTTPConnection(host, port, timeout=timeout)
        try:
            # Local HTTP exercises the real response/connection state machine;
            # it is deliberately not presented as a TLS/network acceptance.
            with patch('public_read_transport.http.client.HTTPSConnection', side_effect=connection) as factory:
                for _ in range(3): self.assertEqual(pool.read(endpoint, self.body, 2, 100), (200, b'{}'))
                self.assertEqual(factory.call_count, 1)
        finally:
            pool.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__': unittest.main()
