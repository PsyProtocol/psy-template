"""Verify and unpack public evidence into a fresh directory; no network or funds."""
from pathlib import Path
import gzip
import hashlib
import json
import sys
base = Path(__file__).resolve().parent
out = Path(sys.argv[1]).absolute()
assert not out.exists(), "fresh output required"
index = json.loads((base / 'index.json').read_text())
verified = set()
for record in index['records']:
    relative = Path(record['path'])
    blob = Path(record['blob'])
    assert not relative.is_absolute() and '..' not in relative.parts
    assert not blob.is_absolute() and '..' not in blob.parts
    assert record['path'] not in verified, 'duplicate output'
    verified.add(record['path'])
    compressed = (base / blob).read_bytes()
    assert hashlib.sha256(compressed).hexdigest() == record['compressedSha256']
    data = gzip.decompress(compressed)
    assert len(data) == record['bytes']
    assert hashlib.sha256(data).hexdigest() == record['publicSha256']
    path = out / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(data)
print(json.dumps({'verifiedArtifacts': len(verified), 'financialOperations': 0}))
