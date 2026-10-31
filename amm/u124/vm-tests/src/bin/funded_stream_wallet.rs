//! Dedicated deterministic source-funded key. Generic wallet entry points do
//! not enable this policy, and this driver never imports an ordinary key.
#[path="compact_market_wallet.rs"]
mod driver;
#[tokio::main]
async fn main()->std::process::ExitCode{driver::execute_stream().await}
