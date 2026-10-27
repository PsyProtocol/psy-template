"""Materialize a verifier against frozen mainnet-beta sources and public keys.

No SDK/Node checkout or source patch; no wallet, network, signing or broadcast.
The runtime verifier pack is compiled in, never accepted from an RPC or page.
"""
import argparse,hashlib,json,shutil,sys,subprocess,os,re
from pathlib import Path
APP=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(APP/'batching/dependencies'))
from materialize_mainnet_beta import FREEZE,verify
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True)
p.add_argument('--pack',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args();source=a.source.resolve();out=a.out.resolve()
assert not out.exists(),'fresh verifier build required'
manifest=json.loads((FREEZE/'manifest.json').read_text())
for pin in manifest['sourcePins']:verify(source/pin['path'],pin)
pack=a.pack.read_bytes();keys=json.loads(pack)
assert keys['schema']==1 and keys['network_magic']==1384803358401154921
assert keys['sdk_manifest']==hashlib.sha256((FREEZE/'manifest.json').read_bytes()).hexdigest()
assert keys['contracts'],'empty method resources forbidden'
files={'Cargo.toml':Path(__file__).with_name('Cargo.toml'),'src/lib.rs':Path(__file__).with_name('src')/'lib.rs','src/verification.rs':APP/'amm/u124/vm-tests/src/wallet_verification.rs'}
out.mkdir();hashes={}
for name,path in files.items():
 raw=path.read_bytes();hashes[str(path.relative_to(APP))]=hashlib.sha256(raw).hexdigest()
 if name=='Cargo.toml':raw=raw.replace(b'../../../../psy-node/',(str(source/'psy-node')+'/').encode())
 target=out/name;target.parent.mkdir(exist_ok=True);target.write_bytes(raw)
(out/'src/verifiers.json').write_bytes(pack)
# Use the selected dependency graph as the resolver seed; record any root-only
# lockfile changes and reject dependency-version drift before acceptance.
shutil.copyfile(APP/'amm/u124/vm-tests/Cargo.lock',out/'Cargo.lock')
# Preserve the selected graph while resolving only this new root package.
# `generate-lockfile` intentionally is not used: it upgrades compatible crates.
env=dict(os.environ,PSY_NETWORK='testnet',PSY_CONFIG_PATH=str(source/'psy-sdk/psy-genesis/config.json'))
with (out/'resolve.log').open('x') as log:
 subprocess.run(['cargo','+nightly-2025-09-20','metadata','--offline','--format-version','1','--manifest-path',str(out/'Cargo.toml')],env=env,stdout=subprocess.DEVNULL,stderr=log,check=True)
def packages(path):
 result=set()
 for block in path.read_text().split('[[package]]')[1:]:
  fields=dict(re.findall(r'^([a-z]+) = "([^"\n]*)"$',block,re.M))
  result.add((fields['name'],fields['version'],fields.get('source','')))
 return result
added=packages(out/'Cargo.lock')-packages(APP/'amm/u124/vm-tests/Cargo.lock')
assert added=={('psy-market-wallet-verifier','0.1.0','')},'selected SDK dependency graph changed'
(out/'DEPENDENCY-CHECK.json').write_text(json.dumps({'sourceDependencyVersionsUnchanged':True,'rootOnly':sorted(added),'lockSha256':hashlib.sha256((out/'Cargo.lock').read_bytes()).hexdigest()},indent=2)+'\n')
(out/'BUILD-INPUTS.json').write_text(json.dumps({'schema':1,'sdkCommit':manifest['sdkCommit'],'sourceSha256':hashes,'verifierPackSha256':hashlib.sha256(pack).hexdigest(),'nodeOrSdkPatches':[],'broadcast':False},indent=2)+'\n')
print(out)
