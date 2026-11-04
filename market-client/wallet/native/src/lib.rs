//! Extension-owned public verifier. The selected source pack is embedded at
//! build time; no page or RPC may provide verifier keys/common data.
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;
mod private_notes;
mod verification;
use verification::{PublicBundle, VerifierPack, WalletApproval};
static PACK: OnceLock<Result<VerifierPack, String>> = OnceLock::new();
const BYTES: &[u8] = include_bytes!("verifiers.json");
const NOTE_BYTES: &[u8] = include_bytes!("private-note-verifiers.json");
static NOTES: OnceLock<Result<private_notes::NoteVerifier, String>> = OnceLock::new();
// Resources are embedded by the extension build, never installed by a page.
#[wasm_bindgen]
pub fn private_note_identity() -> String {
    serde_json::json!({"schema":1,"available":NOTE_BYTES != b"null\n","packSha256":format!("{:x}",Sha256::digest(NOTE_BYTES)),"scope":"denomination-notes-only","claimAuthorized":false}).to_string()
}
#[wasm_bindgen]
pub fn verify_private_ft_notes(packet: &str, context: &str) -> Result<String, JsError> {
    if packet.len() > 6_100_000 || context.len() > 4096 {
        return Err(JsError::new("Private note public resource limit"));
    }
    let run = || -> anyhow::Result<String> {
        let verifier = NOTES
            .get_or_init(|| {
                serde_json::from_slice(NOTE_BYTES)
                    .map_err(|e| e.to_string())
                    .and_then(|p| private_notes::NoteVerifier::new(p).map_err(|e| e.to_string()))
            })
            .as_ref()
            .map_err(|_| anyhow::anyhow!("Reviewed private note resources unavailable"))?;
        let p = serde_json::from_str(packet)?;
        let c = serde_json::from_str(context)?;
        Ok(verifier.verify(&p, &c)?.to_string())
    };
    run().map_err(|_| {
        JsError::new("Private denomination proof, resources or wallet context rejected")
    })
}
fn pack() -> Result<&'static VerifierPack, JsError> {
    PACK.get_or_init(|| serde_json::from_slice(BYTES).map_err(|e| e.to_string()))
        .as_ref()
        .map_err(|_| JsError::new("Embedded verifier resources invalid"))
}
#[wasm_bindgen]
pub fn verifier_identity() -> Result<String, JsError> {
    let p = pack()?;
    Ok(serde_json::json!({"schema":1,"sdkManifestSha256":p.sdk_manifest,"networkMagic":p.network_magic.to_string(),"verifierPackSha256":format!("{:x}",Sha256::digest(BYTES)),"contracts":p.contracts.iter().map(|c|serde_json::json!({"contractId":c.contract_id,"codeRoot":c.code_root.to_string(),"layoutRoot":c.layout_root.to_string(),"functionRoot":c.function_root.to_string()})).collect::<Vec<_>>(),"broadcast":false}).to_string())
}
#[wasm_bindgen]
pub fn verify_market_prepared(
    request: &str,
    approval: &str,
    bundle: &str,
) -> Result<String, JsError> {
    if request.len() > 6_000_000 || approval.len() > 65536 || bundle.len() > 10_000_000 {
        return Err(JsError::new("Public proof resource limit"));
    }
    let run = || -> anyhow::Result<String> {
        let a: WalletApproval = serde_json::from_str(approval)?;
        let b: PublicBundle = serde_json::from_str(bundle)?;
        let mut report = verification::verify_market_request(
            pack().map_err(|_| anyhow::anyhow!("embedded verifier"))?,
            request.as_bytes(),
            &a,
            &b,
        )?;
        // Exact typed projections exclude unknown witness/secret fields. Schema-3
        // journals require this flag before retaining either public artifact.
        report["publicProjectionBound"] = serde_json::json!(
            serde_json::from_str::<serde_json::Value>(request)?
                == serde_json::to_value(serde_json::from_str::<verification::PublicRequest>(request)?)?
            && serde_json::from_str::<serde_json::Value>(bundle)? == serde_json::to_value(&b)?
        );
        report["verifierPackSha256"] = serde_json::json!(format!("{:x}", Sha256::digest(BYTES)));
        Ok(report.to_string())
    };
    // Return no internal witness, path or raw exception text to a dApp.
    run().map_err(|_| JsError::new("Complete market proof, calls, signature or endpoints rejected"))
}

// Projection before proving only. No validity or authorization is implied.
#[wasm_bindgen]
pub fn project_market_identity(request: &str) -> Result<String, JsError> {
    if request.len() > 6_000_000 {
        return Err(JsError::new("Public request size"));
    }
    let r: verification::PublicRequest =
        serde_json::from_str(request).map_err(|_| JsError::new("Public request encoding"))?;
    let content = r
        .user_ec_input
        .get_tx_hash()
        .map_err(|_| JsError::new("Public request identity"))?;
    Ok(serde_json::json!({"contentHash":content.to_string(),"verified":false}).to_string())
}
