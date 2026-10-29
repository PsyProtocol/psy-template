"""Allowlisted offline publication; never package raw signing/CFC witnesses."""
from pathlib import Path
import json,gzip,hashlib,sys,shutil
case=Path(sys.argv[1]).resolve();app=Path(sys.argv[2]).resolve();out=Path(sys.argv[3]).absolute();assert not out.exists()
for label in ['full-ups-v1','reuse-v1','legacy-pair-key-v1','legacy-amm-curve-key-v1','components-v1','js-regressions-v1']:
 assert json.loads((case/'public'/f'{label}-result.json').read_text())['exitCode']==0,label
sha=lambda b:hashlib.sha256(b).hexdigest()
paths={}
def add(p,name):
 if p.is_file():
  assert name not in paths;assert 'witness.raw' not in name
  paths[name]=p
for p in sorted((case/'public').iterdir()):
 if p.is_file() and p.suffix in ['.json','.log','.txt']:add(p,'run/public/'+p.name)
for name in ['fixtures-v1','fixtures-v2','fixtures-v3','vm-v1','components-v1','full-ups-v1','reuse-v1','legacy-pair-key-v1','legacy-amm-curve-key-v1']:
 for p in sorted((case/name).rglob('*')):
  if p.is_file() and p.suffix in ['.rs','.json','.bin']:add(p,'run/'+str(p.relative_to(case)))
for version in range(1,7):
 root=case/f'application-v{version}'
 for name in ['Cargo.toml','Cargo.lock','src/stream_source.rs','src/stream_policy.rs','src/stream_context.rs','src/pair_frontier.rs','tests/support/stream_full_ups.rs','tests/support/pair_trade_full_ups.rs','tests/support/pair_stream_full_ups.rs']:
  add(root/name,f'run/builds/application-v{version}/{name}')
 add(case/f'application-v{version}-manifest.json',f'run/builds/application-v{version}-manifest.json')
for v in [5,6]:add(case/f'bin-v{v}/HASHES.json',f'run/builds/bin-v{v}-HASHES.json')
add(case/'run.py','run/run.py')
for m in ['orderbook','nftmarket']:
 r=json.loads((case/'full-ups-v1'/(m+'-REPORT.json')).read_text());assert r['fullUpsVerified'] and r['conservation'] and len(r['fills'])==2 and not r['broadcast']
replace=[]
for p,label in [(case,'<case>'),(app,'<application-root>'),(case.parent,'<evidence-root>'),(Path.home(),'<home>')]:
 for value in [str(p),str(p).replace(str(Path.home()),'<home>'),json.dumps(str(p))[1:-1]]:replace.append((value.encode(),label.encode()))
out.mkdir(parents=True);(out/'blobs').mkdir();index=[]
for name,p in sorted(paths.items()):
 raw=p.read_bytes();public=raw
 if p.suffix!='.bin':
  for a,b in replace:public=public.replace(a,b)
 digest=sha(public);packed=gzip.compress(public,compresslevel=9,mtime=0);blob=f'blobs/{digest}.gz';dest=out/blob
 if not dest.exists():dest.write_bytes(packed)
 else:assert dest.read_bytes()==packed
 index.append({'path':name,'blob':blob,'originalSha256':sha(raw),'publicSha256':digest,'compressedSha256':sha(packed),'bytes':len(public),'pathRedacted':raw!=public})
(out/'index.json').write_text(json.dumps({'schema':1,'scope':'public synthetic complete-source global matching frontier and full UPS evidence; no network or ordinary-wallet signature acceptance','records':index},indent=2)+'\n')
shutil.copy2(app/'executor/verification/2026-10-29-paired-source-refunds-v1/unpack.py',out/'unpack.py');shutil.copy2(Path(__file__),out/'package_public.py')
print(json.dumps({'artifacts':len(index),'blobs':len(list((out/'blobs').iterdir())),'compressedBytes':sum(p.stat().st_size for p in(out/'blobs').iterdir()),'financialOperations':0}))
