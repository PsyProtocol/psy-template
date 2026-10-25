//! Application-only allocation hygiene. Never caches a witness or changes a
//! circuit, proof, signer, state read or broadcast rule.
use anyhow::{bail, Result};
use serde_json::json;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum MemoryMode { Retain, ReleaseUnused }
impl MemoryMode {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "retain-v1" => Ok(Self::Retain),
            "release-unused-v1" if cfg!(target_os="macos") => Ok(Self::ReleaseUnused),
            _ => bail!("unsupported explicit prover memory mode"),
        }
    }
    pub fn selected() -> Result<Self> {
        Self::parse(&std::env::var("PSY_PROVER_MEMORY_MODE").unwrap_or_else(|_| "retain-v1".into()))
    }
    pub fn release(self) -> bool { self == Self::ReleaseUnused }
    pub fn name(self) -> &'static str { if self.release() { "release-unused-v1" } else { "retain-v1" } }
}
#[cfg(target_os="macos")]
extern "C" { fn malloc_zone_pressure_relief(zone: *mut std::ffi::c_void, goal: usize) -> usize; }

// macOS's allocator API releases unused pages only. Live circuit/proof buffers
// remain owned by Rust. Null selects all zones and zero has no byte limit.
fn release_unused(mode: MemoryMode) -> usize {
    #[cfg(target_os="macos")]
    if mode.release() { return unsafe { malloc_zone_pressure_relief(std::ptr::null_mut(), 0) }; }
    let _ = mode;
    0
}
fn rss() -> Option<u64> {
    let out=std::process::Command::new("ps").args(["-o","rss=","-p",&std::process::id().to_string()]).output().ok()?;
    if !out.status.success() { return None; }
    std::str::from_utf8(&out.stdout).ok()?.trim().parse::<u64>().ok()?.checked_mul(1024)
}
pub fn checkpoint(mode: MemoryMode, phase: &str) {
    let measured=std::env::var("PSY_PROVER_RESOURCE_METRICS").as_deref()==Ok("1");
    let before=if measured {rss()} else {None};
    let start=Instant::now();let reported=release_unused(mode);let elapsed=start.elapsed().as_secs_f64()*1000.0;
    if measured {
        eprintln!("PSY_PROVER_RESOURCES {}",json!({"schema":1,"pid":std::process::id(),"unixMilliseconds":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),"phase":phase,"memoryMode":mode.name(),"rssBeforeBytes":before,"rssAfterBytes":rss(),"allocatorReportedReleasedBytes":reported,"reliefMilliseconds":elapsed,"scope":"current sampled process RSS; allocator bytes are advisory, not a true peak or proof size"}));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn explicit_modes_fail_closed() {
        assert!(MemoryMode::parse("retain-v1").is_ok());
        assert_eq!(MemoryMode::parse("release-unused-v1").is_ok(),cfg!(target_os="macos"));
        for mode in ["", "auto", "skip-verification", "release-unused-v2"] { assert!(MemoryMode::parse(mode).is_err()); }
    }
    #[test] fn allocator_relief_preserves_live_owned_buffers() {
        let data=(0..2_000_000u64).map(|x|x.wrapping_mul(3571)).collect::<Vec<_>>();
        let before=data.iter().fold(0u64,|a,b|a.wrapping_add(*b));
        #[cfg(target_os="macos")] let _=release_unused(MemoryMode::ReleaseUnused);
        assert_eq!(data.iter().fold(0u64,|a,b|a.wrapping_add(*b)),before);
        assert_eq!(release_unused(MemoryMode::Retain),0);
    }
}
