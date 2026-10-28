"""Package explicitly public offline evidence. Original artifacts stay untouched."""
from pathlib import Path
import gzip,hashlib,json,sys,shutil
case=Path(sys.argv[1]).resolve();app=Path(sys.argv[2]).resolve();out=Path(sys.argv[3]).absolute()
assert not out.exists(),'fresh bundle required'
sha=lambda b:hashlib.sha256(b).hexdigest()
for name in ['source-proofs-v4','source-boundary-v1','stream-full-ups-v2','key-replay-v1']:
 assert json.loads((case/'public'/f'{name}-result.json').read_text())['exitCode']==0,name
for market in ['amm','bondingcurve']:
 for version in ['full-ups-v1','full-ups-v2']:
  report=json.loads((case/version/f'{market}-REPORT.json').read_text());assert report['assetConservation'] and report['fullUpsVerified'] and not report['broadcast']
 old=json.loads((case/'full-ups-v1'/f'{market}-open/verification.json').read_text())['keyFingerprint'];new=json.loads((case/'full-ups-v2'/f'{market}-open/verification.json').read_text())['keyFingerprint'];assert old!=new
rows=[];paths={}
def add(path,label):
 if path.is_file():
  assert label not in paths,label;paths[label]=path
for path in (case/'public').iterdir():
 if path.suffix in ['.json','.log','.txt']:add(path,'run/public/'+path.name)
for name in ['fixtures-v6','fixtures-v7','fixtures-v8','fixtures-v9','source-proofs-v1','source-proofs-v2','source-proofs-v3','source-proofs-v4','source-boundary-v1','vm-v1','vm-v2','vm-v3','full-ups-v1','full-ups-v2','key-replay-v1']:
 root=case/name
 if root.exists():
  for path in sorted(root.rglob('*')):
   if path.is_file() and path.suffix in ['.json','.bin','.rs']:add(path,'run/'+str(path.relative_to(case)))
for path in sorted(case.glob('application-v*-manifest.json')):add(path,'run/builds/'+path.name)
for n in [5,15,18,20]:
 for name in ['Cargo.toml','Cargo.lock','src/bin/compile_stream_market.rs','src/stream_source.rs','tests/support/stream_full_ups.rs']:
  add(case/f'application-v{n}'/name,f'run/builds/application-v{n}/{name}')
add(case/'run.py','run/run.py')
out.mkdir(parents=True);(out/'blobs').mkdir();replacements=[]
for path,label in [(case,'<case>'),(app,'<application-root>'),(case.parent,'<evidence-root>'),(Path.home(),'<home>')]:
 value=str(path)
 for encoded in [value,value.replace(str(Path.home()),'<home>'),json.dumps(value)[1:-1]]:
  replacements.append((encoded.encode(),label.encode()))
for label,path in sorted(paths.items()):
 original=path.read_bytes();data=original
 if path.suffix!='.bin':
  for a,b in replacements:data=data.replace(a,b)
 digest=sha(data);blob=f'blobs/{digest}.gz';compressed=gzip.compress(data,compresslevel=9,mtime=0)
 destination=out/blob
 if not destination.exists():destination.write_bytes(compressed)
 else:assert destination.read_bytes()==compressed
 rows.append({'path':label,'blob':blob,'originalSha256':sha(original),'publicSha256':digest,'compressedSha256':sha(compressed),'bytes':len(data),'pathRedacted':data!=original})
index={'schema':1,'scope':'public synthetic checkpoint source-covered market stream evidence; final-key UPSs separated from pre-boundary-fix trials; no network or financial acceptance','records':rows}
(out/'index.json').write_text(json.dumps(index,indent=2)+'\n')
shutil.copy2(app/'executor/verification/2026-10-29-final-state-coverage-v1/unpack.py',out/'unpack.py')
shutil.copy2(Path(__file__),out/'package_public.py')
print(json.dumps({'artifacts':len(rows),'blobs':len(list((out/'blobs').iterdir())),'compressedBytes':sum(p.stat().st_size for p in (out/'blobs').iterdir()),'financialOperations':0}))
