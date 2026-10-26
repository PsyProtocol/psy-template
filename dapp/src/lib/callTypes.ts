// Browser-provider message shape only. This is not an SDK implementation,
// ABI verifier or authorization. Market UI never calls the legacy signer.
export interface ContractCallArgs {
  contract_id: bigint;
  method_name: string;
  inputs: bigint[];
}
