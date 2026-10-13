import test from 'node:test';
import assert from 'node:assert/strict';
import {RADIX,MAX_AMOUNT,encodeAmount,decodeAmount,addAmount,subtractAmount,parseUnits,formatUnits,transferCall,losslessJson} from './arithmetic.mjs';
test('18-decimal billion-token quantities preserve every base unit',()=>{
 const raw=parseUnits('1000000000.123456789012345678',18);
 assert.equal(raw,1000000000123456789012345678n);assert.ok(raw>18446744069414584320n);
 assert.equal(decodeAmount(encodeAmount(raw)),raw);assert.equal(formatUnits(raw,18),'1000000000.123456789012345678');
 assert.equal(formatUnits(MAX_AMOUNT,18),'21267647932558653966.460912964485513215');
 assert.throws(()=>parseUnits('1.0000001',6));assert.throws(()=>parseUnits('1e18',18));
});
test('canonical limbs, carry, borrow and overflow agree with unsigned integers',()=>{
 assert.deepEqual(addAmount([RADIX-1n,10n],[1n,5n]),[0n,16n]);
 assert.deepEqual(subtractAmount([0n,16n],[1n,5n]),[RADIX-1n,10n]);
 for(const limbs of [[RADIX,0n],[-1n,0n],[0n,RADIX],[1,0n]])assert.throws(()=>decodeAmount(limbs));
 assert.throws(()=>addAmount(encodeAmount(MAX_AMOUNT),encodeAmount(1n)));
 assert.throws(()=>subtractAmount(encodeAmount(0n),encodeAmount(1n)));
});
test('wire encoding keeps 62-bit limbs as exact decimal JSON integers',()=>{
 const call=transferCall(42,200,MAX_AMOUNT);
 const text=losslessJson(call);assert.equal(text,'{"contract_id":42,"method_name":"transfer","inputs":[200,4611686018427387903,4611686018427387903]}');
 assert.throws(()=>losslessJson({inputs:[Number(RADIX-1n)]}),/unsafe/);
 assert.throws(()=>transferCall(0,200,1n));assert.throws(()=>transferCall(42,0,1n));
});
