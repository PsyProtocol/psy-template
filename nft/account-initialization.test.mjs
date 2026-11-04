import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {accountInitializedCollection,validateAccountInitialization,ACCOUNT_VERSION_OFFSET} from './account-initialization.mjs';
const base=process.env.NFT_BOOTSTRAP_REVIEWED_FIXTURES,candidate=process.env.NFT_BOOTSTRAP_CANDIDATE_FIXTURES;
test('account preparation is an explicit new collection protocol, never a balance or cursor seed',()=>{
 const source=readFileSync(new URL('./src/main.psy.rs',import.meta.url),'utf8');
 const next=accountInitializedCollection(source);assert.equal(next.split('pub account_version: Felt,').length,2);
 const body=next.slice(next.indexOf('pub fn prepare_account'),next.indexOf('    #[contract_method]',next.indexOf('pub fn prepare_account')));
 assert.ok(body.includes('self.account_version = 1;'));assert.ok(!/self\.(balance|total_minted|outbox|mint_authority|owned_tokens)/.test(body));
 assert.throws(()=>accountInitializedCollection(next));assert.throws(()=>accountInitializedCollection(source.replace('burn_settled','changed_field')));
});
test('actual compiled collection preserves every old method and state offset',{skip:!base||!candidate},()=>{
 const read=(root,path)=>JSON.parse(readFileSync(join(root,path)));
 const old=read(base,'nft/compilation_artifact.json'),next=read(candidate,'nft/compilation_artifact.json');
 assert.equal(validateAccountInitialization(old,next).method_id,1475740684);
 assert.equal(next.abi.contract.state.at(-1).offset,ACCOUNT_VERSION_OFFSET);
 for(const mutate of [x=>x.abi.contract.state.at(-1).offset++,x=>x.abi.contract.state[0].offset++,x=>x.abi.contract.state_layout.fields[0].start_slot++,x=>x.abi.contract.state_layout.slot_count++,x=>x.circuit_definitions.find(d=>d.name==='transfer').method_id++,x=>x.abi.contract.methods.find(d=>d.name==='prepare_account').input_felt_count++]){
  const changed=structuredClone(next);mutate(changed);assert.throws(()=>validateAccountInitialization(old,changed));
 }
});
