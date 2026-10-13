use anyhow::bail;
use psy_template_u124_markets::runtime::{contain, Failure, Progress};
use std::sync::atomic::{AtomicUsize, Ordering};

#[tokio::test]
async fn panic_after_await_discards_session_without_submission() {
    let submits = AtomicUsize::new(0);
    let result: Result<(), Failure> = contain(async {
        tokio::task::yield_now().await;
        panic!("SplitBits: target bits must be less than num_bits");
        #[allow(unreachable_code)]
        {
            submits.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    })
    .await;
    let error = result.unwrap_err();
    assert!(matches!(error, Failure::Panic("invalid_amount_range")));
    assert_eq!(submits.load(Ordering::SeqCst), 0);
    let report = Progress::default().failure(&error);
    assert_eq!(report["submitted"], false);
    assert_eq!(report["status"], "rejected_before_submission");
}

#[tokio::test]
async fn ordinary_rejection_and_unknown_panic_do_not_look_successful() {
    let result: Result<(), Failure> = contain(async { bail!("slippage") }).await;
    let report = Progress::default().failure(&result.unwrap_err());
    assert_eq!(report["reason"], "slippage");
    let result: Result<(), Failure> = contain(async { panic!("sensitive diagnostic") }).await;
    let report = Progress::default().failure(&result.unwrap_err());
    assert_eq!(report["error"], "sdk_runtime_panic");
    assert!(!report.to_string().contains("sensitive diagnostic"));
}

#[tokio::test]
async fn lost_response_and_panic_after_transmission_require_reconciliation() {
    for panic in [false, true] {
        let mut progress = Progress::default();
        let result: Result<(), Failure> = contain(async {
            progress.end_user_leaf_hash = Some("exact leaf".into());
            progress.user_id = Some(490560);
            progress.nonce = Some(3);
            progress.broadcast_attempted = true;
            if panic {
                panic!("transport panic");
            }
            bail!("connection closed after request was sent")
        })
        .await;
        let report = progress.failure(&result.unwrap_err());
        assert!(report["submitted"].is_null());
        assert_eq!(report["status"], "submission_unknown");
        assert_eq!(report["endUserLeafHash"], "exact leaf");
        assert_eq!(report["retryAllowed"], false);
    }
}

#[tokio::test]
async fn success_returns_the_verified_result() {
    assert_eq!(contain(async { Ok(123u64) }).await.unwrap(), 123);
}
