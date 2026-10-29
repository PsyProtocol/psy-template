"""Publish allowlisted public evidence. Preserve originals and exact prefix recovery."""
from pathlib import Path
import json,gzip,hashlib,sys,shutil
case=Path(sys.argv[1]).resolve();app=Path(sys.argv[2]).resolve();out=Path(sys.argv[3]).absolute();assert not out.exists()
for label in ['actual-native-full-ups-v7','executor-pair-readiness-v2','final-lib-inventory-v7','final-lib-dependency-v7','source-collector-tests-v5-correct-fixtures','independent-inventory-audit-v8','final-inventory-replay-v7']:
 assert json.loads((case/'public'/f'{label}-result.json').read_text())['exitCode']==0,label
assert json.loads((case/'inventory-v5/COMPLETE.json').read_text())['report']['completeRelativeToRoot']
sha=lambda raw:hashlib.sha256(raw).hexdigest();paths={}
def add(p,name):
 if p.is_file():
  assert name not in paths;assert not any(x in name.lower()for x in ['witness.raw','keystore','mnemonic','recovery-wallet']);paths[name]=p
for p in (case/'public').iterdir():
 if p.is_file()and p.suffix in ['.json','.log','.txt']:add(p,'run/public/'+p.name)
for stage in ['inventory-v2','inventory-v3','inventory-v4','inventory-v5']:
 root=case/stage;last=max(root.glob('verified-*.json'));add(last,'run/'+stage+'/'+last.name)
 for p in root.iterdir():
  if p.is_file()and not p.name.startswith(('transcript-','verified-')):add(p,'run/'+stage+'/'+p.name)
add(case/'inventory-v5/transcript-00575.json','run/inventory-v5/transcript-00575.json')
for stage in ['native-capture-v1','native-capture-v2','native-bound-v3','native-rejections-v1','inventory-root-rejections-v1','actual-native-full-ups-v7']:
 for p in (case/stage).rglob('*'):
  if p.is_file()and p.suffix in ['.json','.bin','.log']:add(p,'run/'+str(p.relative_to(case)))
for p in (case/'executor-pair-readiness-v2').rglob('*'):
 if p.is_file()and p.name in ['PUBLIC-SUMMARY.json','journal.jsonl']:add(p,'run/'+str(p.relative_to(case)))
for n in ['native.json','token','nft','orderbook']:
 p=case/'fixtures-captured-v1'/n
 if p.is_file():add(p,'run/fixtures-captured-v1/'+n)
 else:
  for f in p.rglob('*'):
   if f.is_file()and f.suffix in ['.json','.rs']:add(f,'run/'+str(f.relative_to(case)))
for v in range(1,9):
 add(case/f'application-v{v}-manifest.json',f'run/builds/application-v{v}-manifest.json')
 root=case/f'application-v{v}'
 for name in ['Cargo.toml','APPLICATION.json']:add(root/name,f'run/builds/application-v{v}/{name}')
 if v>=6:
  add(root/'Cargo.lock',f'run/builds/application-v{v}/Cargo.lock')
  for f in root.rglob('*.rs'):add(f,f'run/builds/application-v{v}/'+str(f.relative_to(root)))
for d in case.glob('bin-v*'):
 for p in d.glob('*HASHES.json'):add(p,'run/builds/'+d.name+'-'+p.name)
for name in ['run.py','prepare-guard-fixtures-v1.mjs']:add(case/name,'run/'+name)
for name in ['executor/finalStateStream.mjs','executor/finalStatePairReadiness.test.mjs','batching/checkpoint-stream/collect-source-inventory.py','batching/checkpoint-stream/test_collect_source_inventory.py','batching/checkpoint-stream/readiness-budget.mjs','batching/checkpoint-stream/readiness-budget.test.mjs','batching/dependencies/prepare_mainnet_beta_application.py']:add(app/name,'reviewed/'+name)
replace=[]
for p,label in [(case,'<case>'),(app,'<application-root>'),(case.parent,'<evidence-root>'),(Path.home(),'<home>')]:
 for value in [str(p),str(p).replace(str(Path.home()),'<home>'),json.dumps(str(p))[1:-1]]:replace.append((value.encode(),label.encode()))
out.mkdir(parents=True);(out/'blobs').mkdir();index=[]
for name,p in sorted(paths.items()):
 raw=p.read_bytes();public=raw
 if p.suffix!='.bin':
  for a,b in replace:public=public.replace(a,b)
 digest=sha(public);dest=out/'blobs'/(digest+'.gz')
 if not dest.exists():dest.write_bytes(gzip.compress(public,compresslevel=9,mtime=0))
 packed=dest.read_bytes();index.append({'path':name,'blob':'blobs/'+dest.name,'originalSha256':sha(raw),'publicSha256':digest,'compressedSha256':sha(packed),'bytes':len(public),'pathRedacted':raw!=public})
(out/'index.json').write_text(json.dumps({'schema':1,'scope':'Complete native dependency, checkpoint-relative account inventory, two synthetic full UPSs, durable non-authorizing Executor planning; no real trade/claim acceptance','records':index},indent=2)+'\n')
shutil.copy2(app/'executor/verification/2026-10-29-pair-triangular-recovery-v1/unpack.py',out/'unpack.py');shutil.copy2(Path(__file__),out/'package_public.py')
print(json.dumps({'artifacts':len(index),'blobs':len(list((out/'blobs').iterdir())),'compressedBytes':sum(p.stat().st_size for p in(out/'blobs').iterdir()),'financialOperations':0}))
