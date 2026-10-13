import {readFileSync,writeFileSync} from 'node:fs';
import {makePolicy,operationCalls} from './policy.mjs';
import {encodeAmount,losslessJson,swapQuote} from './client.mjs';
import {fixture} from './generate.mjs';
const root=process.argv[2];const marketIds=process.argv[3]?JSON.parse(readFileSync(process.argv[3])):{amm:1000,orderbook:1000,bondingcurve:1000};if(!root)throw Error('usage: fixtures.mjs <compiled-root>');
const token=JSON.parse(readFileSync(new URL('../../token/wide/verification-2026-10-12/compiled-reviewed/compilation_artifact.json',import.meta.url))).abi;
for(const market of['amm','orderbook','bondingcurve']){const abi=JSON.parse(readFileSync(`${root}/${market}/abi.json`));const policy=makePolicy(market,marketIds[market],fixture,abi,token);writeFileSync(`${root}/${market}/policy.json`,JSON.stringify(policy));const samples=policy.branches.map(branch=>{const fields=[BigInt(branch.branch),200n,201n,1n,1n,2n,2n,3n,3n,7n,1n,1n,1000010000n];return {fields,calls:operationCalls(policy,fields)};});writeFileSync(`${root}/${market}/policy-samples.json`,losslessJson(samples));}
const max=(1n<<124n)-1n;const flat=values=>values.flatMap(encodeAmount);
const product=[[max,max,max,max],[max,max,max,max-1n],[1n<<62n,1n<<62n,1n<<61n,1n<<63n],[1n<<64n,1n,4294967295n,1n]];
const swap=[];for(const[input,rin,rout]of[[10n**26n,10n**28n,10n**28n],[max/4n,max/2n,max/3n],[1n<<62n,(1n<<62n)+7n,(1n<<63n)+1n]]){const out=swapQuote(input,rin,rout);swap.push({inputs:flat([input,rin,rout,out]),valid:true},{inputs:flat([input,rin,rout,out+1n]),valid:false},{inputs:flat([input,rin,rout,out-1n]),valid:false});}
writeFileSync(`${root}/arithmetic-samples.json`,losslessJson({product:product.map((values,i)=>({inputs:flat(values),valid:i===0||i===2})),swap}));
