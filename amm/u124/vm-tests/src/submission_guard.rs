//! Application-side RPC bindings, not SD-key code-root authentication.
use anyhow::{ensure, Context, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::PrimeField64};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{
    qdata::contract::PsyContractLeaf, traits::qdatastore::qmetadata::QMetaDataStoreReaderSync,
};
use psy_provider::provider::RpcProvider;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContractBinding {
    pub contract_id: u64,
    pub code_root: String,
    pub layout_root: String,
    pub state_tree_height: u64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionGuard {
    pub version: u64,
    pub network: String,
    pub market_id: u64,
    pub vault_id: u64,
    pub fingerprint: String,
    pub public_key_hash: String,
    pub contracts: Vec<ContractBinding>,
}
fn canonical_hash(s: &str) -> Result<()> {
    ensure!(
        s.len() == 64
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
        "guard hash encoding"
    );
    let value: QHashOut<F> = s.parse()?;
    ensure!(value.to_string() == s, "noncanonical guard hash");
    Ok(())
}
impl ContractBinding {
    pub fn check_leaf(&self, leaf: &PsyContractLeaf<F>) -> Result<()> {
        ensure!(
            leaf.code_root.to_string() == self.code_root,
            "guard code root changed for {}",
            self.contract_id
        );
        ensure!(
            leaf.state_layout_root.to_string() == self.layout_root,
            "guard layout root changed for {}",
            self.contract_id
        );
        ensure!(
            leaf.state_tree_height.to_canonical_u64() == self.state_tree_height,
            "guard state height changed for {}",
            self.contract_id
        );
        Ok(())
    }
}
impl SubmissionGuard {
    pub fn validate(
        &self,
        spec: &Value,
        network: &str,
        fingerprint: &str,
        public_key_hash: &str,
    ) -> Result<()> {
        ensure!(
            self.version == 1 && self.network == network,
            "guard network/version binding"
        );
        ensure!(
            self.market_id >= 5 && Some(self.market_id) == spec["market_id"].as_u64(),
            "guard market binding"
        );
        ensure!((1..16777216).contains(&self.vault_id), "guard vault range");
        canonical_hash(&self.fingerprint)?;
        canonical_hash(&self.public_key_hash)?;
        ensure!(
            self.fingerprint == fingerprint && self.public_key_hash == public_key_hash,
            "guard SD-key identity binding"
        );
        ensure!(
            !self.contracts.is_empty() && self.contracts.len() <= 64,
            "guard contract count"
        );
        let mut bound = BTreeSet::new();
        for c in &self.contracts {
            ensure!(
                c.contract_id < 16777216 && bound.insert(c.contract_id),
                "duplicate/invalid guard contract"
            );
            ensure!(
                (1..=32).contains(&c.state_tree_height),
                "guard state height range"
            );
            canonical_hash(&c.code_root)?;
            canonical_hash(&c.layout_root)?;
        }
        let mut required = BTreeSet::new();
        for branch in spec["branches"]
            .as_array()
            .context("guard policy branches")?
        {
            for call in branch["calls"].as_array().context("guard policy calls")? {
                required.insert(
                    call["contract_id"]
                        .as_u64()
                        .context("guard policy contract")?,
                );
            }
        }
        ensure!(
            bound == required && bound.contains(&0) && bound.contains(&self.market_id),
            "guard must cover every policy contract, including PSY"
        );
        Ok(())
    }
    pub async fn check_current(&self, provider: &RpcProvider) -> Result<()> {
        let hash: QHashOut<F> = self.public_key_hash.parse()?;
        ensure!(
            provider.get_user_ids_for_public_key(hash).await? == vec![self.vault_id],
            "guard vault registration changed"
        );
        crate::guard_reads::checked(&self.contracts, crate::guard_reads::concurrency()?, |c| async move {
            c.check_leaf(&provider.get_contract_leaf_data(c.contract_id).await?)
        }).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use plonky2::field::types::Field;
    use serde_json::json;
    fn spec() -> Value {
        json!({"market_id":1000,"branches":[{"calls":[{"contract_id":0},{"contract_id":42},{"contract_id":1000}]}]})
    }
    fn guard() -> SubmissionGuard {
        serde_json::from_value(json!({"version":1,"network":"test","marketId":1000,"vaultId":100,"fingerprint":"1".repeat(64),"publicKeyHash":"2".repeat(64),"contracts":([0,42,1000].map(|id|json!({"contractId":id,"codeRoot":"3".repeat(64),"layoutRoot":"4".repeat(64),"stateTreeHeight":31})))})).unwrap()
    }
    fn valid(g: &SubmissionGuard) -> Result<()> {
        g.validate(&spec(), "test", &"1".repeat(64), &"2".repeat(64))
    }
    #[test]
    fn exact_contract_coverage_and_identity_are_required() {
        assert!(valid(&guard()).is_ok());
        for index in 0..3 {
            let mut g = guard();
            g.contracts.remove(index);
            assert!(valid(&g).is_err());
        }
        let mut g = guard();
        g.contracts.push(g.contracts[0].clone());
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.contracts[0].contract_id = 7;
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.network = "other".into();
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.market_id = 1001;
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.fingerprint = "5".repeat(64);
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.public_key_hash = "6".repeat(64);
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.vault_id = 0;
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.contracts[0].code_root = "f".repeat(64);
        assert!(valid(&g).is_err());
        let mut g = guard();
        g.contracts[0].state_tree_height = 33;
        assert!(valid(&g).is_err());
        assert!(
            serde_json::from_value::<SubmissionGuard>(json!({"version":1,"ignoreRoots":true}))
                .is_err()
        );
    }
    #[test]
    fn changed_code_layout_and_height_fail_before_broadcast() {
        let binding = guard().contracts.remove(0);
        let leaf = PsyContractLeaf::<F> {
            code_root: binding.code_root.parse().unwrap(),
            state_layout_root: binding.layout_root.parse().unwrap(),
            state_tree_height: F::from_canonical_u64(31),
            ..Default::default()
        };
        assert!(binding.check_leaf(&leaf).is_ok());
        let mut wrong = leaf;
        wrong.code_root = QHashOut::ZERO;
        assert!(binding.check_leaf(&wrong).is_err());
        let mut wrong = leaf;
        wrong.state_layout_root = QHashOut::ZERO;
        assert!(binding.check_leaf(&wrong).is_err());
        let mut wrong = leaf;
        wrong.state_tree_height = F::from_canonical_u64(32);
        assert!(binding.check_leaf(&wrong).is_err());
    }
    #[tokio::test]
    async fn repeated_checks_fetch_current_rpc_leaves_and_registration() -> Result<()> {
        use std::{
            collections::HashMap,
            io::{Read, Write},
            net::TcpListener,
            sync::{
                atomic::{AtomicBool, AtomicUsize, Ordering},
                Arc,
            },
            time::Duration,
        };
        let listener = TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let url = format!("http://{}", listener.local_addr()?);
        let phase = Arc::new(AtomicUsize::new(0));
        let stopped = Arc::new(AtomicBool::new(false));
        let phase_server = phase.clone();
        let stop_server = stopped.clone();
        let server = std::thread::spawn(move || -> Result<()> {
            while !stop_server.load(Ordering::SeqCst) {
                let (mut stream, _) = match listener.accept() {
                    Ok(s) => s,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(2));
                        continue;
                    }
                    Err(e) => return Err(e.into()),
                };
                stream.set_nonblocking(false)?;
                stream.set_read_timeout(Some(Duration::from_secs(2)))?;
                let mut bytes = Vec::new();
                let mut chunk = [0; 4096];
                let request: Value = loop {
                    let n = stream.read(&mut chunk)?;
                    ensure!(n > 0, "truncated test HTTP request");
                    bytes.extend_from_slice(&chunk[..n]);
                    if let Some(pos) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = std::str::from_utf8(&bytes[..pos])?;
                        let len = headers
                            .lines()
                            .find_map(|l| {
                                l.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>())
                            })
                            .context("test content length")??;
                        if bytes.len() >= pos + 4 + len {
                            break serde_json::from_slice(&bytes[pos + 4..pos + 4 + len])?;
                        }
                    }
                };
                let phase = phase_server.load(Ordering::SeqCst);
                let result = match request["method"].as_str().context("test RPC method")? {
                    "psy_get_user_ids_for_public_key" => {
                        json!(if phase == 4 { vec![101] } else { vec![100] })
                    }
                    "psy_get_contract_leaf_data" => {
                        let id = request["params"]["contract_id"]
                            .as_u64()
                            .context("test contract ID")?;
                        let mut leaf = PsyContractLeaf::<F> {
                            code_root: "3".repeat(64).parse()?,
                            state_layout_root: "4".repeat(64).parse()?,
                            state_tree_height: F::from_canonical_u64(31),
                            ..Default::default()
                        };
                        if phase == 1 && id == 0 {
                            leaf.code_root = QHashOut::ZERO;
                        }
                        if phase == 2 && id == 42 {
                            leaf.state_layout_root = QHashOut::ZERO;
                        }
                        if phase == 3 && id == 1000 {
                            leaf.state_tree_height = F::from_canonical_u64(32);
                        }
                        serde_json::to_value(leaf)?
                    }
                    _ => anyhow::bail!("only read RPCs are permitted in guard test"),
                };
                let response = serde_json::to_vec(
                    &json!({"jsonrpc":"2.0","id":request["id"],"result":result}),
                )?;
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",response.len())?;
                stream.write_all(&response)?;
            }
            Ok(())
        });
        let provider = RpcProvider {
            client: Arc::new(
                reqwest::Client::builder()
                    .timeout(Duration::from_secs(3))
                    .build()?,
            ),
            realm_configs: HashMap::new(),
            coordinator_configs: HashMap::from([(0, vec![url])]),
            users_per_realm: 1024,
            current_user_id: 0,
        };
        let result = async {
            let g = guard();
            g.check_current(&provider).await?;
            for (value, expected) in [
                (1, "code root"),
                (2, "layout root"),
                (3, "state height"),
                (4, "vault registration"),
            ] {
                phase.store(value, Ordering::SeqCst);
                let error = g
                    .check_current(&provider)
                    .await
                    .expect_err("fresh RPC mutation must fail");
                ensure!(
                    error.to_string().contains(expected),
                    "unexpected check failure: {error}"
                );
            }
            phase.store(0, Ordering::SeqCst);
            g.check_current(&provider).await?;
            Ok::<(), anyhow::Error>(())
        }
        .await;
        stopped.store(true, Ordering::SeqCst);
        server.join().expect("test server thread")?;
        result
    }
}
