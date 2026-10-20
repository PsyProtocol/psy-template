import {method,own,pairSlot,slot,id} from './controller.mjs';
const F=1000100000n;
export function bootstrapMethod(market,c){if(market==='nftmarket')return '';
 return method('activate_batch_vault','payer: Felt',d=>{d.batchMarket=market;id(d,'payer');d.emit('require(self.batch_ready == 0 && self.batch_phase == 0 && self.batch_id == 0, "batch vault already used");');
  const feeSent=slot(d,'payer',0,'3+2*ctx.user_id'),feeClaimed=slot(d,'ctx.user_id',0,'4+2*payer'),balance=slot(d,'ctx.user_id',0,'0');d.emit(`require(${feeSent} == ${F} && ${feeClaimed} == ${F} && ${balance} == ${F}, "activation native seed");`);
  const writes=[];for(const[asset,cursor]of[[c.assetA,'settled_a'],[c.assetB,'settled_b']]){const sent=pairSlot(d,'payer',asset,'33554453+4*ctx.user_id'),claimed=pairSlot(d,'ctx.user_id',asset,'33554455+4*payer');
   // A balance is at slots 0/1, not an outbox. Read it as individual Felts.
   const lo=slot(d,'ctx.user_id',asset,'0'),hi=slot(d,'ctx.user_id',asset,'1');d.emit(`require(${sent}[0] == 1 && ${sent}[1] == 0 && ${claimed}[0] == 1 && ${claimed}[1] == 0 && ${lo} == 1 && ${hi} == 0, "activation FT seed");`);writes.push(`self.${cursor}[payer] = ${sent};`);}
  writes.push(`self.settled_fee[payer] = ${F}; self.batch_ready = 1;`);writes.forEach(x=>d.emit(x));
 });
}
