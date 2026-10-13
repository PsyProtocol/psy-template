// Read-only identity gate. Run before creating a wallet proving session.
export function compareLeaf(role,id,expected,response){
 const actual=response?.result;
 if(!actual||typeof actual!=='object')return {role,id,passed:false,errors:['contract leaf unavailable'],rpcError:response?.error||response?.readError||null};
 const errors=[];
 for(const[name,value]of Object.entries(expected))if(actual[name]!==value)errors.push(`${name}: expected ${value}, got ${actual[name]}`);
 return {role,id,passed:errors.length===0,expected,actual,errors};
}
export function evaluatePrerequisites({config,marketIds,tokenReview,marketReviews,snapshot,vaultRegistrations}){
 const endpoint=review=>{const l=review.manifest.layout.contract_layout;return {code_root:review.codeRoot,state_layout_root:review.layoutRoot,state_tree_height:review.stateTreeHeight,state_layout_field_count:l.state_layout_field_count,state_layout_slot_count:l.state_layout_slot_count};};
 const checks=[compareLeaf('token_a',config.assetA,endpoint(tokenReview),snapshot.responses[String(config.assetA)]),compareLeaf('token_b',config.assetB,endpoint(tokenReview),snapshot.responses[String(config.assetB)])];
 for(const market of ['amm','orderbook','bondingcurve'])checks.push(compareLeaf(market,marketIds[market],endpoint(marketReviews[market]),snapshot.responses[String(marketIds[market])]));
 const native=snapshot.responses['0']?.result;checks.push({role:'native_psy_fee',id:0,passed:native?.state_tree_height===32,errors:native?.state_tree_height===32?[]:['native PSY height 32 required']});
 const registrationChecks=['amm','orderbook','bondingcurve'].map(m=>({market:m,passed:Array.isArray(vaultRegistrations?.[m]?.result)&&vaultRegistrations[m].result.length>0,result:vaultRegistrations?.[m]||null}));
 return {chainCheckpoint:snapshot.responses.checkpoint?.result??null,readOnly:true,checks,registrationChecks,contractIdentitiesMatched:checks.every(c=>c.passed),vaultsRegistered:registrationChecks.every(c=>c.passed),canRunRealUps:checks.every(c=>c.passed)&&registrationChecks.every(c=>c.passed),fullUpsVerified:false,submitted:false};
}
