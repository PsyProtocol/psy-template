"""Archive public isolated acceptance inputs verbatim; never include wallet files.

Fresh destination only. Gzip mtime is fixed; manifest hashes both original and
compressed bytes. This does not overwrite the source or previous evidence.
"""
import argparse,gzip,hashlib,json,pathlib,platform,re
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--base',type=pathlib.Path,required=True)
p.add_argument('--out',type=pathlib.Path,required=True)
a=p.parse_args();base=a.base.resolve();out=a.out.resolve()
assert not out.exists(),'fresh evidence destination required'
allowed=['public','attempts','assets-bob-v1','markets-v1']
sources=[]
for directory in allowed:
    for path in sorted((base/directory).rglob('*')):
        assert not path.is_symlink(),'symlink evidence forbidden'
        if path.is_file() and path.suffix in ['.json','.rs','.mjs','.py','.txt','.log','.body']:
            assert '.secrets' not in path.parts
            sources.append(path)
# Logs produced by these isolated clients contain public identities only.
sources+=sorted(base.glob('*.log'))
for path in sources:
    if path.suffix!='.json':continue
    value=json.loads(path.read_bytes())
    def check(x):
        if isinstance(x,dict):
            for k,v in x.items():
                assert not re.fullmatch(r'private_?key|mnemonic|password|seed_?phrase|recovery_?file|wallet_?recovery|secret',k,re.I),'wallet material field in '+str(path)
                check(v)
        elif isinstance(x,list):
            for v in x:check(v)
    check(value)
out.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
records=[]
for path in sources:
    relative=path.relative_to(base);raw=path.read_bytes();compressed=gzip.compress(raw,compresslevel=9,mtime=0)
    target=out/'files'/(str(relative)+'.gz');target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('xb') as f:f.write(compressed)
    records.append({'source':str(relative),'file':str(target.relative_to(out)),'bytes':len(raw),'sha256':sha(raw),'gzipBytes':len(compressed),'gzipSha256':sha(compressed)})
manifest={'schema':1,'scope':'public isolated testnet evidence; includes failed and unresolved attempts, not all files are successes','sourceDirectory':str(base),'machine':platform.node(),'host':platform.platform(),'walletFilesIncluded':False,'records':records}
with (out/'manifest.json').open('x') as f:json.dump(manifest,f,indent=2);f.write('\n')
with (out/'README.txt').open('x') as f:f.write('Public requests, receipts, code and proofs. Original files remain at sourceDirectory.\nEach files/*.gz decompresses to the exact source bytes; verify both SHA256 values in manifest.json.\nAn RPC acknowledgement is not inclusion. See included.json, historical leaf evidence, state and conservation reports.\nFailed attempts and old pending observations are retained; read the final review matrix before drawing conclusions.\nNo wallet private keys, mnemonics or recovery files are included.\n')
print(json.dumps({'files':len(records),'bytes':sum(r['bytes'] for r in records),'gzipBytes':sum(r['gzipBytes'] for r in records)}))
