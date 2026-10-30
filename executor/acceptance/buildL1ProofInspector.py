"""Build a read-only inspector from existing frozen-lock Cargo artifacts.

No manifest, lockfile, SDK, Node source, dependency version or service changes.
The compiler artifact stream selects exact library identities; arbitrary rlib
paths and resources supplied by a DApp are not accepted.
"""
import argparse,hashlib,json,os,pathlib,re,subprocess

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def build(manifest,out,target,artifact_stream=None,artifact_sha256=None,profile='l1-inclusion-v1'):
    manifest=manifest.resolve();target=target.resolve();out=out.absolute()
    assert not out.exists(),'fresh inspector output required'
    application=json.loads((manifest.parent/'APPLICATION.json').read_bytes())
    assert application['sdkCommit']=='c92880c8b6e2c8d392f19368bc8801a2584fd427'
    expected_lock=pathlib.Path(__file__).resolve().parents[2]/'amm/u124/vm-tests/Cargo.lock'
    lock=manifest.with_name('Cargo.lock');assert sha(lock)==sha(expected_lock),'frozen lock differs'
    lock_sha=sha(lock)
    packages={}
    for section in lock.read_text().split('[[package]]')[1:]:
        name=re.search(r'^name = "([^"]+)"',section,re.M)
        version=re.search(r'^version = "([^"]+)"',section,re.M)
        if name and version:packages.setdefault(name[1],set()).add(version[1])
    profiles={
        'l1-inclusion-v1':('l1ProofInspector.rs','l1-proof-inspector',['alloy-primitives','alloy-rlp','alloy-trie','serde','serde_json','sha2','anyhow']),
        'gloas-certificate-v1':('gloasCertificateInspector.rs','gloas-certificate-inspector',['blst','serde','serde_json','sha2','anyhow']),
    }
    assert profile in profiles,'explicit fixed inspector profile required'
    source_name,binary_name,required=profiles[profile]
    assert all(len(packages[n])==1 for n in required),'ambiguous library versions'
    env=os.environ.copy();env['CARGO_TARGET_DIR']=str(target)
    out.mkdir(mode=0o700)
    if artifact_stream is None:
        assert artifact_sha256 is None
        args=['cargo','+nightly-2025-09-20','build','--offline','--locked','--release','--manifest-path',str(manifest),'--lib','--message-format=json']
        with(out/'cargo-artifacts.jsonl').open('xb')as stdout,(out/'cargo-stderr.log').open('xb')as stderr:
            subprocess.run(args,env=env,stdout=stdout,stderr=stderr,check=True)
    else:
        assert artifact_sha256 and not artifact_stream.is_symlink()
        assert artifact_stream.stat().st_size<=33_554_432 and sha(artifact_stream)==artifact_sha256,'reviewed exact artifact stream required'
        with(out/'cargo-artifacts.jsonl').open('xb')as stream:stream.write(artifact_stream.read_bytes())
    artifacts={}
    for line in (out/'cargo-artifacts.jsonl').read_text().splitlines():
        v=json.loads(line)
        if v.get('reason')!='compiler-artifact':continue
        # Host proc-macro/build dependencies may have the same package/version
        # with opt-level 0. Select only the unique frozen release-target library.
        if v.get('profile',{}).get('opt_level')!='3' or v.get('profile',{}).get('test'):continue
        for name in required:
            version=next(iter(packages[name]))
            if not v['package_id'].endswith('#'+name+'@'+version):continue
            crate=name.replace('-','_')
            if v['target']['name']!=crate:continue
            files=[pathlib.Path(f)for f in v['filenames']if f.endswith('.rlib')]
            assert len(files)==1 and name not in artifacts,'unique selected library required'
            path=files[0].resolve();assert path.parent==target/'release/deps' and not files[0].is_symlink(),'artifact escaped frozen target'
            artifacts[name]={'crate':crate,'version':version,'path':path,'sha256':sha(path),'packageId':v['package_id']}
    assert set(artifacts)==set(required),'complete frozen library closure required'
    source=pathlib.Path(__file__).with_name(source_name).resolve();source_sha=sha(source)
    compiler=['rustc','+nightly-2025-09-20','--edition=2021','-C','opt-level=2','-L','dependency='+str(target/'release/deps')]
    for name in required:compiler+=['--extern',artifacts[name]['crate']+'='+str(artifacts[name]['path'])]
    for label,extra in [(binary_name,[]),(binary_name+'-tests',['--test'])]:
        with(out/(label+'-compiler.log')).open('xb')as log:
            subprocess.run(compiler+extra+[str(source),'-o',str(out/label)],env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
        (out/label).chmod(0o500)
    assert sha(lock)==lock_sha and sha(expected_lock)==lock_sha and sha(source)==source_sha
    for a in artifacts.values():assert sha(a['path'])==a['sha256'],'library changed during build'
    report={'schema':1,'kind':'frozen-lock-l1-evidence-inspector-build-v1','profile':profile,'sdkCommit':application['sdkCommit'],'cargoLockSha256':lock_sha,'sourceSha256':source_sha,'libraries':{k:{f:str(v)if isinstance(v,pathlib.Path)else v for f,v in a.items()}for k,a in artifacts.items()},'binarySha256':sha(out/binary_name),'testBinarySha256':sha(out/(binary_name+'-tests')),'dependencyVersionsChanged':False,'manifestOrLockChanged':False,'cargoArtifactStreamReused':artifact_stream is not None,'cargoArtifactStreamSha256':sha(out/'cargo-artifacts.jsonl'),'nativeBuildCommands':3 if artifact_stream is None else 2,'financialOperations':0,'proofsGenerated':0}
    with(out/'BUILD.json').open('x')as f:json.dump(report,f,indent=2);f.write('\n')
    print(json.dumps({k:report[k]for k in ['binarySha256','testBinarySha256','dependencyVersionsChanged','nativeBuildCommands']}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--target',type=pathlib.Path,required=True);p.add_argument('--artifact-stream',type=pathlib.Path);p.add_argument('--artifact-sha256');p.add_argument('--profile',default='l1-inclusion-v1');a=p.parse_args();build(a.manifest,a.out,a.target,a.artifact_stream,a.artifact_sha256,a.profile)
