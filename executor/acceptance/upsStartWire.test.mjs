// Opt-in tests against a sealed frozen-SDK inspector. No RPC or proving path.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const binary = process.env.UPS_START_WIRE_INSPECTOR;
const caseDirectory = process.env.UPS_START_WIRE_CASE;
const digest = process.env.UPS_START_WIRE_SHA256;
const enabled = Boolean(binary && caseDirectory && digest);
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function scenario(fn) {
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(sha(await readFile(binary)), digest, "Sealed inspector changed");
  const out = await mkdtemp(join(tmpdir(), "psy-ups-wire-"));
  try {
    await fn(out);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  assert.equal(
    sha(await readFile(binary)),
    digest,
    "Inspector changed during checks",
  );
}
function run(capture, report, row = "46", column = "12") {
  return spawnSync(binary, [capture, report, row, column], {
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 32768,
    env: { ...process.env, PSY_NETWORK: "testnet", RAYON_NUM_THREADS: "2" },
  });
}
const capture =
  caseDirectory &&
  join(caseDirectory, "capture-v1/runtime-client-resources.json");

test(
  "the executed frozen wire map binds the matched resource without historical or spending authority",
  { skip: !enabled },
  async () =>
    scenario(async () => {
      const report = JSON.parse(
        await readFile(join(caseDirectory, "public/WIRE-MAP.json")),
      );
      assert.equal(report.registryVerifierMatches, true);
      assert.deepEqual(report.matchingNamedTargets, [
        "start.checkpoint_tree_root[0]",
        "checkpoint_proof.root[0]",
      ]);
      for (const k of [
        "witnessLoaded",
        "witnessValuesPublished",
        "historicalFailureReproduced",
        "exactCauseProven",
        "originalRequestResolved",
        "canBroadcast",
      ])
        assert.equal(report[k], false);
      assert.equal(report.proofsGenerated, 0);
    }),
);
test(
  "substituted start verifier identity fails closed",
  { skip: !enabled },
  async () =>
    scenario(async (out) => {
      const envelope = JSON.parse(await readFile(capture));
      const resources = JSON.parse(envelope.result);
      resources.ups_start.fingerprint = "0".repeat(64);
      envelope.result = JSON.stringify(resources);
      const altered = join(out, "wrong-resource.json"),
        report = join(out, "report.json");
      await writeFile(altered, JSON.stringify(envelope));
      const result = run(altered, report);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      const v = JSON.parse(await readFile(report));
      assert.equal(v.inspectionPassed, false);
      assert.equal(v.canBroadcast, false);
    }),
);
test(
  "out-of-range wires cannot produce an accepted map",
  { skip: !enabled },
  async () =>
    scenario(async (out) => {
      const report = join(out, "report.json");
      const result = run(capture, report, "4096", "12");
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.equal(JSON.parse(await readFile(report)).inspectionPassed, false);
    }),
);
test(
  "an existing report cannot be replaced even by a valid inspection",
  { skip: !enabled },
  async () =>
    scenario(async (out) => {
      const report = join(out, "report.json");
      await writeFile(report, "original evidence\n");
      const result = run(capture, report);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.equal(await readFile(report, "utf8"), "original evidence\n");
    }),
);
