//! Test one specific wrong-role hypothesis using the already-approved client
//! Endcap key, after matching actual public runtime metadata. Never accept an
//! Endcap proof as a checkpoint transition, even if this diagnostic succeeds.
use anyhow::{ensure,Result};
use serde_json::json;
use sha2::{Digest,Sha256};
use std::{env,fs,io::Read,path::Path};
use psy_template_u124_markets::{checkpoint_evidence,fixed_verifier,public_runtime_resources,source_plan_receipt};
fn read(path:&str,limit:u64)->Result<Vec<u8>> {
    let metadata=fs::symlink_metadata(path)?;
    ensure!(metadata.is_file()&&metadata.len()<=limit,"bounded regular public capture required");
    let mut bytes=vec![];fs::File::open(path)?.take(limit+1).read_to_end(&mut bytes)?;
    ensure!(bytes.len() as u64<=limit,"public capture limit");Ok(bytes)
}
fn main()->Result<()> {
    let a=env::args().collect::<Vec<_>>();
    ensure!(a.len()==5,"CAPTURED_CIRCUITS_ENVELOPE PREVIOUS_CST_CAPTURE CURRENT_CST_CAPTURE FRESH_REPORT");
    let registry=public_runtime_resources::inspect(&read(&a[1],public_runtime_resources::MAX_CAPTURE_BYTES as u64)?)?;
    let mut rows=vec![];
    for path in &a[2..4] {
        let bytes=read(path,2_000_000)?;
        let proof=checkpoint_evidence::decode_proof(&bytes)?;
        let (verified,error)=fixed_verifier::with_verifier(|fixed| {
            let result=fixed.verify(proof);
            Ok((result.is_ok(),result.err().map(|e|format!("{e:#}"))))
        })?;
        rows.push(json!({"proofSha256":format!("{:x}",Sha256::digest(&bytes)),"bytes":bytes.len(),"verifiesAsClientEndcap":verified,"clientEndcapVerificationError":error}));
    }
    let report=json!({"schema":1,"kind":"checkpoint-client-endcap-role-diagnostic-v1",
        "scope":"one fixed client-role comparison; never a CST verifier fallback",
        "runtimeRegistryCaptureSha256":registry["captureSha256"],
        "fixedClientEndcapFingerprint":registry["endcapFingerprint"],"proofs":rows,
        "remoteVerifierInstalled":false,"checkpointProofAuthenticated":false,
        "approvedCallStackVerified":false,"runtimeBuildIdentityAuthenticated":false,
        "chainInstanceAuthenticated":false,"finalityVerified":false,
        "seedSecrecyAuthenticated":false,"qualifiedRandomness":false,
        "canSign":false,"canBroadcast":false,"financialOperations":0,"proofsGenerated":0});
    source_plan_receipt::save(Path::new(&a[4]),&report)?;
    println!("{}",serde_json::to_string(&report)?);Ok(())
}
