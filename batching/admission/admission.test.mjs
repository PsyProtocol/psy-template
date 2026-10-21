import test from 'node:test';import assert from 'node:assert/strict';
import {generateAdmission} from './generate.mjs';
import {fixture} from '../../amm/u124/generate.mjs';
test('unavailable authenticated randomness fails closed',()=>{
 for(const ordering of ['random','seeded','executor-random'])assert.throws(()=>generateAdmission('amm',{...fixture,networkMagic:'1',ordering}),/deterministic only/);
 for(const key of ['seed','randomSeed','randomSource'])assert.throws(()=>generateAdmission('amm',{...fixture,networkMagic:'1',[key]:null}),/not attested/);
});
test('all four candidates explicitly bind accepted scope and terminal dispositions',()=>{
 for(const market of ['amm','orderbook','bondingcurve','nftmarket']){
  const c=market==='nftmarket'?{nftId:41,tokenId:42,networkMagic:'1'}:{...fixture,networkMagic:'1'};const s=generateAdmission(market,c);
  for(const text of ['authenticated admission consent','admission omission or substitution','admitted order terms changed','admission_scope_root','admission_scope_epoch','missing admitted disposition','only expired empty queue may abort','admission consent locks terms until epoch closure','consent requires already open matching epoch','cancel before releasing unaccepted order'])assert.ok(s.includes(text),market+': '+text);
 }
});
