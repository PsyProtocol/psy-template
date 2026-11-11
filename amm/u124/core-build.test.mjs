import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {makeCorePolicy} from './core-build.mjs';
const root = process.env.CORE_AMM_BUILD;
assert.ok(root, 'fresh compiled AMM candidate required');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const build = read('BUILD.json'), config = read('amm/config.json');
const artifact = read('amm/compiled/compilation_artifact.json'), token = read('token/compilation_artifact.json');
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

test('Native and U124 dependency bytecode retains every original u64 exactly', () => {
  for (const [path, role] of [['native.json','native'],['token/compilation_artifact.json','tokenA'],
    ['token-b/compilation_artifact.json','tokenB']]) assert.equal(hash(path), build.inputs[role].sha256);
});
test('basic AMM uses selected orders and current native calls without a global scan', () => {
  const p = makeCorePolicy(build.declaredMarketId, config, artifact, token, build.chainRootAt1);
  assert.equal(p.version, 2); assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.whole_market_completeness, false); assert.equal(p.qualified_randomness, false);
  const ids = new Set();
  const visit = v => {if (!v || typeof v !== 'object') return;
    if (Object.hasOwn(v, 'contract_id')) {ids.add(v.contract_id);
      if(v.contract_id === 0) assert.ok(['claim','transfer','burn'].includes(v.method_name));}
    for(const child of Object.values(v)) visit(child);}; visit(p);
  assert.deepEqual([...ids].sort((a,b)=>a-b), [0,config.assetA,config.assetB,build.declaredMarketId].sort((a,b)=>a-b));
  const names = artifact.abi.contract.methods.map(m=>m.name);
  assert.ok(!names.some(n=>n.includes('source') || n.includes('admission') || n.includes('scan')));
});
test('no random mode, asset alias or incorrect network can enter the deterministic build', () => {
  for(const change of [{ordering:'random'},{seed:'1'},{networkMagic:'1'}, {assetB:config.assetA}])
    assert.throws(()=>makeCorePolicy(build.declaredMarketId,{...config,...change},artifact,token,build.chainRootAt1));
  assert.throws(()=>makeCorePolicy(config.assetA,config,artifact,token,build.chainRootAt1));
  assert.throws(()=>makeCorePolicy(build.declaredMarketId,config,artifact,token));
});
