//! Rebuild a sender-side L2 claim proof for an already-recorded L1 deposit.
//! This avoids depositing a second time if a wallet's optional proof export
//! fails after its L1 transaction succeeded. It changes no psy-node source.

use std::{env, fs, str::FromStr};

use anyhow::{bail, ensure, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::{Field, PrimeField64}},
    plonk::config::PoseidonGoldilocksConfig,
};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::privacy::deposit_inclusion::DepositInclusionInput;
use psy_common_circuit::circuits::traits::qstandard::QStandardCircuit;
use psy_crypto::{
    hash::{merkle::core::MerkleProofCore, traits::hasher::{FieldQHasher, PoseidonHasher}},
    shield_address::{derive_note_commitment, derive_nullifier_hash, derive_shield_address, qhashout_to_u32x8_be, shield_address_to_bytes32},
};
use psy_dpn_circuit::circuits::privacy::deposit_inclusion::DepositInclusionCircuit;
use serde_json::{json, Value};

fn field<'a>(value: &'a Value, name: &str) -> Result<&'a Value> {
    value.get(name).with_context(|| format!("missing {name}"))
}

fn string<'a>(value: &'a Value, name: &str) -> Result<&'a str> {
    field(value, name)?.as_str().with_context(|| format!("{name} is not a string"))
}

fn integer(value: &Value, name: &str) -> Result<u64> {
    field(value, name)?.as_u64().with_context(|| format!("{name} is not a u64"))
}

fn words4(value: &Value, name: &str) -> Result<[u64; 4]> {
    let list = field(value, name)?.as_array().with_context(|| format!("{name} is not an array"))?;
    ensure!(list.len() == 4, "{name} needs four limbs");
    Ok(std::array::from_fn(|index| list[index].as_u64().expect("validated u64 limb")))
}

fn bytes32(raw: &str) -> Result<[u8; 32]> {
    Ok(hex::decode(raw.trim_start_matches("0x"))?.try_into().map_err(|_| anyhow::anyhow!("expected bytes32"))?)
}

fn bytes32_words(raw: &str) -> Result<[u32; 8]> {
    let bytes = bytes32(raw)?;
    Ok(std::array::from_fn(|i| u32::from_be_bytes(bytes[i * 4..i * 4 + 4].try_into().unwrap())))
}

fn address_words(raw: &str) -> Result<[u32; 8]> {
    let bytes = hex::decode(raw.trim_start_matches("0x"))?;
    let full: [u8; 32] = match bytes.len() {
        20 => { let mut padded = [0u8; 32]; padded[12..].copy_from_slice(&bytes); padded },
        32 => bytes.try_into().unwrap(),
        _ => bail!("expected 20- or 32-byte address"),
    };
    Ok(std::array::from_fn(|i| u32::from_be_bytes(full[i * 4..i * 4 + 4].try_into().unwrap())))
}

fn amount_words(raw: &str) -> Result<[u32; 8]> {
    let mut words = [0u32; 8];
    for byte in raw.bytes() {
        ensure!(byte.is_ascii_digit(), "amount is not decimal");
        let mut carry = (byte - b'0') as u64;
        for word in words.iter_mut().rev() {
            let next = *word as u64 * 10 + carry;
            *word = next as u32;
            carry = next >> 32;
        }
        ensure!(carry == 0, "amount overflows uint256");
    }
    Ok(words)
}

fn qhash_be(raw: &str) -> Result<QHashOut<F>> {
    let b = bytes32(raw)?;
    Ok(QHashOut::from_values(
        u64::from_be_bytes(b[0..8].try_into().unwrap()),
        u64::from_be_bytes(b[8..16].try_into().unwrap()),
        u64::from_be_bytes(b[16..24].try_into().unwrap()),
        u64::from_be_bytes(b[24..32].try_into().unwrap()),
    ))
}

fn qhash_internal(raw: &str) -> Result<QHashOut<F>> {
    let b = bytes32(raw)?;
    let w: [u32; 8] = std::array::from_fn(|i| u32::from_be_bytes(b[i * 4..i * 4 + 4].try_into().unwrap()));
    Ok(QHashOut::from_values(
        w[0] as u64 | ((w[1] as u64) << 32),
        w[2] as u64 | ((w[3] as u64) << 32),
        w[4] as u64 | ((w[5] as u64) << 32),
        w[6] as u64 | ((w[7] as u64) << 32),
    ))
}

fn limbs(hash: QHashOut<F>) -> [u64; 4] {
    hash.0.elements.map(|x| x.to_canonical_u64())
}

fn decimal4(hash: QHashOut<F>) -> [String; 4] {
    limbs(hash).map(|value| value.to_string())
}

fn decimal8(words: [u32; 8]) -> [String; 8] {
    words.map(|value| value.to_string())
}

fn deposit_leaf(shield: [u32; 8], token: [u32; 8], l2_token: [u32; 8], amount: [u32; 8], source: u32, note: [u32; 8]) -> QHashOut<F> {
    let mut felts = Vec::with_capacity(41);
    for group in [shield, token, l2_token, amount] {
        felts.extend(group.map(|x| F::from_canonical_u64(x as u64)));
    }
    felts.push(F::from_canonical_u64(source as u64));
    felts.extend(note.map(|x| F::from_canonical_u64(x as u64)));
    PoseidonHasher::q_hash_many(&felts)
}

fn main() -> Result<()> {
    let mut args = env::args().skip(1);
    let secrets_path = args.next().context("usage: deposit_proof <secrets.json> <service.json> <output.json>")?;
    let service_path = args.next().context("service response path missing")?;
    let output_path = args.next().context("output path missing")?;
    ensure!(args.next().is_none(), "too many arguments");
    let local: Value = serde_json::from_str(&fs::read_to_string(secrets_path)?)?;
    let response: Value = serde_json::from_str(&fs::read_to_string(service_path)?)?;
    ensure!(field(&response, "success")?.as_bool() == Some(true), "service proof request failed");
    let ready = field(&response, "data")?;
    ensure!(field(ready, "found")?.as_bool() == Some(true), "deposit proof not yet ready");
    let deposit = field(ready, "deposit")?;

    let user_id = integer(&local, "user_id")?;
    let r0 = integer(&local, "r0")?;
    let r1 = integer(&local, "r1")?;
    let note_secret = words4(&local, "note_secret")?;
    let nullifier_secret = words4(&local, "nullifier_secret")?;
    let local_shield = shield_address_to_bytes32(derive_shield_address(user_id, r0, r1));
    ensure!(local_shield == bytes32(string(deposit, "shield_address")?)?, "shield address mismatch");
    let local_note = derive_note_commitment(nullifier_secret, note_secret);
    let local_note_bytes: Vec<u8> = limbs(local_note).iter().flat_map(|x| x.to_be_bytes()).collect();
    ensure!(local_note_bytes == bytes32(string(deposit, "note_commitment")?)?, "note commitment mismatch");
    ensure!(string(deposit, "token_address")?.eq_ignore_ascii_case(string(&local, "token_l1_address")?), "token address mismatch");
    ensure!(string(deposit, "amount")? == integer(&local, "amount")?.to_string(), "amount mismatch");
    ensure!(integer(deposit, "source_chain_id")? == 0, "wrong source chain");

    let shield = qhash_be(string(deposit, "shield_address")?)?;
    let note = qhash_be(string(deposit, "note_commitment")?)?;
    let token = address_words(string(deposit, "token_address")?)?;
    let l2_token = address_words(string(deposit, "l2_token_contract_id")?)?;
    let amount = amount_words(string(deposit, "amount")?)?;
    let root = qhash_internal(string(ready, "proved_root")?)?;
    let leaf = QHashOut::<F>::from_str(string(ready, "leaf_hash")?.trim_start_matches("0x"))
        .map_err(|err| anyhow::anyhow!("invalid leaf hash: {err}"))?;
    let expected_leaf = deposit_leaf(qhashout_to_u32x8_be(shield), token, l2_token, amount, 0, bytes32_words(string(deposit, "note_commitment")?)?);
    ensure!(leaf == expected_leaf, "service leaf differs from local commitment");
    let siblings = field(ready, "siblings")?.as_array().context("siblings are missing")?
        .iter().map(|v| qhash_internal(v.as_str().expect("sibling hex"))).collect::<Result<Vec<_>>>()?;
    let index = integer(ready, "chain_local_deposit_index")?;
    let merkle = MerkleProofCore { root, value: leaf, index, siblings };
    let input = DepositInclusionInput::<F> {
        nullifier_secret: nullifier_secret.map(F::from_canonical_u64),
        note_secret: note_secret.map(F::from_canonical_u64),
        shield_address: shield,
        deposit_index: index,
        token_address: token,
        l2_token_contract_id: l2_token,
        amount,
        source_chain_index: 0,
        deposit_root: root,
        deposit_proof: merkle,
    };
    let circuit = DepositInclusionCircuit::<PoseidonGoldilocksConfig, 2>::new();
    let proof = circuit.prove(&input)?;
    let nullifier = derive_nullifier_hash(nullifier_secret);
    let output = json!({
        "type": "deposit_inclusion_proof",
        "version": 1,
        "shield_address": decimal4(shield),
        "amount_u32x8": decimal8(amount),
        "token_address_u32x8": decimal8(token),
        "l2_token_contract_id": decimal8(l2_token),
        "source_chain_index": "0",
        "deposit_index": index.to_string(),
        "deposit_root": decimal4(root),
        "nullifier": decimal4(nullifier),
        "nullifier_hash": decimal4(nullifier),
        "note_commitment": decimal4(note),
        "deposit_leaf": decimal4(leaf),
        "proved_deposit_count": integer(ready, "proved_deposit_count")?.to_string(),
        "checkpoint_id": ready.get("checkpoint_id").and_then(Value::as_u64).map(|x| x.to_string()),
        "deposit_proof_fingerprint": decimal4(circuit.get_fingerprint()),
        "deposit_proof_bincode_b64": BASE64.encode(proof.to_bytes()),
    });
    fs::write(&output_path, serde_json::to_string_pretty(&output)?)?;
    println!("generated deposit inclusion proof for index {index} at {output_path}");
    Ok(())
}
