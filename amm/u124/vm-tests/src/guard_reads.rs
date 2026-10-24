//! Schedule independent PUBLIC guard reads; never cache state or skip checks.
use anyhow::{ensure, Result};
use std::future::Future;

/// Only the read-only public guard uses this classification. A retry never
/// turns a failed identity/layout/nonce check into an accepted transaction.
pub fn retryable_public_transport(reason: &str) -> bool {
    (reason.contains("Connection error to https://") || reason.contains("Request error to https://"))
        && reason.contains("error sending request for url")
}

pub fn concurrency() -> Result<usize> {
    match std::env::var("PSY_MARKET_GUARD_READ_MODE").as_deref() {
        Err(std::env::VarError::NotPresent) | Ok("parallel-v1") => Ok(4),
        Ok("serial-v1") => Ok(1), // identical checks, controlled calibration only
        _ => anyhow::bail!("unknown public guard read mode"),
    }
}

pub async fn checked<'a, T, C, Fut>(items: &'a [T], limit: usize, check: C) -> Result<()>
where C: Fn(&'a T) -> Fut, Fut: Future<Output = Result<()>> {
    ensure!(limit == 1 || limit == 4, "reviewed public guard concurrency");
    for chunk in items.chunks(limit) {
        // Complete every started read before propagating an error. No later
        // chunk, proof, signature or broadcast starts after a failed check.
        let results = futures_util::future::join_all(chunk.iter().map(&check)).await;
        for result in results { result?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
    #[test]
    fn only_observed_transport_errors_are_repeated() {
        for kind in ["Connection", "Request"] { assert!(retryable_public_transport(&format!("{kind} error to https://example.invalid: error sending request for url"))); }
        for reason in ["layout mismatch", "expired window", "wrong network", "Request error to https://example.invalid: invalid proof"] { assert!(!retryable_public_transport(reason)); }
    }
    #[tokio::test]
    async fn same_checks_bounded_and_failed_chunk_drained() {
        for limit in [1, 4] {
            let active = AtomicUsize::new(0); let peak = AtomicUsize::new(0);
            let finished = AtomicUsize::new(0); let seen = AtomicUsize::new(0);
            let values = [0,1,2,3,4,5,6,7];
            let result = checked(&values, limit, |v| {
                let v = *v; let (active,peak,finished,seen) = (&active,&peak,&finished,&seen);
                async move {
                    seen.fetch_add(1, SeqCst);
                    let n = active.fetch_add(1, SeqCst) + 1; peak.fetch_max(n, SeqCst);
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                    active.fetch_sub(1, SeqCst); finished.fetch_add(1, SeqCst);
                    ensure!(v != 0, "changed dependency"); Ok(())
                }
            }).await;
            assert!(result.is_err()); assert_eq!(active.load(SeqCst), 0);
            assert_eq!(finished.load(SeqCst), limit); assert_eq!(seen.load(SeqCst), limit);
            assert_eq!(peak.load(SeqCst), limit);
            let count = AtomicUsize::new(0);
            checked(&values, limit, |_| { count.fetch_add(1, SeqCst); async { Ok(()) } }).await.unwrap();
            assert_eq!(count.load(SeqCst), values.len());
        }
        assert!(checked(&[1], 0, |_| async {Ok(())}).await.is_err());
    }
}
