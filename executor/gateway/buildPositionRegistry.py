"""Freeze existing QA read-only identities. Never deploy, overwrite or bless writes."""
import argparse,json,hashlib,pathlib
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();base=a.source.resolve();out=a.out.resolve();assert not out.exists()
root=pathlib.Path(__file__).resolve().parents[2];sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_bytes());encode=lambda x:(json.dumps(x,sort_keys=True,separators=(',',':'))+'\n').encode()
prior=read(root/'market-client/reviewed/staging-qa-20261026-account-v2/registry.json');case=read(base/'public/CASE.json');assert case['sdkManifestSha256']==prior['sdkManifestSha256']
pending={};sources={};markets=[];bound_flags={}
def put(name,data,source):
 raw=encode(data);pending[name]=raw;sources[name]={'source':str(source.relative_to(base)),'sha256':sha(source.read_bytes())};return sha(raw)
for kind in ['orderbook','bondingcurve','nftmarket']:
 folder=base/'markets-v1'/kind;reg=read(folder/'live-registration.json');build=read(folder/'BUILD.json');bound=read(folder/'bound/BOUND.json')
 for name,digest in build['files'].items():assert sha((folder/name).read_bytes())==digest,name
 assert sha((folder/'BUILD.json').read_bytes())==bound['buildManifestSha256'];assert sha((folder/'bound/policy.json').read_bytes())==bound['policySha256']
 assert reg['coordinatorMappingVerified'] and reg['indexedReceiptVerified'];assert reg['receipt']['success'];assert 0<reg['event']['included_checkpoint_id']<=reg['checkpoint'];assert reg['event']['result']=={'public_key':reg['publicKeyHash'],'user_id':reg['vaultId']}
 # BOUND is a pre-registration artifact. Preserve its false flags rather than
 # treating them as a live attestation; current identity must be read again.
 bound_flags[kind]={k:bound[k] for k in ['registrationVerified','onChainRootsVerified','broadcast']}
 mid=reg['marketId'];abi=read(folder/'compiled/compilation_artifact.json')['abi'];abi_hash=put(f'{mid}-abi.json',abi,folder/'compiled/compilation_artifact.json');cfg=read(folder/'config.json');assert int(cfg['networkMagic'])==int(prior['network']['magic'],0)
 put(f'{mid}-config.json',cfg,folder/'config.json');put(f'{mid}-registration.json',reg,folder/'live-registration.json');put(f'{mid}-policy.json',read(folder/'bound/policy.json'),folder/'bound/policy.json')
 assets=[dict(x) for x in prior['markets'][0]['assets'] if x['contractId'] in [d['contract']['contractId'] for d in reg['contracts']]]
 for asset in assets:
  name='token-a.json' if asset['contractId']==2483 else 'token-b.json';asset['abiSha256']=put(f'{mid}-asset-{asset["contractId"]}-abi.json',read(folder/name)['abi'],folder/name)
 market={'marketId':mid,'vaultId':reg['vaultId'],'kind':kind,'publicKeyHash':reg['publicKeyHash'],'fingerprint':reg['fingerprint'],'dependencies':reg['contracts'],'assets':assets,'abiSha256':abi_hash,'config':cfg}
 if kind=='nftmarket':market['nftId']=cfg['nftId'];market['nftAbiSha256']=put(f'{mid}-nft-abi.json',read(folder/'nft.json')['abi'],folder/'nft.json')
 markets.append(market)
registry={'schema':1,'scope':'Existing isolated QA instances; read-only RPC observations, not proof or authorization','sdkManifestSha256':prior['sdkManifestSha256'],'network':prior['network'],'markets':markets};raw=encode(registry);rh=sha(raw[:-1]);out.mkdir(parents=True)
for name,raw_file in pending.items():
 with (out/name).open('xb') as f:f.write(raw_file)
for name,data in {'registry.json':registry,'client-pin.json':{'registrySha256':rh},'artifacts.json':{name:sha(raw) for name,raw in pending.items()},'PROVENANCE.json':{'schema':1,'sourceDirectory':str(base),'sources':sources,'buildManifestHashesMatched':True,'registrationEvidenceFieldsMatched':True,'sourceBoundFlags':bound_flags,'freshChainIdentityVerified':False,'financialAuthorization':False,'oldContractUpdates':False}}.items():
 with (out/name).open('xb') as f:f.write(encode(data))
print(json.dumps({'registrySha256':rh,'markets':[(m['kind'],m['marketId'],m['vaultId']) for m in markets],'files':len(pending)}))
