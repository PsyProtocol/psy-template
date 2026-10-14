// Read-only status command for a configured NFT vault.
import {loadOptions} from '../executor/config.mjs';import {publicState} from '../executor/publicState.mjs';import {loadFiles} from './reader.mjs';import {readOrderStatus} from './status.mjs';import {createPublicWalletAdapter} from '../executor/publicWalletAdapter.mjs';
const [path,id,nonce]=process.argv.slice(2);if(!path||!id||!/^\d+$/.test(id)||nonce!==undefined&&!/^\d+$/.test(nonce))throw Error('usage: status-cli.mjs <executor-config> <user-id> [order-nonce]');
const options=await loadOptions(path);if(options.kind!=='nftmarket')throw Error('NFT market config required');
// Validate exact ABI/config/policy plus all deployed roots before displaying status.
await createPublicWalletAdapter(options);const {abi,config}=await loadFiles(options),s=await publicState(options.rpcConfig);
console.log(JSON.stringify(await readOrderStatus(s,{...options,userId:Number(id),abi,config,...(nonce===undefined?{}:{nonce:BigInt(nonce)})}),(_k,v)=>typeof v==='bigint'?String(v):v,2));
