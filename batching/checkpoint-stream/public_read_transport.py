"""TLS connection reuse for bounded public RPC reads; no state/result cache."""
import hashlib
import http.client
import json
from pathlib import Path
import ssl
import signal
import threading
from urllib.parse import urlsplit


class PublicReadFailure(OSError):
    def __init__(self, cause, raw=b'', code=56, truncated=False):
        super().__init__(type(cause).__name__)
        self.raw, self.code, self.truncated = raw, code, truncated


class PublicReadPool:
    def __init__(self, endpoints, ca_file):
        self.endpoints = frozenset(endpoints)
        self.ca_file = Path(ca_file)
        self.ca_sha256 = hashlib.sha256(self.ca_file.read_bytes()).hexdigest()
        self.context = ssl.create_default_context(cafile=str(self.ca_file))
        self.connections = {}
        self.owner = threading.get_ident()

    def close(self):
        for connection in self.connections.values():
            connection.close()
        self.connections.clear()

    def read(self, endpoint, encoded, seconds, maximum_bytes):
        request = json.loads(encoded)
        if threading.get_ident() != self.owner or threading.current_thread() is not threading.main_thread():
            raise ValueError('one main-thread public transport owner required')
        if endpoint not in self.endpoints or not request.get('method', '').startswith('psy_get_'):
            raise ValueError('configured public read endpoint and method required')
        parsed = urlsplit(endpoint)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.fragment or parsed.query:
            raise ValueError('TLS public read endpoint required')
        if not 0 < seconds <= 25 or not 0 < maximum_bytes <= 16777216:
            raise ValueError('bounded public transport required')
        if hashlib.sha256(self.ca_file.read_bytes()).hexdigest() != self.ca_sha256:
            raise ValueError('public TLS trust resource changed')
        connection = self.connections.get(endpoint)
        if connection is None:
            connection = http.client.HTTPSConnection(parsed.hostname, parsed.port, timeout=seconds,
                                                     context=self.context)
            self.connections[endpoint] = connection
        else:
            connection.timeout = seconds
            if connection.sock:
                connection.sock.settimeout(seconds)
        if signal.getitimer(signal.ITIMER_REAL)[0]:
            raise ValueError('do not replace another process deadline')
        previous_handler = signal.getsignal(signal.SIGALRM)
        def expired(_signal, _frame):
            raise TimeoutError('public read deadline')
        signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, seconds)
        raw = bytearray()
        try:
            # http.client has no redirect, nack retry or result-cache layer.
            connection.request('POST', parsed.path or '/', encoded,
                               {'Content-Type': 'application/json'})
            response = connection.getresponse()
            while True:
                chunk = response.read1(min(65536, maximum_bytes + 1 - len(raw)))
                if not chunk:
                    break
                raw.extend(chunk)
                if len(raw) > maximum_bytes:
                    break
            if len(raw) > maximum_bytes:
                raise PublicReadFailure(ValueError('public response byte budget exhausted'), bytes(raw[:maximum_bytes]), 63, True)
            # A read1 EOF does not consistently mark the response closed on
            # Python 3.10. Finish it explicitly before reusing HTTPConnection.
            response.close()
            if response.will_close:
                connection.close()
                self.connections.pop(endpoint, None)
            return response.status, bytes(raw)
        except Exception as error:
            connection.close()
            self.connections.pop(endpoint, None)
            if isinstance(error, PublicReadFailure):
                raise
            partial = getattr(error, 'partial', b'')
            prefix = bytes(raw) + partial
            code = 60 if isinstance(error, ssl.SSLCertVerificationError) else 28 if isinstance(error, TimeoutError) else 56
            raise PublicReadFailure(error, prefix[:maximum_bytes], code, len(prefix)>maximum_bytes) from None
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)
