// Explicit state preparation for a new collection, never an existing deployment.
// A persistent protocol version is separate from balances, supply and FIFO cursors.
import assert from 'node:assert/strict';
export const ACCOUNT_VERSION_OFFSET=603980958;
export function accountInitializedCollection(source){
 const field='    pub burn_settled: ContractStateArray<16777216, Felt>,\n';
 const implementation='impl PsyNFTContract {\n';
 assert.equal(source.split(field).length,2,'exact reviewed collection tail');
 assert.equal(source.split(implementation).length,2,'exact reviewed implementation');
 assert.ok(!source.includes('account_version')&&!source.includes('prepare_account'));
 return source.replace(field,field+'    pub account_version: Felt,\n').replace(implementation,implementation+`    // This account may have no NFTs. Preparation never mints or transfers one.
    #[contract_method]
    pub fn prepare_account(&mut self, ctx: &mut ChainContext) {
        require(self.account_version == 0 || self.account_version == 1, "unsupported NFT account version");
        self.account_version = 1;
    }

`);
}
export function validateAccountInitialization(previous,next){
 const a=previous.abi.contract,b=next.abi.contract;
 assert.equal(next.state_tree_height,30);assert.equal(previous.state_tree_height,30);
 assert.deepEqual(b.state.slice(0,-1),a.state,'old collection offsets and fields remain intact');
 assert.deepEqual(b.state.at(-1),{name:'account_version',type:{kind:'primitive',name:'Felt'},offset:ACCOUNT_VERSION_OFFSET,felt_size:1});
 assert.deepEqual(b.state_layout.fields.slice(0,-1),a.state_layout.fields,'old authenticated layout entries unchanged');
 assert.deepEqual(b.state_layout.fields.at(-1),{field_id:15,name:'account_version',type:{kind:'primitive',name:'Felt'},start_slot:ACCOUNT_VERSION_OFFSET,payload_offset:0,slot_count:1});
 assert.equal(b.state_layout.field_count,a.state_layout.field_count+1);assert.equal(b.state_layout.slot_count,a.state_layout.slot_count+1);
 for(const name of ['layout_version','encoding_version'])assert.equal(b.state_layout[name],a.state_layout[name]);
 assert.deepEqual(next.abi.types,previous.abi.types,'NFT identity and FIFO structures unchanged');
 assert.deepEqual(b.methods.filter(x=>x.name!=='prepare_account'),a.methods,'old method ABI unchanged');
 assert.deepEqual(next.circuit_definitions.filter(x=>x.name!=='prepare_account'),previous.circuit_definitions,'old compiled methods unchanged');
 const method=b.methods.find(x=>x.name==='prepare_account'),def=next.circuit_definitions.find(x=>x.name==='prepare_account');
 assert.ok(method&&def);assert.equal(b.methods.length,a.methods.length+1);assert.equal(next.circuit_definitions.length,previous.circuit_definitions.length+1);
 assert.equal(method.input_felt_count,0);assert.equal(method.output_felt_count,0);assert.equal(method.state_mutability,'external');
 assert.equal(def.method_id,method.method_id);assert.equal(def.circuit_inputs.length,0);assert.equal(def.circuit_outputs.length,0);
 return method;
}
