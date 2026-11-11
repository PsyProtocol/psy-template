//! Public-only projections of frozen SDK errors. This module never returns
//! error text, input values, witness data or transport endpoints. Categories
//! are diagnostic observations, not authorization to retry or broadcast.
use anyhow::Error;
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub struct PublicCall {
    pub contract_id: u64,
    pub method_name: String,
    pub input_count: usize,
}

const UNKNOWN: &str = "SDK_UNKNOWN_REVIEW_REQUIRED";
const WRAPPER: &str = "prove contract call failed at call_index=";

fn approved(call: &PublicCall) -> bool {
    call.contract_id < (1 << 24)
        && call.input_count <= 128
        && !call.method_name.is_empty()
        && call.method_name.len() <= 64
        && call.method_name.bytes().enumerate().all(|(i, c)| {
            c.is_ascii_alphabetic() || c == b'_' || (i > 0 && c.is_ascii_digit())
        })
}

fn wrapper(index: usize, calls: &[PublicCall]) -> String {
    let call = &calls[index];
    format!(
        "prove contract call failed at call_index={} total_contract_calls={} contract_id={} method={} input_count={}: ",
        index, calls.len(), call.contract_id, call.method_name, call.input_count
    )
}

// Only the fixed category is returned. Dynamic partition values, method IDs,
// RPC endpoints, parser details and arbitrary suffixes stay inside this call.
fn category(reason: &str) -> &'static str {
    match reason {
        "another similar tx is confirmed while building this tx, please rebuild the tx later" => "SDK_NONCE_CONFIRMED",
        "stale nonce: chain state advanced while building this tx, please rebuild the tx with the latest state" => "SDK_NONCE_STALE",
        "another similar tx is pending, please wait for it to be confirmed" => "SDK_NONCE_PENDING",
        "error finding historical root proof in proof_tree_state"
        | "historical root proof not found during lps-free step proving"
        | "historical root proof not found during lps-free deferred step proving" => "SDK_HISTORICAL_PROOF_ROOT_MISSING",
        "AttestTreeAwareProofInTreeInput verification failed for CFC standard step"
        | "AttestTreeAwareProofInTreeInput verification failed for CFC deferred transaction step"
        | "AttestTreeAwareProofInTreeInput verification failed for previous UPS step"
        | "AttestTreeAwareProofInTreeInput verification failed during lps-free step proving"
        | "AttestTreeAwareProofInTreeInput verification failed during lps-free deferred step proving" => "SDK_PROOF_TREE_ATTESTATION_FAILED",
        "insufficient staked balance" => "SDK_STAKED_BALANCE_INSUFFICIENT",
        "Failed to parse JSON response: EOF while parsing a value at line 1 column 0" => "SDK_RPC_EMPTY_JSON",
        _ if reason.starts_with("resolved fn_id mismatch for contract ") => "SDK_METHOD_RESOURCE_MISMATCH",
        _ if (reason.starts_with("Partition ") || reason.starts_with("partition "))
            && reason.contains(" was set twice with different values:") => "SDK_WITNESS_ASSIGNMENT_CONFLICT",
        _ if reason.starts_with("Connection error to https://") => "SDK_RPC_CONNECTION",
        _ if reason.starts_with("Timeout error to https://") => "SDK_RPC_TIMEOUT",
        _ if reason.starts_with("Request error to https://") => "SDK_RPC_REQUEST",
        _ if reason.starts_with("Failed to parse JSON response: ") => "SDK_RPC_JSON_DECODE",
        _ if reason.starts_with("assertion failed: ") => "SDK_VM_ASSERTION_FAILED",
        _ => UNKNOWN,
    }
}

/// Match the exact SDK wrapper against reviewed public descriptors. Never
/// extract an index, contract, method or arity from untrusted error text.
/// The caller must provide descriptors from its approved public call plan.
pub fn classify(error: &Error, calls: &[PublicCall]) -> Value {
    for cause in error.chain() {
        let reason = cause.to_string();
        if reason.starts_with(WRAPPER) {
            if !calls.is_empty() && calls.len() <= 128 && calls.iter().all(approved) {
                for (index, call) in calls.iter().enumerate() {
                    let expected = wrapper(index, calls);
                    if let Some(suffix) = reason.strip_prefix(expected.as_str()) {
                        return json!({
                            "reasonCode": category(suffix),
                            "failedCallIndex": index,
                            "failedCall": {
                                "contractId": call.contract_id,
                                "methodName": call.method_name,
                                "inputCount": call.input_count,
                            },
                        });
                    }
                }
            }
            // A malformed or substituted SDK wrapper cannot contribute public
            // call context or have its arbitrary suffix reinterpreted.
            return json!({"reasonCode": UNKNOWN});
        }
        let code = category(&reason);
        if code != UNKNOWN {
            return json!({"reasonCode": code});
        }
    }
    json!({"reasonCode": UNKNOWN})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn calls() -> Vec<PublicCall> {
        vec![
            PublicCall { contract_id: 49, method_name: "set_metadata".into(), input_count: 2 },
            PublicCall { contract_id: 49, method_name: "mint".into(), input_count: 2 },
        ]
    }
    fn wrapped(index: usize, suffix: &str) -> Error {
        Error::msg(format!("{}{}", wrapper(index, &calls()), suffix))
    }
    #[test]
    fn exact_wrapper_projects_only_reviewed_public_context() {
        let value = classify(&wrapped(1, "insufficient staked balance"), &calls());
        assert_eq!(value, json!({"reasonCode":"SDK_STAKED_BALANCE_INSUFFICIENT",
            "failedCallIndex":1,"failedCall":{"contractId":49,"methodName":"mint","inputCount":2}}));
    }
    #[test]
    fn wrapper_substitutions_cannot_spoof_context() {
        let valid = wrapper(1, &calls());
        for wrong in [
            valid.replace("call_index=1", "call_index=2"),
            valid.replace("call_index=1", "call_index=01"),
            valid.replace("total_contract_calls=2", "total_contract_calls=3"),
            valid.replace("contract_id=49", "contract_id=50"),
            valid.replace("method=mint", "method=transfer"),
            valid.replace("input_count=2", "input_count=3"),
            valid.replace(": ", ":"),
        ] {
            assert_eq!(classify(&Error::msg(wrong + "insufficient staked balance"), &calls()),
                json!({"reasonCode":UNKNOWN}));
        }
    }
    #[test]
    fn arbitrary_suffixes_secrets_and_nested_fake_wrappers_never_escape() {
        let secret = "SYNTHETIC_PRIVATE_WITNESS_DO_NOT_PROJECT";
        for text in [secret.to_string(), format!("{}{}", wrapper(0, &calls()), secret),
            format!("{}{}{}", wrapper(0, &calls()), secret, wrapper(1, &calls())),
            format!("Partition {secret} was set twice with different values: {secret}"),
            format!("Connection error to https://{secret}: {secret}")] {
            let value = classify(&Error::msg(text), &calls());
            assert!(!value.to_string().contains(secret));
        }
        assert_eq!(classify(&wrapped(0, secret), &calls())["reasonCode"], UNKNOWN);
    }
    #[test]
    fn fixed_categories_work_without_a_business_call_wrapper() {
        for (text, code) in [
            ("another similar tx is confirmed while building this tx, please rebuild the tx later", "SDK_NONCE_CONFIRMED"),
            ("stale nonce: chain state advanced while building this tx, please rebuild the tx with the latest state", "SDK_NONCE_STALE"),
            ("another similar tx is pending, please wait for it to be confirmed", "SDK_NONCE_PENDING"),
            ("error finding historical root proof in proof_tree_state", "SDK_HISTORICAL_PROOF_ROOT_MISSING"),
            ("AttestTreeAwareProofInTreeInput verification failed for CFC standard step", "SDK_PROOF_TREE_ATTESTATION_FAILED"),
            ("resolved fn_id mismatch for contract 49 method 1: expected 2, got 3", "SDK_METHOD_RESOURCE_MISMATCH"),
            ("Partition 1 was set twice with different values: 2 != 3", "SDK_WITNESS_ASSIGNMENT_CONFLICT"),
            ("Failed to parse JSON response: EOF while parsing a value at line 1 column 0", "SDK_RPC_EMPTY_JSON"),
            ("Timeout error to https://public.invalid: hidden", "SDK_RPC_TIMEOUT"),
            ("Request error to https://public.invalid: hidden", "SDK_RPC_REQUEST"),
        ] {
            assert_eq!(classify(&Error::msg(text), &calls()), json!({"reasonCode":code}));
        }
    }
    #[test]
    fn outer_application_context_does_not_hide_a_valid_sdk_cause() {
        let error = wrapped(0, "error finding historical root proof in proof_tree_state")
            .context("SYNTHETIC_SECRET_OUTER_CONTEXT");
        let value = classify(&error, &calls());
        assert_eq!(value["failedCallIndex"], 0);
        assert_eq!(value["reasonCode"], "SDK_HISTORICAL_PROOF_ROOT_MISSING");
        assert!(!value.to_string().contains("SYNTHETIC_SECRET"));
    }
    #[test]
    fn unsafe_public_descriptor_and_empty_plan_cannot_project_context() {
        let mut bad = calls();bad[0].method_name = "mint\nSECRET".into();
        assert_eq!(classify(&wrapped(0, "insufficient staked balance"), &bad), json!({"reasonCode":UNKNOWN}));
        assert_eq!(classify(&wrapped(0, "insufficient staked balance"), &[]), json!({"reasonCode":UNKNOWN}));
    }
}
