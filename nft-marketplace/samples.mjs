// Signature-policy fixtures only; these are not funded on-chain orders.
import {readFileSync,writeFileSync} from 'node:fs';import {operationCalls} from './policy.mjs';import {encodeAmount,losslessJson} from './client.mjs';
const [path,out]=process.argv.slice(2);if(!path||!out)throw Error('usage: samples.mjs <policy.json> <new-samples.json>');
const policy=JSON.parse(readFileSync(path,'utf8'));
const samples=policy.branches.map(b=>{const fields=[BigInt(b.branch),200n,201n,...encodeAmount(10n**28n+17n),0n,0n,0n,0n,0n,1n,1n,1000100000n];return {fields,calls:operationCalls(policy,fields)};});
writeFileSync(out,losslessJson(samples)+'\n',{flag:'wx'});
