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
    request.settled=1;
    assert!(validate_request(&review,&source,&request).is_err());
    request.settled=0;
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

#[test]
#[ignore="explicit immutable review/source fixture paths required"]
fn native_identity_uses_market_height_31_and_all_reviewed_metadata()->Result<()>{
    use plonky2::field::{goldilocks_field::GoldilocksField as F,types::Field};
    let review=source_review::review(std::path::Path::new(&std::env::var("STREAM_REVIEW")?))?.0;
    let source:Snapshot=serde_json::from_slice(&std::fs::read(std::env::var("STREAM_SOURCE")?)?)?;
    assert_eq!(review.market_binding().height,31);
    for binding in review.assets.iter().cloned().chain([review.market_binding()]){
        let leaf=source.contracts.iter().find(|p|p.id==binding.id).unwrap().leaf;
        binding.check_leaf(&leaf)?;
        for field in 0..6 {
            let mut wrong=leaf;
            match field {
                0=>wrong.code_root.0.elements[0]+=F::ONE,
                1=>wrong.state_layout_root.0.elements[0]+=F::ONE,
                2=>wrong.function_tree_root.0.elements[0]+=F::ONE,
                3=>wrong.state_tree_height+=F::ONE,
                4=>wrong.state_layout_field_count+=F::ONE,
                _=>wrong.state_layout_slot_count+=F::ONE,
            }
            assert!(binding.check_leaf(&wrong).is_err(),"metadata substitution {field}");
        }
        binding.check_leaf(&leaf)?;
    }Ok(())
}
