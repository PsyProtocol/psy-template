//! Source-derived contract layouts. A missing ABI is supported only for the
//! explicit historical native zero-layout artifact. Callers must still compare
//! every returned endpoint with the reviewed or authenticated contract leaf.
use anyhow::{ensure, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, hash::hash_types::HashOut};
use psy_client_common::data::qhashout::QHashOut as Q;
use serde_json::Value;

pub fn artifact_layout(contract_id: u64, height: usize, abi: &Value) -> Result<(Q<F>, u64, u64)> {
    ensure!(
        if contract_id == 0 {
            height == 32
        } else {
            [30, 31].contains(&height)
        },
        "contract layout height"
    );
    if abi.is_null() {
        ensure!(contract_id == 0, "non-native canonical ABI required");
        return Ok((Q::ZERO, 0, 0));
    }
    ensure!(
        abi["contract"]["state_tree_height"].as_u64() == Some(height as u64),
        "ABI state height differs from artifact"
    );
    let manifest = psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<
        parth_core::pgoldilocks::PoseidonHasher,
        F,
        parth_core::pgoldilocks::QHashOut<F>,
    >(
        &serde_json::to_string(abi)?,
        psy_core::constants::protocol::STATE_LAYOUT_TREE_HEIGHT,
        psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT,
    )?;
    let l = manifest.layout.contract_layout;
    Ok((
        Q(HashOut {
            elements: l.state_layout_root.0.elements,
        }),
        l.state_layout_field_count,
        l.state_layout_slot_count,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn canonical_native_layout_and_explicit_historical_zero() -> Result<()> {
        assert_eq!(artifact_layout(0, 32, &Value::Null)?, (Q::ZERO, 0, 0));
        assert!(artifact_layout(7, 31, &Value::Null).is_err());
        assert!(artifact_layout(0, 31, &Value::Null).is_err());
        let abi = json!({"contract":{"state_tree_height":32,"state_layout":{"layout_version":1,"encoding_version":1,"field_count":1,"slot_count":1,"fields":[{"field_id":1,"type":{"kind":"primitive","name":"Felt"},"start_slot":0,"payload_offset":0,"slot_count":1}]}},"types":[]});
        let (root, fields, slots) = artifact_layout(0, 32, &abi)?;
        assert_ne!(root, Q::ZERO);
        assert_eq!((fields, slots), (1, 1));
        let mut bad = abi.clone();
        bad["contract"]["state_tree_height"] = json!(31);
        assert!(artifact_layout(0, 32, &bad).is_err());
        for (name, value) in [("field_count", 2), ("slot_count", 2), ("layout_version", 2)] {
            let mut bad = abi.clone();
            bad["contract"]["state_layout"][name] = json!(value);
            assert!(artifact_layout(0, 32, &bad).is_err());
        }
        Ok(())
    }
}
