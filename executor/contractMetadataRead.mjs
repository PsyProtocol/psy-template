// A deployed contract can be visible at the coordinator before every Realm
// reader has its height metadata. This is availability, never a zero value.
export class ContractMetadataNotReady extends Error {
 constructor(contractId,checkpoint){
  super(`Contract ${contractId} state metadata is not ready at checkpoint ${checkpoint}`);
  this.name='ContractMetadataNotReady';this.contractId=contractId;this.checkpoint=checkpoint;
 }
}
export function pendingContractMetadata(method,params,error){
 if(!['psy_get_user_contract_state_tree_leaf_hash','psy_get_user_contract_state_tree_root','psy_get_user_contract_state_tree_merkle_proof'].includes(method))return null;
 const id=params?.contract_id,cp=params?.checkpoint_id;
 if(!Number.isSafeInteger(id)||id<5||id>=16777216||!Number.isSafeInteger(cp)||cp<1||cp>=4294967296)return null;
 if(error?.code!==-32001&&error?.code!==-32001n)return null;
 if(error.message!==`contract ${id} state tree height metadata is not available in Realm DB yet`)return null;
 return new ContractMetadataNotReady(id,cp);
}
