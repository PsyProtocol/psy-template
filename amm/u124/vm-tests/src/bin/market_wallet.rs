//! Public SD-key driver; both names use the same verification and failure boundary.
#[tokio::main]
async fn main() -> std::process::ExitCode {
    psy_template_u124_markets::wallet_driver::main_entry().await
}
