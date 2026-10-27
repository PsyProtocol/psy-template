// Browser origin authority, shared by extension contexts. Never supplied by a page.
export function createBrowserWalletLock(){
 const locks=globalThis.navigator?.locks;
 if(typeof locks?.request!=="function")throw Error("Browser-owned same-origin exclusive locks required for market writes");
 const request=locks.request.bind(locks);
 return(key,work)=>request("psy-market-wallet:"+key,{mode:"exclusive"},async lock=>{
  if(!lock)throw Error("Wallet exclusive lock unavailable");return work();
 });
}
