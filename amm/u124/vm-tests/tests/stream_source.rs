//! Actual coverage constraints and proofs, synthetic authenticated checkpoints.
use anyhow::{ensure, Context, Result};
use psy_template_u124_markets::{final_state_coverage::*, stream_source::*};
#[path = "support/final_state_fixture.rs"]
mod fixture;
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    iop::witness::PartialWitness,
};
#[test]
fn plan_covers_all_accounts_before_permitting_source_completion() -> Result<()> {
    for kind in [1, 2] {
        let (r, s, root) = fixture::fixture(kind, false, false)?;
        let pages = prepare(&r, &s, root)?;
        ensure!(
            pages.len() == 5
                && pages.iter().map(|p| p.rows.len()).collect::<Vec<_>>() == vec![4, 4, 4, 4, 2],
            "complete source pages including nontraders"
        );
        ensure!(
            pages.first().unwrap().before == Progress::empty(),
            "initial coverage state"
        );
        for pair in pages.windows(2) {
            ensure!(pair[0].after == pair[1].before, "source continuation");
        }
        let last = &pages.last().unwrap().after;
        ensure!(
            last.accounts == 18
                && last.order_count == 9
                && last.recovery_count == 3
                && last.users == pages[0].facts[0],
            "all accounts, eligible and recovery roots"
        );
    }
    Ok(())
}
#[test]
#[ignore = "bounded cryptographic coverage proofs; no UPS, RPC or finance"]
fn prove_complete_source_chains() -> Result<()> {
    let out = std::env::var("STREAM_SOURCE_PROOFS_OUT").context("fresh proof output required")?;
    std::fs::create_dir(&out)?;
    for kind in [1, 2] {
        let started = std::time::Instant::now();
        let (r, s, root) = fixture::fixture(kind, false, false)?;
        let pages = prepare(&r, &s, root)?;
        let circuit = SourcePageCircuit::build(&r)?;
        let build = started.elapsed().as_secs_f64();
        let dir = std::path::Path::new(&out).join(if kind == 1 { "amm" } else { "bondingcurve" });
        std::fs::create_dir(&dir)?;
        let mut rows = vec![];
        for (i, page) in pages.iter().enumerate() {
            let started = std::time::Instant::now();
            let mut pw = PartialWitness::new();
            circuit.targets.set(&mut pw, &r, &s, page)?;
            let proof = circuit.data.prove(pw)?;
            ensure!(
                proof
                    .public_inputs
                    .iter()
                    .map(|n| n.to_canonical_u64())
                    .collect::<Vec<_>>()
                    == page.public(),
                "exact source transition public endpoints"
            );
            circuit.data.verify(proof.clone())?;
            std::fs::write(
                dir.join(format!("page-{i}.bin")),
                bincode::serialize(&proof)?,
            )?;
            rows.push(serde_json::json!({"page":i,"accounts":page.rows.len(),"seconds":started.elapsed().as_secs_f64(),"before":page.before,"after":page.after}));
        }
        let mut attacks = vec![];
        for name in [
            "source-membership",
            "source-prefix",
            "classified-leaf",
            "count-poison",
            "root-substitution",
        ] {
            let mut page = pages[0].clone();
            match name {
                "source-membership" => page.rows[0].original.siblings[0].0.elements[0] += F::ONE,
                "source-prefix" => {
                    page.rows.swap(0, 1);
                }
                "classified-leaf" => page.rows[2].append.value.0.elements[0] += F::ONE,
                "count-poison" => page.before.order_count = 1,
                "root-substitution" => page.facts[0][0] ^= 1,
                _ => unreachable!(),
            }
            let mut pw = PartialWitness::new();
            let assigned = circuit.targets.set(&mut pw, &r, &s, &page);
            ensure!(
                assigned.is_err() || circuit.data.prove(pw).is_err(),
                "source attack accepted: {name}"
            );
            attacks.push(name);
        }
        std::fs::write(
            dir.join("REPORT.json"),
            serde_json::to_vec_pretty(
                &serde_json::json!({"scope":"actual source coverage circuit proofs; synthetic checkpoint facts; not yet an SD-key/UPS","buildSeconds":build,"degreeBits":circuit.data.common.degree_bits(),"inputFelts":circuit.tape.targets.len(),"pages":rows,"attackRejections":attacks,"fullUpsVerified":false,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}

#[test]
#[ignore = "full-width excluded accounts require actual fresh cryptographic proofs"]
fn prove_full_width_excluded_user_boundaries() -> Result<()> {
    let out = std::env::var("STREAM_SOURCE_BOUNDARY_OUT")?;
    std::fs::create_dir(&out)?;
    for kind in [1, 2] {
        let (r, s, root) = fixture::fixture_full_width_users(kind)?;
        let pages = prepare(&r, &s, root)?;
        ensure!(
            pages.last().unwrap().after.accounts == 21
                && pages.last().unwrap().after.order_count == 9
                && pages.last().unwrap().after.recovery_count == 3,
            "unsupported global users are covered, never admitted as trading peers"
        );
        let circuit = SourcePageCircuit::build(&r)?;
        let mut times = vec![];
        for (i, page) in pages.iter().enumerate() {
            let start = std::time::Instant::now();
            let mut pw = PartialWitness::new();
            circuit.targets.set(&mut pw, &r, &s, page)?;
            let proof = circuit.data.prove(pw)?;
            ensure!(
                proof
                    .public_inputs
                    .iter()
                    .map(|n| n.to_canonical_u64())
                    .collect::<Vec<_>>()
                    == page.public(),
                "complete full-width source endpoints"
            );
            circuit.data.verify(proof.clone())?;
            std::fs::write(
                format!("{out}/{kind}-page-{i}.bin"),
                bincode::serialize(&proof)?,
            )?;
            times.push(start.elapsed().as_secs_f64());
        }
        std::fs::write(
            format!("{out}/{kind}-REPORT.json"),
            serde_json::to_vec_pretty(
                &serde_json::json!({"scope":"actual source circuit; synthetic complete source; full32 account IDs and bounded24 trading peers are distinct","accounts":21,"eligible":9,"recovery":3,"excludedHighOwners":[2139095033u64,2139095034u64,u32::MAX as u64],"pageSeconds":times,"fullUpsVerified":false,"broadcast":false}),
            )?,
        )?;
    }
    Ok(())
}
