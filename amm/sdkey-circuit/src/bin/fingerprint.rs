use std::env;

use psy_template_amm_sdkey::build_amm_sd_key_circuit;

fn main() -> anyhow::Result<()> {
    let contract_id = env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("usage: fingerprint <deployed-amm-contract-id>"))?
        .parse::<u64>()?;
    anyhow::ensure!(
        contract_id >= 5,
        "AMM contract ID must not be a genesis token ID"
    );
    let circuit = build_amm_sd_key_circuit(contract_id)?;
    println!("{}", circuit.get_fingerprint());
    Ok(())
}
