use std::env;

use psy_template_orderbook_sdkey::build_orderbook_sd_key_circuit;

fn main() -> anyhow::Result<()> {
    let contract_id = env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("usage: fingerprint <deployed-orderbook-contract-id>"))?
        .parse::<u64>()?;
    anyhow::ensure!(contract_id >= 5, "orderbook contract ID must not be a genesis token ID");
    println!("{}", build_orderbook_sd_key_circuit(contract_id)?.get_fingerprint());
    Ok(())
}
