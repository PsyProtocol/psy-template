"""Check/reconstruct original inventory-prefix bytes after unpack.py; no RPC/funds."""
from pathlib import Path
import hashlib,json,sys
out=Path(sys.argv[1]).absolute()
check_only='--check-only' in sys.argv[2:]
meta=json.loads((out/'run/public/INVENTORY-PREFIX-RECONSTRUCTION-v1.json').read_text())
final=json.loads((out/meta['finalTranscript']).read_text());count=0
for row in meta['records']:
 relative=Path(row['path']);assert not relative.is_absolute()and '..'not in relative.parts
 value=dict(final);value['proofs']=final['proofs'][:row['proofCount']]
 raw=(json.dumps(value,indent=2)+'\n').encode();assert hashlib.sha256(raw).hexdigest()==row['sha256']
 target=out/relative
 if target.exists():assert target.read_bytes()==raw,'existing prefix differs; never overwrite'
 elif not check_only:
  target.parent.mkdir(parents=True,exist_ok=True)
  with target.open('xb')as f:f.write(raw)
 count+=1
print(json.dumps({'exactOriginalPrefixesVerified':count,'written':not check_only,'financialOperations':0}))
