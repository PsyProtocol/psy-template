"""Archive an explicit public-only random-stream case into a fresh review bundle.

This does not discover wallets, export witnesses, verify cryptographic proofs,
change source artifacts or authorize a financial operation.
"""
import argparse,gzip,hashlib,json
from pathlib import Path

STAGE_FILES={'source.json','current.json','intent.json','plan.json','request.json','public-session.json','verification.json','key-proof.bin'}
FORBIDDEN={'private_key','privateKey','secret_key','secretKey','mnemonic','recoveryPhrase','signing_witness','signature_witness','cfc_witness','secp256k1_slots'}
def sha(b):return hashlib.sha256(b).hexdigest()
def scan(v):
    if isinstance(v,dict):
        assert not (set(v)&FORBIDDEN),'secret-bearing field in public projection'
        for x in v.values():scan(x)
    elif isinstance(v,list):
        for x in v:scan(x)
def archive(case,out,application):
    case=case.resolve();out=out.absolute()
    assert not out.exists() and not out.is_symlink(),'fresh output required'
    files=set(p for p in(case/'public').rglob('*')if p.is_file())
    for version in ['v1','v2','v3']:
        base=case/('full-ups-'+version)
        for stage in base.iterdir():
            if stage.is_dir():
                files.update(p for p in stage.iterdir()if p.name in STAGE_FILES)
            elif stage.name.endswith('-REPORT.json'):files.add(stage)
    for version in ['v1','v3','v4']:
        base=case/('application-'+version)
        files.update(base/n for n in ['APPLICATION.json','Cargo.toml','Cargo.lock']if(base/n).exists())
    # All four candidate identities and both failed prefixes are retained.
    for version in ['v1','v2','v3','v4']:
        base=case/('fixtures-'+version)
        if not base.exists():continue
        for m in ['amm','bondingcurve']:
            files.update(base/m/n for n in ['main.psy.rs','config.json','policy.json','stream-policy.json','compile.log','compiled/compilation_artifact.json']if(base/m/n).exists())
    files.update(p for p in(case/'fixtures-v4').rglob('*')if p.is_file()and p.relative_to(case/'fixtures-v4').parts[0]in {'native.json','token','token-b','nft'})
    for name in ['native-planner-v1','native-planner-curve-v1','native-attacks-v1']:
        files.update(p for p in(case/name).rglob('*.json')if p.is_file())
    files.update(case/n for n in ['run.py','prepare_native_planner_v1.py','prepare_native_planner_curve_v1.py','native_attacks_v1.py','native-route-v1.mjs','native-route-v2.mjs','native-route-v3.mjs','native-route-curve-v1.mjs','native-route-curve-v2.mjs','native-route-crash-v1.mjs','native-route-crash-v2.mjs']if(case/n).exists())
    files.update(p for p in(case/'bytecode-v1').rglob('*.json')if p.is_file())
    files.add(case/'historical-cfc-v1/REPORT.json');files.add(case/'historical-cfc-v1/proof.bin')
    replay=case/'saved-key-replay-v1'
    if replay.exists():files.update(replay.glob('*.json'))
    replay=case/'legacy-key-compat-v1'
    if replay.exists():files.update(replay.glob('*.json'))
    out.mkdir(parents=True);index=[]
    replacements=[(str(case),'<case-root>'),(str(application.resolve()),'<application-root>'),(str(case.parent),'<evidence-root>'),(str(Path.home()),'<home>')]
    for p in sorted(files):
        assert p.is_file() and not p.is_symlink(),p
        name=p.relative_to(case).as_posix();raw=p.read_bytes();public=raw
        if p.suffix!='.bin':
            text=raw.decode('utf-8')
            for old,new in replacements:text=text.replace(old,new)
            public=text.encode()
            if p.suffix=='.json':scan(json.loads(public))
        zipped=gzip.compress(public,mtime=0);dest=out/'files'/(name+'.gz');dest.parent.mkdir(parents=True,exist_ok=True)
        with dest.open('xb')as f:f.write(zipped)
        assert gzip.decompress(dest.read_bytes())==public
        index.append({'source':name,'file':dest.relative_to(out).as_posix(),'originalSha256':sha(raw),'publicSha256':sha(public),'gzipSha256':sha(zipped),'originalBytes':len(raw),'publicBytes':len(public),'gzipBytes':len(zipped),'redacted':raw!=public})
    for name,v in [('index.json',index),('PUBLISHED-AUDIT.json',{'files':len(index),'gzipBytes':sum(v['gzipBytes']for v in index),'allDigestsVerified':True,'explicitProjectionFieldScanPassed':True,'rawWitnessesIncluded':False,'financialOperations':0})]:
        with(out/name).open('x')as f:json.dump(v,f,indent=2);f.write('\n')
    return len(index)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('case',type=Path);p.add_argument('fresh_output',type=Path);p.add_argument('--application',type=Path,required=True);a=p.parse_args();print(archive(a.case,a.fresh_output,a.application))
