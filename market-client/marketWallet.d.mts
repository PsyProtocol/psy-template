export interface MarketWalletEntry {schema:number;intentId:string;recordId:string;phase:string;preparedHash:string|null;requestSha256:string|null;endUserLeafHash:string|null;actualFee?:string|null;contentHash?:string|null;confirmedCheckpoint?:number|null;}
export function marketWalletPhase(phase:string|undefined):string;
export function createMarketWalletClient(provider:{request(args:{method:string;params:unknown[]}):Promise<unknown>},account:string,record:{recordId:string;registryHash:string;plan:{kind:string;marketId:number;network:{chainRootAt1:string}}}):{
 capabilities():Promise<{usable:boolean;[key:string]:unknown}>;
 prepare():Promise<unknown>;list():Promise<MarketWalletEntry[]>;
 verify(entry:MarketWalletEntry):Promise<unknown>;approveAndBroadcast(entry:MarketWalletEntry):Promise<unknown>;
 reconcile(entry:MarketWalletEntry):Promise<unknown>;cancel(entry:MarketWalletEntry):Promise<unknown>;
};
