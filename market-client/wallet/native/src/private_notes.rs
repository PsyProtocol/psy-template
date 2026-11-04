//! Public denomination-proof verification. This does not authorize a claim,
//! authenticate RPC finality or replace approved-call/UPS verification.
use anyhow::{ensure, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use bincode::Options;
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    hash::{hash_types::HashOut, poseidon::PoseidonHash},
    plonk::{
        circuit_data::VerifierCircuitData,
        config::{Hasher, PoseidonGoldilocksConfig as C},
        proof::ProofWithPublicInputs,
    },
};
use psy_common_circuit::{
    proof_minifier::pm_core::get_circuit_fingerprint_generic, serialization::PsyGateSerializer,
};
use serde::{Deserialize, Serialize};
const GOLDILOCKS: u64 = 18446744069414584321;
const FP: [u64; 4] = [
    2482434993266711942,
    6028864160300535936,
    2827549014984201026,
    3018365102481798071,
];
const SDK: &str = "246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467";
const MAGIC: &str = "1384803358401154921";
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NotePack {
    pub schema: u32,
    pub sdk_manifest: String,
    pub network_magic: String,
    pub chain_root_at_1: String,
    pub verifier_b64: String,
}
// Decimal strings are a public projection made by the wallet, not PsyJSON's
// potentially lossy JS numeric decoding or an arbitrary verifier from a page.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Packet {
    pub kind: String,
    pub contract_id: String,
    pub owner: [String; 4],
    pub amount: [String; 2],
    pub checkpoint: String,
    pub user_tree_root: [String; 4],
    pub nullifiers: [[String; 4]; 2],
    pub proofs: [Option<String>; 2],
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Context {
    pub network_magic: String,
    pub chain_root_at_1: String,
    pub contract_id: String,
    pub owner: [String; 4],
    pub checkpoint: String,
    pub user_tree_root: [String; 4],
}
fn number(s: &str) -> Result<u64> {
    ensure!(
        !s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit()),
        "decimal encoding"
    );
    let n = s.parse::<u64>()?;
    ensure!(n < GOLDILOCKS && n.to_string() == s, "canonical field");
    Ok(n)
}
fn fields(v: &[String; 4]) -> Result<[u64; 4]> {
    Ok([
        number(&v[0])?,
        number(&v[1])?,
        number(&v[2])?,
        number(&v[3])?,
    ])
}
pub struct NoteVerifier {
    pack: NotePack,
    verifier: VerifierCircuitData<F, C, 2>,
}
impl NoteVerifier {
    pub fn new(pack: NotePack) -> Result<Self> {
        ensure!(
            pack.schema == 1 && pack.sdk_manifest == SDK && pack.network_magic == MAGIC,
            "frozen note resource identity"
        );
        ensure!(
            pack.chain_root_at_1.len() == 64
                && pack
                    .chain_root_at_1
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "chain identity"
        );
        ensure!(pack.verifier_b64.len() <= 3_000_000, "note resource size");
        let verifier = VerifierCircuitData::<F, C, 2>::from_bytes(
            B64.decode(&pack.verifier_b64)?,
            &PsyGateSerializer,
        )
        .map_err(|e| anyhow::anyhow!("note verifier encoding: {e}"))?;
        ensure!(
            get_circuit_fingerprint_generic(&verifier.verifier_only)
                .elements
                .map(|f| f.to_canonical_u64())
                == FP,
            "unreviewed note circuit"
        );
        ensure!(
            verifier.common.num_public_inputs == 4,
            "note public input format"
        );
        Ok(Self { pack, verifier })
    }
    pub fn verify(&self, packet: &Packet, context: &Context) -> Result<serde_json::Value> {
        ensure!(
            context.network_magic == self.pack.network_magic
                && context.chain_root_at_1 == self.pack.chain_root_at_1,
            "note network/chain"
        );
        ensure!(
            packet.kind == "psy_private_ft_u124_v1",
            "unsupported note denomination profile"
        );
        let cid = number(&packet.contract_id)?;
        let checkpoint = number(&packet.checkpoint)?;
        let owner = fields(&packet.owner)?;
        let root = fields(&packet.user_tree_root)?;
        ensure!(
            (5..1 << 24).contains(&cid) && (1..1 << 32).contains(&checkpoint),
            "note contract/checkpoint range"
        );
        ensure!(owner != [0; 4] && root != [0; 4], "empty note owner/root");
        ensure!(
            context.contract_id == packet.contract_id
                && context.checkpoint == packet.checkpoint
                && context.owner == packet.owner
                && context.user_tree_root == packet.user_tree_root,
            "wallet note context"
        );
        let amounts = [number(&packet.amount[0])?, number(&packet.amount[1])?];
        ensure!(
            amounts.iter().all(|&v| v < 1 << 62) && amounts != [0; 2],
            "U124 denominations"
        );
        let nullifiers = [
            fields(&packet.nullifiers[0])?,
            fields(&packet.nullifiers[1])?,
        ];
        if amounts.iter().all(|&v| v > 0) {
            ensure!(
                nullifiers[0] != nullifiers[1],
                "duplicate denomination nullifier"
            );
        }
        let mut count = 0;
        for i in 0..2 {
            if amounts[i] == 0 {
                ensure!(
                    packet.proofs[i].is_none() && nullifiers[i] == [0; 4],
                    "zero denomination payload"
                );
                continue;
            }
            ensure!(nullifiers[i] != [0; 4], "empty nullifier");
            let encoded = packet.proofs[i]
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("missing denomination proof"))?;
            ensure!(
                !encoded.is_empty() && encoded.len() <= 3_000_000,
                "note proof size"
            );
            let bytes = B64.decode(encoded)?;
            // Exact frozen SDK bincode format; reject suffixes and allocation bombs.
            let proof: ProofWithPublicInputs<F, C, 2> = bincode::DefaultOptions::new()
                .with_fixint_encoding()
                .with_limit(2_000_000)
                .reject_trailing_bytes()
                .deserialize(&bytes)?;
            let mut values = owner.to_vec();
            values.push(amounts[i]);
            values.extend(root);
            values.extend([checkpoint, 293601306 + i as u64, cid]);
            values.extend(nullifiers[i]);
            let want: HashOut<F> = PoseidonHash::hash_no_pad(
                &values
                    .into_iter()
                    .map(F::from_canonical_u64)
                    .collect::<Vec<_>>(),
            );
            ensure!(
                proof.public_inputs == want.elements,
                "note public input binding"
            );
            self.verifier.verify(proof)?;
            count += 1;
        }
        Ok(
            serde_json::json!({"schema":1,"verified":true,"amount":(amounts[0] as u128 + ((amounts[1] as u128)<<62)).to_string(),"contractId":packet.contract_id,"proofCount":count,"scope":"denomination-notes-only","claimAuthorized":false,"finalityVerified":false}),
        )
    }
}
