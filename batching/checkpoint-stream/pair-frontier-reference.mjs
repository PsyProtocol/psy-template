// Independent exact-integer reference. This does not authenticate input records,
// verify a proof, install wallet resources or authorize a financial submission.
import assert from 'node:assert/strict';
const B=1n<<62n;
const scalar=(r,i)=>BigInt(r.values[i]);
const amount=(r,i)=>{const lo=scalar(r,i),hi=scalar(r,i+1);assert.ok(lo>=0n&&lo<B&&hi>=0n&&hi<B,'canonical U124');return lo+B*hi;};
const time=(kind,a,b)=>{const i=kind===3?11:5;const ac=scalar(a,i),bc=scalar(b,i);return ac===bc?(BigInt(a.owner)<BigInt(b.owner)?-1:BigInt(a.owner)>BigInt(b.owner)?1:0):ac<bc?-1:1;};
const price=(a,b)=>{const l=amount(a,7)*amount(b,5),r=amount(b,7)*amount(a,5);return l===r?time(3,a,b):l<r?-1:1;};
export function compatiblePair(kind,a,b){assert.ok([3,4].includes(kind));return kind===3?scalar(a,2)===0n&&scalar(b,2)===1n&&amount(a,7)<=amount(b,5)&&amount(b,7)<=amount(a,5):scalar(a,0)===1n&&scalar(b,0)===2n&&scalar(b,8)===BigInt(a.owner)&&scalar(b,9)===scalar(a,2)&&amount(a,6)===amount(b,6);}
export function beforePair(kind,a,b,c,d){const first=kind===3?price(a,c):time(kind,a,c);return first<0||(first===0&&(kind===3?price(b,d):time(kind,b,d))<0);}
export function referenceWinner(kind,records){assert.ok([3,4].includes(kind));let best=null;for(const a of records)for(const b of records)if(compatiblePair(kind,a,b)&&(!best||beforePair(kind,a,b,best.a,best.b)))best={a,b};return{best,comparisons:records.length*records.length,canBroadcast:false,cryptographicVerificationPerformed:false};}
