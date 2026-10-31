// Integrity of an offline build only. These checks never grant spending rights.
import assert from'node:assert/strict';
import{readFileSync,lstatSync,existsSync}from'node:fs';import{join,resolve}from'node:path';import{createHash}from'node:crypto';
import{validateConfig}from'../../amm/u124/build.mjs';import{PROFILE}from'../mainnet-beta/native.mjs';
export const MARKETS=Object.freeze(['amm','bondingcurve','orderbook','nftmarket']);
const profiles={amm:[5,'source-covered-priority-stream-v3'],bondingcurve:[5,'source-covered-priority-stream-v3'],orderbook:[9,'source-covered-pair-triangular-recovery-v1'],nftmarket:[9,'source-covered-pair-triangular-recovery-v1']};
export const BUILD_FILES=Object.freeze(['config.json',...['native','tokenA','tokenB','nft'].map(k=>'dependencies/'+k+'.json'),...MARKETS.flatMap(k=>[k+'/main.psy.rs',k+'/compile.log',k+'/FOREIGN_READ_AUDIT.json',k+'/compiled/compilation_artifact.json'])]);
const keys=(v,expected,label)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),label);assert.deepEqual(Object.keys(v).sort(),[...expected].sort(),label);};
const readRegular=path=>{const stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'regular immutable build file required');return readFileSync(path);};
const bytesSha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fileSha=path=>bytesSha(readRegular(path));
const digest=v=>assert.match(v,/^[0-9a-f]{64}$/,'canonical SHA256 required');
function validateHeader(m,freeze){
 assert.equal(m.schema,1,'build schema');for(const name of['sdkCommit','clientCommit','backendCommit'])assert.equal(m[name],freeze[name],'frozen '+name);
 assert.equal(m.networkMagic,'1384803358401154921');assert.match(m.chainRootAt1,/^[0-9a-f]{64}$/);assert.notEqual(m.chainRootAt1,'0'.repeat(64));assert.equal(m.nativeProtocol,PROFILE);assert.equal(m.randomMode,false);
 for(const flag of['fullUpsVerified','liveAuthorization'])assert.equal(m[flag],false,'offline build cannot certify '+flag);assert.equal(m.financialOperations,0);
 keys(m.files,BUILD_FILES,'complete exact build file inventory required');keys(m.markets,MARKETS,'complete four-market records required');
 keys(m.frozenInputs,[...['native','tokenA','tokenB','nft'].map(k=>'artifact:'+k),'compiler:stream','compiler:pair'],'complete frozen input roles required');
 for(const value of Object.values(m.frozenInputs)){assert.equal(typeof value.path,'string');assert.ok(value.path.length>0);digest(value.sha256);}
}
export function validateManifestContents(root,m,freeze,bytes){
 validateHeader(m,freeze);
 if(!bytes)bytes=new Map(BUILD_FILES.map(name=>[name,readRegular(join(root,name))]));
 for(const name of BUILD_FILES){digest(m.files[name]);assert.ok(bytes.has(name),'missing snapshotted file');assert.equal(bytesSha(bytes.get(name)),m.files[name],'changed build input '+name);}
 for(const role of['native','tokenA','tokenB','nft'])assert.equal(m.files['dependencies/'+role+'.json'],m.frozenInputs['artifact:'+role].sha256,'copied dependency identity '+role);
 const c=JSON.parse(bytes.get('config.json').toString('utf8'));validateConfig(c);assert.ok(!c.bootstrap);assert.equal(c.networkMagic,m.networkMagic);assert.ok(Number.isSafeInteger(c.nftId)&&c.nftId>=5&&c.nftId<16777216&&![c.assetA,c.assetB].includes(c.nftId));assert.ok([c.assetA,c.assetB].includes(c.tokenId));
 for(const market of MARKETS){const r=m.markets[market];assert.equal(r.policyVersion,profiles[market][0],'exact policy version');assert.equal(r.profile,profiles[market][1],'exact profile identity');assert.equal(r.marketId,null,'unassigned compiled candidate required');assert.equal(r.fullUpsVerified,false);assert.equal(r.freshVaultBootstrapAccepted,false);assert.equal(r.liveAuthorization,false);digest(r.sourceSha256);digest(r.artifactSha256);assert.equal(r.sourceSha256,m.files[market+'/main.psy.rs'],'source record/file identity');assert.equal(r.artifactSha256,m.files[market+'/compiled/compilation_artifact.json'],'artifact record/file identity');}
 return m;
}
export function loadBuildSnapshot(root,freeze,{expectedSha256}={}){
 root=resolve(root);assert.equal(existsSync(join(root,'FAILURE.json')),false,'failed build cannot be adopted');
 const manifestBytes=readRegular(join(root,'BUILD.json')),manifestSha256=bytesSha(manifestBytes);
 if(expectedSha256!==undefined){digest(expectedSha256);assert.equal(manifestSha256,expectedSha256,'unreviewed build manifest');}
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 validateHeader(manifest,freeze);
 const files=new Map(BUILD_FILES.map(name=>[name,readRegular(join(root,name))]));
 validateManifestContents(root,manifest,freeze,files);
 return {manifest,manifestSha256,files};
}
export function inspectBuild(root,freeze,options){return loadBuildSnapshot(root,freeze,options).manifest;}
