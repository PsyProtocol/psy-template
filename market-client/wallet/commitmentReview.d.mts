export interface ReviewedClaimAsset {
 readonly contractId:string;
 readonly profile:"u124_private_compact_v2";
 readonly codeRoot:string;
 readonly layoutRoot:string;
 readonly functionRoot:string;
 readonly decimals:number;
 readonly symbol:string;
}
export function reviewCommitmentConfirmation(terms:unknown,catalogue:readonly ReviewedClaimAsset[]):Promise<{
 approvalSha256:string; rows:Array<{label:string;value:string}>; scope:string;
}>;
export function validateClaimOutputs(outputs:unknown,calls:unknown,recipientId:number):unknown;
