import test from 'node:test';import assert from 'node:assert/strict';
import {createTokenCallBuilder} from './callBuilder.mjs';
import {MAX_AMOUNT,encodeAmount,losslessJson} from './arithmetic.mjs';
import {checkWideTokenArtifact,METHOD_INPUTS} from './artifactGate.mjs';
import {readFile} from 'node:fs/promises';
test('all twenty public method inputs match the compiled wide ABI without losing limbs',async()=>{
 const c=createTokenCallBuilder(42),amount=10n**27n+17n;
 const calls=[c.setMetadata(123n,18),c.setExtendedMetadata([1n,2n],[3n,4n,5n,6n,7n]),c.setMaxSupply(MAX_AMOUNT),c.mint(amount),c.mintTo(200,amount),c.burn(amount),c.settleBurn(200),c.setMintAuthority(5),c.renounceMintAuthority(),c.transfer(200,amount),c.claim(200),c.cancelUnclaimedPayment(200),c.refundClaimedPayment(200,amount),c.batchTransfer([{to:200,amount},{to:300,amount:1n}]),c.batchTransfer([{to:200,amount},{to:300,amount:1n},{to:0,amount:0n},{to:400,amount:2n},{to:200,amount:3n}]),c.openDelegationChannel(0,300,amount),c.spendDelegation(200,0,amount,400),c.requestRevokeDelegation(0),c.closeDelegationChannel(200,0,1n),c.finalizeRevokeDelegation(0,300)];
 assert.deepEqual(calls.map(x=>x.method_name).sort(),Object.keys(METHOD_INPUTS).sort());
 for(const call of calls){assert.equal(call.inputs.length,METHOD_INPUTS[call.method_name]);assert.ok(losslessJson(call).includes('"inputs":['));}
 assert.deepEqual(c.spendDelegation(200,0,amount,400).inputs,[200,0,...encodeAmount(amount),400]);
 const artifact=JSON.parse(await readFile(process.env.TOKEN_WIDE_ARTIFACT??new URL('./verification-2026-10-12/compiled-reviewed/compilation_artifact.json',import.meta.url),'utf8'));
 assert.equal(checkWideTokenArtifact(artifact).valid,true);
});
test('builders reject invalid amounts, recipients, channels, precision and rounded Numbers',()=>{
 const c=createTokenCallBuilder(42);assert.throws(()=>c.mint(0n));assert.throws(()=>c.transfer(0,1n));assert.throws(()=>c.openDelegationChannel(16,200,1n));assert.throws(()=>c.mint(MAX_AMOUNT+1n));assert.throws(()=>c.setMetadata(Number(1n<<62n),18));assert.throws(()=>c.setMetadata(1n,19));
});
