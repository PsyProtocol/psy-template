//! Register both mutually bound public vaults. Never transfers assets.
//! IDs are planned from the registration counter, then verified after inclusion.
//! Any intervening registration aborts funding; bindings are never weakened.
use anyhow::{ensure, Context, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::Field},
    hash::hash_types::HashOut,
};
use psy_client_common::data::qhashout::QHashOut;
use psy_config::PsyConfigGoldilocks;
use psy_core::user_id::get_user_id_from_user_registration_id;
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_prover::session::session::WalletSession;
use psy_template_bondingcurve_sdkey::{build_curve_sd_key_circuit, LaunchConfig};
use psy_template_launchamm_sdkey::{build_launch_amm_sd_key_circuit, PoolConfig};
use serde_json::{json, Value};
use std::{env, fs, io::Write, time::Duration};
#[tokio::main]
async fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    ensure!(
        a.len() == 4,
        "register_pair <launch-and-pool-plan.json> <rpc-config.json> <new-output-directory>"
    );
    let plan: Value = serde_json::from_slice(&fs::read(&a[1])?)?;
    let pc = PsyConfigGoldilocks::from_file(&a[2])?;
    let mut network = pc.get_current_network()?.clone();
    network.prove_proxy_url.clear();
    let mut session = WalletSession::new(&network).await?;
    let rpc = network.realm_configs[0]
        .rpc_url
        .first()
        .context("coordinator RPC absent")?;
    let latest: Value = reqwest::Client::new()
        .post(rpc)
        .json(&json!({"jsonrpc":"2.0","id":1,"method":"psy_get_latest_l2_block_state","params":{}}))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let counter = latest["result"]["next_user_id"]
        .as_u64()
        .context("registration counter unavailable")?;
    let curve_user = get_user_id_from_user_registration_id(
        counter,
        network.global_user_tree_height - network.realm_user_tree_height,
        network.realm_user_tree_height,
        network.group_realm_height,
    );
    let pool_user = get_user_id_from_user_registration_id(
        counter + 1,
        network.global_user_tree_height - network.realm_user_tree_height,
        network.realm_user_tree_height,
        network.group_realm_height,
    );
    let curve_id = plan["curveContractId"]
        .as_u64()
        .context("curve ID absent")?;
    let pool_id = plan["poolContractId"].as_u64().context("pool ID absent")?;
    let mut launch_json = plan["launch"].clone();
    launch_json["targetId"] = json!(pool_user);
    let mut pool_json = plan["pool"].clone();
    pool_json["curveVaultId"] = json!(curve_user);
    pool_json["poolUserId"] = json!(pool_user);
    pool_json["poolContractId"] = json!(pool_id);
    let launch: LaunchConfig = serde_json::from_value(launch_json.clone())?;
    let pool: PoolConfig = serde_json::from_value(pool_json.clone())?;
    ensure!(
        launch.token_id == pool.token_id
            && launch.issuer_id == pool.issuer_id
            && pool.curve_contract_id == curve_id,
        "plan bindings mismatch"
    );
    let curve_circuit = build_curve_sd_key_circuit(curve_id, launch)?;
    let curve_fp = curve_circuit.get_fingerprint();
    let pool_circuit = build_launch_amm_sd_key_circuit(pool_id, pool)?;
    let pool_fp = pool_circuit.get_fingerprint();
    session
        .wallet
        .insert_sd_key_circuit(curve_fp, curve_circuit);
    session.wallet.insert_sd_key_circuit(pool_fp, pool_circuit);
    fs::create_dir(&a[3])?;
    for (name, value) in [
        ("curve.launch-config.json", launch_json),
        ("pool.config.json", pool_json),
    ] {
        let mut f = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(format!("{}/{}", a[3], name))?;
        f.write_all(serde_json::to_string_pretty(&value)?.as_bytes())?;
        f.sync_all()?;
    }
    let curve_key = QHashOut(HashOut {
        elements: [F::from_canonical_u64(3); 4],
    });
    let pool_key = QHashOut(HashOut {
        elements: [F::from_canonical_u64(4); 4],
    });
    let curve_public = session
        .wallet
        .get_or_create_user(curve_key, curve_fp)
        .await?
        .qfhash::<psy_client_data::config::store_config::PsyHasher>();
    let pool_public = session
        .wallet
        .get_or_create_user(pool_key, pool_fp)
        .await?
        .qfhash::<psy_client_data::config::store_config::PsyHasher>();
    let public = json!({"counter":counter,"curveUserId":curve_user,"poolUserId":pool_user,"curvePublicKeyHash":curve_public.to_string(),"poolPublicKeyHash":pool_public.to_string(),"curveFingerprint":curve_fp.to_string(),"poolFingerprint":pool_fp.to_string(),"fundingAuthorized":false});
    let mut intent = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(format!("{}/registration-attempt.json", a[3]))?;
    intent.write_all(&serde_json::to_vec_pretty(&public)?)?;
    intent.sync_all()?;
    ensure!(
        session.register_user(curve_key, curve_fp).await? == curve_public,
        "curve identity changed"
    );
    ensure!(
        session.register_user(pool_key, pool_fp).await? == pool_public,
        "pool identity changed"
    );
    for _ in 0..24 {
        let c = session
            .st_provider
            .get_user_ids_for_public_key(curve_public)
            .await?;
        let p = session
            .st_provider
            .get_user_ids_for_public_key(pool_public)
            .await?;
        if !c.is_empty() && !p.is_empty() {
            ensure!(
                c == vec![curve_user] && p == vec![pool_user],
                "registration race: actual {:?}/{:?}, planned {}/{}; DO NOT FUND",
                c,
                p,
                curve_user,
                pool_user
            );
            let mut verified = public.clone();
            verified["fundingAuthorized"] = json!(true);
            fs::write(
                format!("{}/registration-verified.json", a[3]),
                serde_json::to_vec_pretty(&verified)?,
            )?;
            println!("verified fixed-bound public vault pair: {}", verified);
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
    anyhow::bail!("registrations not confirmed; DO NOT FUND; inspect attempt before retrying")
}
