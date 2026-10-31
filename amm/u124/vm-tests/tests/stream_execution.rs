//! Pure native preflight boundary tests. No circuit/proof build or RPC.
use anyhow::Result;
use psy_template_u124_markets::{
    final_state_coverage::Snapshot,
    source_review,
    stream_execution::{source_vault_path, validate_request},
    stream_policy::Request,
    stream_source::SourcePage,
};
#[test]
fn stream_native_actions_require_prepared_transport(){
    for action in ["preflight","quote","register","check-registration","identity","broadcast-prepared","verify-prepared","serve-preflight"]{
        psy_template_u124_markets::stream_execution::validate_action(action).unwrap();
    }
    for action in ["submit","producer-order","unknown",""]{
        assert!(psy_template_u124_markets::stream_execution::validate_action(action).is_err());
    }
}
#[test]
#[ignore = "explicit immutable public fixture paths required"]
fn maintenance_page_tracks_original_frozen_header_and_rejects_stale_planning() -> Result<()> {
    let review = source_review::review(std::path::Path::new(&std::env::var("STREAM_REVIEW")?))?.0;
    let source: Snapshot =
        serde_json::from_slice(&std::fs::read(std::env::var("STREAM_SOURCE")?)?)?;
    let mut request: Request =
        serde_json::from_slice(&std::fs::read(std::env::var("STREAM_REQUEST")?)?)?;
    let (_, page) = SourcePage::inactive_maintenance(&review, &source)?;
    request.fields[0] = 13;
    request.source = page;
    validate_request(&review, &source, &request)?;
    let original = serde_json::to_vec(&source)?;
    let mut stale = source.clone();
    stale.fields[6] -= 1;
    request.source = SourcePage::inactive_maintenance(&review, &stale)?.1;
    assert!(validate_request(&review, &source, &request).is_err());
    assert_eq!(serde_json::to_vec(&source)?, original);
    request.source = SourcePage::inactive_maintenance(&review, &source)?.1;
    request.fields.pop();
    assert!(validate_request(&review, &source, &request).is_err());
    let mut duplicate = source.clone();
    duplicate.accounts.push(source.accounts[0].clone());
    assert!(source_vault_path(&duplicate).is_err());
    let mut short = source.clone();
    short.fields.clear();
    assert!(source_vault_path(&short).is_err());
    source_vault_path(&source)?;
    Ok(())
}
