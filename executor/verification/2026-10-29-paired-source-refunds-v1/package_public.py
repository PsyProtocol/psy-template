"""Package allowlisted public synthetic artifacts; original evidence is immutable."""
from pathlib import Path
import gzip,hashlib,json,sys,shutil
case=Path(sys.argv[1]).resolve();app=Path(sys.argv[2]).resolve();out=Path(sys.argv[3]).absolute()
assert not out.exists(), 'fresh bundle required'
for name in ['full-ups-v10','pair-reuse-v1','pair-key-replay-v1','baseline-key-replay-v1','split-recovery-v1','js-regression-v6']:
    assert json.loads((case/'public'/f'{name}-result.json').read_text())['exitCode']==0,name
sha=lambda b:hashlib.sha256(b).hexdigest()
paths={}
def add(p,label):
    if p.is_file():
        assert label not in paths,label
        paths[label]=p
for p in sorted((case/'public').iterdir()):
    if p.suffix in ['.json','.log','.txt']:add(p,'run/public/'+p.name)
for name in [*(f'fixtures-v{i}' for i in range(1,11)),*(f'full-ups-v{i}' for i in range(1,11)),'final-ups-v1','pair-reuse-v1','pair-key-replay-v1','baseline-key-replay-v1']:
    root=case/name
    if root.exists():
        for p in sorted(root.rglob('*')):
            if p.is_file() and p.suffix in ['.json','.bin','.rs']:add(p,'run/'+str(p.relative_to(case)))
for p in sorted(case.glob('application-v*-manifest.json')):add(p,'run/builds/'+p.name)
for version in range(1,17):
    root=case/f'application-v{version}'
    for name in ['Cargo.toml','Cargo.lock','src/final_state_coverage.rs','src/final_state_capture.rs','src/stream_source.rs','src/stream_policy.rs','src/stream_context.rs','src/bin/compile_pair_stream_market.rs','tests/support/stream_full_ups.rs','tests/support/pair_stream_full_ups.rs']:
        add(root/name,f'run/builds/application-v{version}/{name}')
for version in [3,5,6,11,12,13,14,15,16]:add(case/f'bin-v{version}/HASHES.json',f'run/builds/bin-v{version}-HASHES.json')
add(case/'run.py','run/run.py')
add(case/'merge_public.py','run/merge_public.py')
add(case/'summarize_public.py','run/summarize_public.py')
for name in ['recovery-cfc-v1','recovery-cfc-v2']:
    # Explicit public projection: never package raw CFC witnesses.
    add(case/name/'RESULT.json',f'run/{name}/RESULT.json')
    add(case/name/'definition.json',f'run/{name}/definition.json')
for market in ['orderbook','nftmarket']:
    report=json.loads((case/'final-ups-v1'/f'{market}-REPORT.json').read_text())
    assert report['fullUpsVerified'] and report['assetConservation'] and report['fills']==0 and not report['broadcast'] and not report['tradingEnabled']
index=[];out.mkdir(parents=True);(out/'blobs').mkdir()
replace=[]
for p,label in [(case,'<case>'),(app,'<application-root>'),(case.parent,'<evidence-root>'),(Path.home(),'<home>')]:
    for value in [str(p),str(p).replace(str(Path.home()),'<home>'),json.dumps(str(p))[1:-1]]:replace.append((value.encode(),label.encode()))
for label,p in sorted(paths.items()):
    raw=p.read_bytes();public=raw
    if p.suffix!='.bin':
        for a,b in replace:public=public.replace(a,b)
    digest=sha(public);blob=f'blobs/{digest}.gz';packed=gzip.compress(public,compresslevel=9,mtime=0)
    dest=out/blob
    if not dest.exists():dest.write_bytes(packed)
    else:assert dest.read_bytes()==packed
    index.append({'path':label,'blob':blob,'originalSha256':sha(raw),'publicSha256':digest,'compressedSha256':sha(packed),'bytes':len(public),'pathRedacted':raw!=public})
(out/'index.json').write_text(json.dumps({'schema':1,'scope':'public synthetic paired source coverage and terminal refund proofs; no live trading, ordinary wallet signatures or broadcasts','records':index},indent=2)+'\n')
shutil.copy2(app/'executor/verification/2026-10-29-source-covered-stream-ups-v1/unpack.py',out/'unpack.py');shutil.copy2(Path(__file__),out/'package_public.py')
print(json.dumps({'artifacts':len(index),'blobs':len(list((out/'blobs').iterdir())),'compressedBytes':sum(p.stat().st_size for p in(out/'blobs').iterdir()),'financialOperations':0}))
