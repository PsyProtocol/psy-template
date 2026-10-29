//! The gated page gadget that a replacement financial key will embed. These
//! standalone proofs do not install that key, authenticate a seed or broadcast.
use anyhow::{ensure, Result};
use plonky2::{
    field::{
        goldilocks_field::GoldilocksField as F,
        types::{Field, PrimeField64},
    },
    iop::{
        target::Target,
        witness::{PartialWitness, WitnessWrite},
    },
    plonk::{
        circuit_builder::CircuitBuilder, circuit_data::CircuitConfig,
        config::PoseidonGoldilocksConfig as C,
    },
};
use psy_template_u124_markets::{
    final_state_coverage::Snapshot,
    random_minimum::{self as m, Page, PageTargets},
    source_review,
    stream_source::{self, Tape},
};
use serde_json::json;
use std::{fs, path::Path, time::Instant};
#[test]
#[ignore = "five bounded page proofs; no financial UPS"]
fn gated_minimum_pages_keep_one_scope_and_seed() -> Result<()> {
    let fixture = std::env::var("MINIMUM_FIXTURE")?;
    let out = std::env::var("MINIMUM_OUT")?;
    fs::create_dir(&out)?;
    let r = source_review::review(&Path::new(&fixture).join("review.json"))?.0;
    let s: Snapshot = serde_json::from_slice(&fs::read(Path::new(&fixture).join("source.json"))?)?;
    let root = s.history.checkpoint_path.root;
    let source_pages = stream_source::prepare(&r, &s, root)?;
    let scope = &source_pages[0].scope;
    let tree = stream_source::priority(&r, &s, root)?;
    let seed = [51, 62, 73, 84];
    let steps = m::prepare(scope, &tree, seed)?;
    let mut pages = vec![];
    for rows in [&steps[..5], &steps[5..]] {
        for chunk in rows.chunks(4) {
            pages.push(Page {
                seed,
                refund_only: false,
                current: chunk[0].before.clone(),
                rows: chunk.to_vec(),
            });
        }
    }
    let started = Instant::now();
    let mut b = CircuitBuilder::<F, 2>::new(CircuitConfig::standard_recursion_config());
    let mut tape = Tape::default();
    let scoped = (0..41)
        .map(|_| tape.scalar(&mut b))
        .collect::<Vec<Target>>();
    let build = b.add_virtual_bool_target_safe();
    let pop = b.add_virtual_bool_target_safe();
    let targets = PageTargets::add(&mut b, &mut tape, &scoped, build, pop);
    b.register_public_inputs(&scoped);
    b.register_public_inputs(&[build.target, pop.target]);
    b.register_public_inputs(&targets.seed.elements);
    b.register_public_inputs(&[targets.refund.target, targets.len]);
    b.register_public_inputs(&targets.public_current());
    b.register_public_inputs(&targets.public_after());
    let data = b.build::<C>();
    let cold = started.elapsed().as_secs_f64();
    let witness = |p: &Page, active: bool| -> Result<PartialWitness<F>> {
        let mut pw = PartialWitness::new();
        for (t, n) in scoped.iter().zip(scope) {
            pw.set_target(*t, F::from_canonical_u64(*n))?;
        }
        let extracting = active && p.rows[0].extract;
        pw.set_bool_target(build, active && !extracting)?;
        pw.set_bool_target(pop, extracting)?;
        targets.set(&mut pw, Some(p))?;
        Ok(pw)
    };
    let mut results = vec![];
    for (i, page) in pages.iter().enumerate() {
        let after = page.after(scope)?;
        let start = Instant::now();
        let proof = data.prove(witness(page, true)?)?;
        data.verify(proof.clone())?;
        let mut expected = scope.clone();
        expected.extend([
            u64::from(!page.rows[0].extract),
            u64::from(page.rows[0].extract),
        ]);
        expected.extend(seed);
        expected.extend([0, page.rows.len() as u64]);
        expected.extend(page.current.fields());
        expected.extend(after.fields());
        ensure!(
            proof
                .public_inputs
                .iter()
                .map(|n| n.to_canonical_u64())
                .collect::<Vec<_>>()
                == expected,
            "exact grouped progress endpoints"
        );
        fs::write(
            format!("{out}/page-{i}.json"),
            serde_json::to_vec_pretty(page)?,
        )?;
        fs::write(format!("{out}/proof-{i}.bin"), bincode::serialize(&proof)?)?;
        results.push(json!({"rows":page.rows.len(),"extract":page.rows[0].extract,"seconds":start.elapsed().as_secs_f64()}));
    }
    let disabled = Page::context(seed, false, steps[9].after.clone());
    let proof = data.prove(witness(&disabled, false)?)?;
    data.verify(proof.clone())?;
    let pi = &proof.public_inputs;
    ensure!(
        pi[49..66] == pi[66..83],
        "inactive component cannot advance public progress"
    );
    fs::write(
        format!("{out}/inactive-proof.bin"),
        bincode::serialize(&proof)?,
    )?;
    let mut attacks = vec![];
    let mut p = pages[0].clone();
    p.rows[1].before = p.rows[0].before.clone();
    attacks.push(("broken-inner-state-chain", p));
    let mut p = pages[0].clone();
    p.rows[1].seed[0] += 1;
    attacks.push(("inner-seed-substitution", p));
    let mut p = pages[0].clone();
    p.rows[1].scope[3] += 1;
    attacks.push(("inner-market-substitution", p));
    let mut p = pages[0].clone();
    p.rows[1].extract = true;
    attacks.push(("mixed-operation-page", p));
    let mut rejected = vec![];
    for (name, p) in attacks {
        let result = witness(&p, true).and_then(|pw| data.prove(pw).map_err(Into::into));
        ensure!(result.is_err(), "gated page accepted {name}");
        rejected.push(name);
    }
    fs::write(
        format!("{out}/REPORT.json"),
        serde_json::to_vec_pretty(
            &json!({"componentProofsGenerated":5,"pageSizes":[4,1,4,1],"inactiveNoProgress":true,"coldCircuitBuildSeconds":cold,"results":results,"attackRejections":rejected,"fullUpsVerified":false,"financialOperations":0,"contractAndKeyInstalled":false}),
        )?,
    )?;
    Ok(())
}
