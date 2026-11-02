//! Application-owned lowering for two VM operations missing from the frozen
//! compiler frontend. SDK/Node sources are never patched. Temporary hash forms
//! are compiler markers only: both must be replaced before any artifact escapes.
use anyhow::{ensure, Result};
use psy_compiler::output::serialize::ContractOutput;
use psy_vm::dpn::{
    contract::dapen_fc_to_cfc_code_definition,
    ops::{op_types::{decode_indexed_op_id, encode_indexed_op_id, DPNBuiltInDataType as Ty, DPNOpType as Op},
          state_cmd::{data::{DPNStateCmd, DPNStateCmdGetGlobalStateRoots}, types::DPNStateCmdCore}},
    vm::{def::DPNFunctionCircuitDefinition, validate::validate_function_definition},
};
use std::collections::HashMap;

const CHECKPOINT_MARKER: u64 = 0x5053594350524f54;
const SESSION_MARKER: u64 = 0x5053595350524f54;
pub const PROFILE: &str = "private-context-dpn-v2";

fn constants(def: &DPNFunctionCircuitDefinition) -> HashMap<u64, u64> {
    def.definitions.iter().filter(|n| n.op_type == Op::Constant)
        .map(|n| (encode_indexed_op_id(n.data_type, n.index), n.inputs[0])).collect()
}

/// Change only the two marker operations, four checkpoint-root element readers,
/// typed Hash/array indices and state-result command indices. Felt/Bool lanes,
/// ABI inputs, all assertions, events and original state commands stay intact.
pub fn lower_claim(def: &mut DPNFunctionCircuitDefinition) -> Result<()> {
    let mut candidate = def.clone();
    lower_claim_inner(&mut candidate)?;
    *def = candidate;
    Ok(())
}

fn lower_claim_inner(def: &mut DPNFunctionCircuitDefinition) -> Result<()> {
    validate_function_definition(def)?;
    ensure!(def.name == "private_claim" && def.circuit_inputs.len() == 86, "private claim ABI required");
    let original = def.clone();
    let values = constants(def);
    let tagged = |marker| def.definitions.iter().enumerate().filter(|(_, n)|
        n.op_type == Op::HashNoPad && n.inputs.first().and_then(|id| values.get(id)) == Some(&marker))
        .map(|(i, _)| i).collect::<Vec<_>>();
    let cp = tagged(CHECKPOINT_MARKER);
    let session = tagged(SESSION_MARKER);
    ensure!(cp.len() == 1 && session.len() == 1, "exactly one checkpoint and session marker required");
    let cp_pos = cp[0];
    let session_pos = session[0];
    let cp_op = def.definitions[cp_pos].clone();
    let session_op = def.definitions[session_pos].clone();
    ensure!(cp_op.inputs.len() == 6 && session_op.inputs.len() == 1, "marker arity changed");
    ensure!(cp_op.inputs[1] == def.circuit_inputs[10], "checkpoint must bind the actual checkpoint ABI input");
    for i in 0..4 { ensure!(values.get(&cp_op.inputs[2+i]) == Some(&(8+i as u64)), "global user-root slice changed"); }
    let old_hash = encode_indexed_op_id(Ty::HashOut, cp_op.index);
    let array_index = def.definitions[..cp_pos].iter().filter(|n| n.data_type == Ty::TargetArray).count();
    let new_array = encode_indexed_op_id(Ty::TargetArray, array_index);
    let cmd_index = def.state_command_resolution_indices.iter().position(|&i| i >= cp_pos)
        .unwrap_or(def.state_commands.len());
    let mut seen = [false; 4];
    for (position, n) in def.definitions.iter_mut().enumerate() {
        if n.data_type == Ty::HashOut && n.index > cp_op.index { n.index -= 1; }
        if n.data_type == Ty::TargetArray && n.index >= array_index { n.index += 1; }
        if position == cp_pos {
            n.op_type = Op::GetStateCommandResultArray;
            n.data_type = Ty::TargetArray;
            n.index = array_index;
            n.inputs = vec![cmd_index as u64];
        } else if position == session_pos {
            n.op_type = Op::GetSessionProofTreeRoot;
            n.inputs.clear();
        } else if n.op_type == Op::TargetAt {
            ensure!(n.inputs.len() == 2, "unexpected element reader");
            if n.inputs[0] == old_hash {
                let offset = *values.get(&n.inputs[1]).ok_or_else(|| anyhow::anyhow!("root element must be a constant"))?;
                ensure!(offset < 4 && !seen[offset as usize], "root element missing, duplicated or out of range");
                seen[offset as usize] = true;
                n.inputs = vec![new_array, cp_op.inputs[2+offset as usize]];
            } else {
                let (ty, index) = decode_indexed_op_id(n.inputs[0]);
                if ty == Ty::HashOut && index > cp_op.index { n.inputs[0] = encode_indexed_op_id(ty, index-1); }
                if ty == Ty::TargetArray && index >= array_index { n.inputs[0] = encode_indexed_op_id(ty, index+1); }
            }
        } else if matches!(n.op_type, Op::GetStateCommandResultHash | Op::GetStateCommandResultArray | Op::GetStateCommandResultSingle) {
            ensure!(n.inputs.len() == 1, "state-result arity changed");
            if n.inputs[0] >= cmd_index as u64 { n.inputs[0] += 1; }
        } else if !matches!(n.op_type, Op::Constant | Op::ConstantU32 | Op::InputTarget | Op::U32InputTarget | Op::BoolInputTarget) {
            // The selected compiler flattens composite arguments into scalar
            // elements. Refuse unknown composite consumers instead of guessing.
            let operands = if n.op_type == Op::SplitBits { &n.inputs[1..] } else { &n.inputs[..] };
            ensure!(operands.iter().all(|id| !matches!(decode_indexed_op_id(*id).0, Ty::HashOut | Ty::TargetArray)),
                    "unsupported composite operand in {:?}", n.op_type);
        }
    }
    ensure!(seen.iter().all(|x| *x), "all four authenticated checkpoint-root limbs required");
    def.state_commands.insert(cmd_index, DPNStateCmd::GetGlobalStateRoots(DPNStateCmdGetGlobalStateRoots::new(cp_op.inputs[1])));
    def.state_command_resolution_indices.insert(cmd_index, cp_pos);
    ensure!(def.circuit_inputs == original.circuit_inputs && def.circuit_outputs == original.circuit_outputs
        && def.assertions == original.assertions && def.events == original.events, "ABI or financial constraints changed");
    let mut commands = def.state_commands.clone(); commands.remove(cmd_index);
    let mut resolutions = def.state_command_resolution_indices.clone(); resolutions.remove(cmd_index);
    ensure!(commands == original.state_commands && resolutions == original.state_command_resolution_indices,
            "original state commands or timing changed");
    validate_function_definition(def)?;
    ensure!(def.definitions.iter().filter(|n| n.op_type == Op::GetSessionProofTreeRoot).count() == 1,
            "exactly one authenticated session-root read required");
    Ok(())
}

fn frontend_source(source: &str) -> Result<String> {
    let checkpoint = "psystd::checkpoint_user_tree_root(checkpoint_id)";
    let session = "psystd::session_proof_tree_root()";
    ensure!(source.matches(checkpoint).count() == 1 && source.matches(session).count() == 1,
            "canonical private context calls required");
    ensure!(!source.contains(&CHECKPOINT_MARKER.to_string()) && !source.contains(&SESSION_MARKER.to_string()),
            "reserved application compiler markers in source");
    Ok(source.replace(checkpoint, &format!("psystd::poseidon_hash({CHECKPOINT_MARKER}, checkpoint_id, 8, 9, 10, 11)"))
        .replace(session, &format!("psystd::poseidon_hash({SESSION_MARKER})")))
}

pub fn compile(source: &str) -> Result<ContractOutput> {
    let input = frontend_source(source)?;
    let mut out = psy_compiler::compile(&input)?;
    ensure!(out.method_count() == 22 && out.state_tree_height() == 32, "complete private U124 profile required");
    let mut claims = 0;
    for def in &mut out.circuit_definitions {
        if def.name == "private_claim" { lower_claim(def)?; claims += 1; }
        else {
            let values = constants(def);
            ensure!(!values.values().any(|v| *v == CHECKPOINT_MARKER || *v == SESSION_MARKER), "marker escaped the claim method");
        }
        validate_function_definition(def)?;
    }
    ensure!(claims == 1, "unique private claim method required");
    out.contract_code.functions = out.circuit_definitions.iter().map(dapen_fc_to_cfc_code_definition).collect();
    Ok(out)
}

/// The application adapter must link the selected existing verifier resources.
/// A compiler built from the old sibling release is not a compatible substitute.
pub fn verify_selected_sdk() -> Result<()> {
    use plonky2::field::goldilocks_field::GoldilocksField as F;
    use psy_client_data::config::store_config::C;
    use psy_core::constants::chain_id::PsyChainNetworkType;
    use psy_plonky2_circuits::{circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network,
                             proof_minifier::pm_core::get_circuit_fingerprint_generic_q};
    ensure!(psy_config::PSY_NETWORK_MAGIC == 1384803358401154921, "selected testnet domain required");
    let data = get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?)?.to_verifier_data::<C, 2>();
    ensure!(get_circuit_fingerprint_generic_q::<2,F,C>(&data).to_string() == "043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893",
            "compiler linked a different SDK Endcap release");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const SOURCE: &str = include_str!("../wide/private/src/main.psy.rs");

    #[test]
    fn selected_sdk_compiles_the_complete_private_profile_without_upstream_patches() -> Result<()> {
        verify_selected_sdk()?;
        ensure!(psy_compiler::compile(SOURCE).is_err(), "upstream frontend expectation changed; review the adapter");
        let out = compile(SOURCE)?;
        ensure!(out.method_count() == 22 && out.state_tree_height() == 32, "private profile");
        let d = out.circuit_definitions.iter().find(|d| d.name == "private_claim").unwrap();
        ensure!(d.circuit_inputs.len() == 86, "complete U124 claim inputs");
        let roots = d.state_commands.iter().filter_map(|c| match c {
            DPNStateCmd::GetGlobalStateRoots(c) => Some(c), _ => None }).collect::<Vec<_>>();
        ensure!(roots.len() == 1 && roots[0].checkpoint_id == d.circuit_inputs[10], "authenticated checkpoint input");
        for method in &out.circuit_definitions { validate_function_definition(method)?; }
        Ok(())
    }

    #[test]
    fn malformed_marker_and_checkpoint_substitutions_fail_atomically() -> Result<()> {
        let out = psy_compiler::compile(&frontend_source(SOURCE)?)?;
        let original = out.circuit_definitions.iter().find(|d| d.name == "private_claim").unwrap();
        let values = constants(original);
        let position = original.definitions.iter().position(|n| n.op_type == Op::HashNoPad
            && n.inputs.first().and_then(|id| values.get(id)) == Some(&CHECKPOINT_MARKER)).unwrap();
        for mode in 0..4 {
            let mut bad = original.clone();
            match mode {
                0 => bad.definitions[position].inputs[1] = bad.circuit_inputs[11],
                1 => bad.definitions[position].inputs[2] = bad.definitions[position].inputs[3],
                2 => { bad.definitions[position].inputs.pop(); },
                _ => {
                    let id = encode_indexed_op_id(Ty::HashOut, bad.definitions[position].index);
                    let wrong_offset = bad.definitions[position].inputs[2];
                    let reader = bad.definitions.iter_mut().find(|n| n.op_type == Op::TargetAt && n.inputs[0] == id).unwrap();
                    reader.inputs[1] = wrong_offset;
                }
            }
            let before = bad.clone();
            ensure!(lower_claim(&mut bad).is_err(), "accepted mutation {mode}");
            ensure!(bad == before, "failed adapter changed the caller's object");
        }
        for from in ["psystd::session_proof_tree_root()", "psystd::checkpoint_user_tree_root(checkpoint_id)"] {
            ensure!(compile(&SOURCE.replace(from, "[0, 0, 0, 0]")).is_err(), "missing authentication accepted");
        }
        Ok(())
    }
}
