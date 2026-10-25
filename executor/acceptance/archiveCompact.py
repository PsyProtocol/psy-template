"""Archive the public formal Executor run, excluding keys and sealed binaries.
Fresh destination; exact original and compressed hashes; never edits the run.
"""
import argparse,gzip,hashlib,json,pathlib,platform,re
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--base',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True)
p.add_argument('--select',action='append',help='archive a completed relative file/directory only; repeat to preserve a partial milestone without snapshotting active work')
a=p.parse_args();base=a.base.resolve();out=a.out.resolve();assert not out.exists()
paths=[]
for name in (a.select or ['public','attempts','runtime','markets-v1']):
 relative=pathlib.Path(name);assert not relative.is_absolute() and '..' not in relative.parts,'selection must stay under the original run'
 selected=base/relative;assert selected.exists() and selected.resolve().is_relative_to(base),'selected original missing or outside run'
 for f in ([selected] if selected.is_file() else sorted(selected.rglob('*'))):
  assert not f.is_symlink(),'symlink evidence forbidden'
  if not f.is_file() or f.suffix not in ['.json','.jsonl','.log','.body','.rs','.mjs','.py','.txt','.toml','.lock']:continue
  assert '.secrets' not in f.parts
  if 'drivers' in f.relative_to(base).parts:continue
  paths.append(f)
if not a.select:paths+=sorted(base.glob('*.log'))
paths=sorted(set(paths))
def check(x):
 if isinstance(x,dict):
  for k,v in x.items():
   assert not re.fullmatch(r'private_?key|mnemonic|password|seed_?phrase|recovery_?file|wallet_?recovery|secret',k,re.I),'wallet material forbidden'
   check(v)
 elif isinstance(x,list):
  for v in x:check(v)
for f in paths:
 if f.suffix=='.json':check(json.loads(f.read_bytes()))
 if f.suffix=='.jsonl':
  for line in f.read_bytes().splitlines():
   if line.strip():check(json.loads(line))
out.mkdir(parents=True,exist_ok=False);sha=lambda b:hashlib.sha256(b).hexdigest();records=[]
for f in paths:
 raw=f.read_bytes();packed=gzip.compress(raw,compresslevel=9,mtime=0);relative=f.relative_to(base);dest=out/'files'/(str(relative)+'.gz');dest.parent.mkdir(parents=True,exist_ok=True)
 with dest.open('xb') as stream:stream.write(packed)
 records.append({'source':str(relative),'file':str(dest.relative_to(out)),'bytes':len(raw),'sha256':sha(raw),'gzipBytes':len(packed),'gzipSha256':sha(packed)})
with (out/'manifest.json').open('x') as f:json.dump({'schema':1,'sourceDirectory':str(base),'machine':platform.node(),'host':platform.platform(),'scope':'public formal Executor run including failures; success requires exact included receipt','walletFilesIncluded':False,'sealedBinariesIncluded':False,'records':records},f,indent=2);f.write('\n')
print(json.dumps({'files':len(records),'gzipBytes':sum(r['gzipBytes'] for r in records)}))
