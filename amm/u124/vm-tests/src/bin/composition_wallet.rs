//! Separate funded controller entry. Shared transport/proof guards, dedicated
//! composition key (including authenticated empty first-account constraint).
#[path="compact_market_wallet.rs"]
mod shared;
#[tokio::main]
async fn main()->std::process::ExitCode{shared::execute_composition().await}
