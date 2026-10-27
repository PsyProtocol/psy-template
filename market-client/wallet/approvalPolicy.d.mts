export interface MarketApprovalReview {
 componentId: string;
 assets: Array<{contractId:number; decimals:number; symbol:string}>;
 limits: Array<{label:string;value:string}>;
 rows: Array<{label:string;value:string}>;
 debits: Array<{label:string;value:string}>;
}
export function reviewMarketConfirmation(terms: unknown,bundle: unknown): Promise<MarketApprovalReview>;
export function marketLimitRows(terms: unknown): Array<{label:string;value:string}>;
export function marketCapabilities(bundle: unknown): {registryHashes:string[];chainRootAt1:string;enabledMarketIds:number[];nftWrite:false;liveAcceptanceComplete:false};
export function assertMarketPolicyRecord(bundle: unknown,record: unknown): unknown;
