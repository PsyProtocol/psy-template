//! Conditional frontier component acceptance. No seed/finality authority,
//! market authorization, financial UPS, RPC or broadcast is provided here.
use anyhow::{ensure, Result};
use psy_template_u124_markets::{
    final_state_coverage::Snapshot,
    random_minimum::{self as minimum, Circuit, Node},
    source_review, stream_source,
};
use serde_json::json;
use std::{fs, path::Path, time::Instant};
#[test]
#[ignore = "bounded ten component proofs; explicit fresh output and public fixture required"]
fn canonical_source_insertion_and_minimum_extraction() -> Result<()> {
    let fixture = std::env::var("MINIMUM_FIXTURE")?;
    let out = std::env::var("MINIMUM_OUT")?;
    fs::create_dir(&out)?;
    let r = source_review::review(&Path::new(&fixture).join("review.json"))?.0;
    let snapshot: Snapshot =
        serde_json::from_slice(&fs::read(Path::new(&fixture).join("source.json"))?)?;
    let history = snapshot.history.checkpoint_path.root;
    let pages = stream_source::prepare(&r, &snapshot, history)?;
    let scope = &pages[0].scope;
    let source = stream_source::priority(&r, &snapshot, history)?;
    let seed = [51, 62, 73, 84];
    let steps = minimum::prepare(scope, &source, seed)?;
    ensure!(
        steps.len() == 10,
        "five full source inserts and five minimum removals"
    );
    let t = Instant::now();
    let c = Circuit::build();
    let cold = t.elapsed().as_secs_f64();
    let mut accepted = vec![];
    for (i, p) in steps.iter().enumerate() {
        let start = Instant::now();
        let proof = if let Ok(saved) = std::env::var("MINIMUM_SAVED") {
            let old: serde_json::Value =
                serde_json::from_slice(&fs::read(format!("{saved}/step-{i}.json"))?)?;
            ensure!(
                old == serde_json::to_value(p)?,
                "exact saved public transition"
            );
            bincode::deserialize(&fs::read(format!("{saved}/proof-{i}.bin"))?)?
        } else {
            c.prove(p)?
        };
        c.verify(p, proof.clone())?;
        fs::write(
            format!("{out}/step-{i}.json"),
            serde_json::to_vec_pretty(p)?,
        )?;
        fs::write(format!("{out}/proof-{i}.bin"), bincode::serialize(&proof)?)?;
        accepted
            .push(json!({"index":i,"extract":p.extract,"seconds":start.elapsed().as_secs_f64()}));
        if i > 0 {
            ensure!(steps[i - 1].after == p.before, "one exact progress chain");
        }
    }
    let expected = psy_template_u124_markets::random_stream::prepare(scope, &source, seed)?.1;
    let owners = steps[5..].iter().map(|s| s.node.owner).collect::<Vec<_>>();
    ensure!(
        owners
            == expected
                .members
                .iter()
                .map(|m| m.member.owner)
                .collect::<Vec<_>>()
            && steps[9].after.queue == expected.root(),
        "unchanged full-hash rank and exact final queue"
    );
    let mut attacks = vec![];
    let mut p = steps[0].clone();
    p.after.built += 1;
    attacks.push(("extra-progress", p));
    let mut p = steps[1].clone();
    p.seed[0] += 1;
    attacks.push(("seed-substitution-after-first-accepted-insert", p));
    let mut p = steps[5].clone();
    p.node = steps[6].node.clone();
    p.node_path = steps[6].node_path.clone();
    attacks.push(("valid-non-head-node", p));
    let mut p = steps[5].clone();
    p.after.front = steps[7].node.owner;
    attacks.push(("skip-next-ranked-member", p));
    let mut p = steps[6].clone();
    p.node = steps[5].node.clone();
    p.node_path = steps[5].node_path.clone();
    attacks.push(("repeat-extracted-member", p));
    let mut p = steps[5].clone();
    p.before = steps[3].after.clone();
    attacks.push(("extract-before-complete-source", p));
    // This was the v10 poisoning primitive: consume a valid source member while
    // skipping the lower source index, with otherwise coherent endpoint values.
    let mut p = steps[0].clone();
    let second = &source.members[1];
    let owner = second.member.owner;
    p.node = Node {
        owner,
        index: second.index,
        nonce: second.member.nonce,
        terms: second.member.terms,
        prev: 0,
        next: 0,
    };
    p.source = source.proof(second.index);
    let tree = psy_template_u124_markets::checkpoint_stream::Tree::new();
    p.node_path = tree.path(owner);
    let mut tree = tree;
    tree.set(owner, p.node.commitment(scope, seed));
    let mut remaining = source.clone();
    remaining.remove(second.index);
    p.after.list = tree.root();
    p.after.seen = remaining.root();
    p.after.head = owner;
    p.after.tail = owner;
    p.after.front = owner;
    ensure!(minimum::after(&p).is_err(), "host source-minimum guard");
    attacks.push(("coherent-skipped-source-minimum", p));
    let mut rejected = vec![];
    for (name, p) in attacks {
        ensure!(c.prove_raw(&p).is_err(), "circuit accepted attack {name}");
        rejected.push(name);
    }
    let last = &steps.last().unwrap().after;
    ensure!(
        last.built == 5 && last.extracted == 5 && last.front == 0,
        "complete unique terminal traversal"
    );
    fs::write(
        format!("{out}/REPORT.json"),
        serde_json::to_vec_pretty(
            &json!({"profile":"conditional-sorted-list-minimum-v1","componentProofsVerified":10,"proofsGenerated":if std::env::var("MINIMUM_SAVED").is_ok(){0}else{10},"circuitDigest":psy_client_common::data::qhashout::QHashOut(c.data.verifier_only.circuit_digest),"publicInputs":c.data.common.num_public_inputs,"coldCircuitBuildSeconds":cold,"steps":accepted,"attackRejections":rejected,"owners":owners,"sameRankAsV10":true,"finiteTransitions":10,"canResetRanking":false,"seedAuthentication":false,"sourceAuthentication":"conditional on the externally authenticated source root; fixture source verified by native loader","fullUpsVerified":false,"contractAndSdKeyInstalled":false,"financialOperations":0,"broadcast":false}),
        )?,
    )?;
    Ok(())
}
