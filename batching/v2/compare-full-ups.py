"""Sequential ABBA full-UPS comparison. Fresh outputs; no chain transactions.

Use a frozen release test binary, identical artifacts/host/thread count and no
concurrent proving/build jobs. VM timings are deliberately not substituted.
"""
import argparse,hashlib,json,os,pathlib,platform,statistics,subprocess,time
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--binary',type=pathlib.Path,required=True);p.add_argument('--fixtures',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);args=p.parse_args()
args.binary=args.binary.resolve();args.fixtures=args.fixtures.resolve();args.out=args.out.absolute()
args.out.mkdir(parents=True,exist_ok=False)
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
markets=['amm','orderbook','bondingcurve','nftmarket'];profiles=['fixed40','compact-v1','compact-v1','fixed40']
inputs={'binarySha256':sha(args.binary),'preparedSha256':sha(args.fixtures/'PREPARED.json'),'artifacts':{m:sha(args.fixtures/m/'compiled/compilation_artifact.json') for m in markets},'policies':{m:sha(args.fixtures/m/'policy.json') for m in markets},'assets':{f:sha(args.fixtures/f) for f in ['native.json','token/compilation_artifact.json','nft/compilation_artifact.json']}}
plan={'schema':1,'order':profiles,'rayonThreads':4,'workers':1,'host':platform.platform(),'machine':platform.machine(),'logicalCpus':os.cpu_count(),'fillsPerMarket':2,'scope':'offline full UPS, synthetic authenticated checkpoints; two samples/profile/market; no production P95','inputs':inputs,'broadcast':False,'chainTps':None}
(args.out/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
runs=[]
for i,profile in enumerate(profiles):
 directory=args.out/f'{i+1}-{profile}';log=args.out/f'{i+1}-{profile}.log'
 env={**os.environ,'RAYON_NUM_THREADS':'4','BATCH_BUILD':str(args.fixtures),'BATCH_FULL_UPS_MARKETS':','.join(markets),'BATCH_FULL_UPS_SIZE':'2','BATCH_FULL_UPS_OUT':str(directory),'BATCH_PROOF_PROFILE':profile}
 env.pop('BATCH_ADMISSION_TEST',None)
 start=time.time();load=os.getloadavg()
 with log.open('xb') as stream:
  r=subprocess.run([str(args.binary),'full_ups_four_market_commit_and_settle_proofs','--nocapture','--test-threads=1'],env=env,stdout=stream,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError(f'failed {profile}, preserved {log}')
 run={'index':i+1,'profile':profile,'startedAtUnix':start,'wallSeconds':time.time()-start,'loadAverageAtStart':load,'logSha256':sha(log)}
 with (args.out/f'{i+1}-run.json').open('x') as f:json.dump(run,f,indent=2);f.write('\n')
 runs.append(run);print(json.dumps(run),flush=True)
# Original exact inputs must be unchanged at the end.
assert sha(args.binary)==inputs['binarySha256']
for f,h in inputs['assets'].items():assert sha(args.fixtures/f)==h
for m in markets:
 assert sha(args.fixtures/m/'compiled/compilation_artifact.json')==inputs['artifacts'][m]
 assert sha(args.fixtures/m/'policy.json')==inputs['policies'][m]
rows=[]
for m in markets:
 samples={profile:[] for profile in set(profiles)};semantic={}
 for i,profile in enumerate(profiles):
  x=json.loads((args.out/f'{i+1}-{profile}'/f'{m}.json').read_text());assert x['broadcast'] is False and x['fills']==2
  measures=[y for y in x['measurements'] if y['phase']!='cold-circuit-build'];assert [y['phase'] for y in measures]==['commit','settle']
  for y in measures:
   assert y['profile']==profile and y['fullUpsVerified'] and y['publicEndpointsBound'] and y['exportedDeltasVerified'] and not y['broadcast']
   assert y['calls']==len(y['steps'])+1 and y['burn']==1000000000+1000*y['slotsModified']
   key=y['phase'];state=(y['endStateRoot'],y['burn'],y['slotsModified']);assert key not in semantic or semantic[key]==state,(m,key,'state/fee mismatch');semantic[key]=state
   if profile=='compact-v1':assert not any(s['method']=='noop' for s in y['steps'])
  assert measures[0]['endLeaf']==measures[1]['startLeaf']
  samples[profile].append(sum(y['elapsedMs'] for y in measures))
 old=statistics.median(samples['fixed40']);new=statistics.median(samples['compact-v1'])
 rows.append({'market':m,'samplesMs':samples,'fixedMedianMs':old,'compactMedianMs':new,'reductionFraction':1-new/old,'offlineProofFillsPerSecond':{'fixed40':2000/old,'compact-v1':2000/new},'sameEndStateRootsAndFees':True})
summary={**plan,'runs':runs,'rows':rows,'productionReady':False}
with (args.out/'comparison.json').open('x') as f:json.dump(summary,f,indent=2);f.write('\n')
print(json.dumps({'comparison':str(args.out/'comparison.json'),'rows':rows}),flush=True)
