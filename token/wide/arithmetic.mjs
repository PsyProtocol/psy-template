// U124: little-endian limbs, each bounded to 62 bits. Keep arithmetic in BigInt.
export const LIMB_BITS = 62n;
export const RADIX = 1n << LIMB_BITS;
export const MAX_AMOUNT = RADIX * RADIX - 1n;
export function encodeAmount(value) {
 if(typeof value!=='bigint'||value<0n||value>MAX_AMOUNT)throw new RangeError('amount must be a BigInt in 0..2^124-1');
 return [value%RADIX,value/RADIX];
}
export function decodeAmount(limbs) {
 if(!Array.isArray(limbs)||limbs.length!==2||limbs.some(x=>typeof x!=='bigint'||x<0n||x>=RADIX))throw new RangeError('two canonical 62-bit BigInt limbs required');
 return limbs[0]+limbs[1]*RADIX;
}
export function addAmount(a,b) {return encodeAmount(decodeAmount(a)+decodeAmount(b));}
export function subtractAmount(a,b) {return encodeAmount(decodeAmount(a)-decodeAmount(b));}
export function parseUnits(text,decimals) {
 if(!Number.isInteger(decimals)||decimals<0||decimals>18)throw new RangeError('decimals must be 0..18');
 if(typeof text!=='string'||!/^\d+(?:\.\d+)?$/.test(text))throw new TypeError('unsigned decimal string required');
 const [whole,fraction='']=text.split('.');if(fraction.length>decimals)throw new RangeError('too many decimal places');
 const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');encodeAmount(n);return n;
}
export function formatUnits(value,decimals) {
 encodeAmount(value);if(!Number.isInteger(decimals)||decimals<0||decimals>18)throw new RangeError('decimals must be 0..18');
 const scale=10n**BigInt(decimals);return String(value/scale)+(decimals?'.'+String(value%scale).padStart(decimals,'0'):'');
}
// Emit integer JSON tokens directly: Number would round 62-bit limbs.
export function losslessJson(value) {
 if(typeof value==='bigint')return value.toString();
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new TypeError('unsafe numeric JSON value');return String(value);}
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(losslessJson).join(',')+']';
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+':'+losslessJson(v)).join(',')+'}';
 throw new TypeError('unsupported JSON value');
}
export function tokenCall(contractId,method,inputs=[]) {
 if(!Number.isSafeInteger(contractId)||contractId<5)throw new RangeError('non-genesis token ID required');
 return {contract_id:contractId,method_name:method,inputs};
}
export function transferCall(contractId,recipient,amount) {
 if(!Number.isSafeInteger(recipient)||recipient<1||recipient>=16777216)throw new RangeError('invalid recipient');
 if(amount===0n)throw new RangeError('positive amount required');
 return tokenCall(contractId,'transfer',[recipient,...encodeAmount(amount)]);
}
