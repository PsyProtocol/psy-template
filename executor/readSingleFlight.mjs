// Share only an IN-FLIGHT identical public read. Completion/failure evicts it
// before consumers resume. No cached state, proof, nonce or transaction action.
import assert from'node:assert/strict';
const transports=new WeakMap();
export function publicReadFlight(fetcher,scope,perform,{enabled=true}={}){
 assert.equal(typeof fetcher,'function');assert.equal(typeof perform,'function');assert.equal(typeof enabled,'boolean');assert.ok(typeof scope.domain==='string'&&scope.domain.length>0);assert.ok(typeof scope.endpoint==='string'&&scope.endpoint.length>0);assert.match(scope.method,/^psy_get_/);
 const key=JSON.stringify(scope);let flights=transports.get(fetcher);if(!flights){flights=new Map();transports.set(fetcher,flights);}if(enabled&&flights.has(key))return{...flights.get(key),coalesced:true};
 const timing={activeAt:null,endedAt:null},promise=Promise.resolve().then(()=>perform(timing)),entry={promise,timing};if(enabled){flights.set(key,entry);const clear=()=>{if(flights.get(key)===entry)flights.delete(key);};promise.then(clear,clear);}return{...entry,coalesced:false};
}
