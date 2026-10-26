import test from "node:test";
import assert from "node:assert/strict";
import { projectAmmAccount, makeAccountAction } from "./accountProjection.mjs";
import {
  fixtureRegistry,
  fixturePin,
  observed,
  NOW,
} from "../executor/gateway/fixtures.mjs";
const registry = await fixtureRegistry(),
  { registrySha256: hash } = await fixturePin(),
  make = () => observed(registry, hash);
test("observed balances, pending outputs and unused deposits remain separate exact values", () => {
  const s = make();
  s.assets[0].balance = "4611686018427387921";
  s.assets[0].claimableFromVault = "17";
  s.assets[0].sentToVault = "10";
  s.assets[0].vaultSettled = "3";
  s.funding.nativeSent = "1000000017";
  s.funding.nativeClaimable = "1000000017";
  const p = projectAmmAccount(s, registry, hash, NOW);
  assert.equal(p.assets[0].balance, "4.611686018427387921");
  assert.equal(p.assets[0].claimable, "0.000000000000000017");
  assert.equal(p.assets[0].unusedDeposit, "0.000000000000000007");
  assert.equal(p.native.claimable, "1.000000017");
  assert.equal(p.financialAuthorization, false);
});
test("processed cursor, cancellation and old deadline are never presented as unique fill/refund evidence", () => {
  const s = make();
  s.order = {
    ...s.order,
    kind: "1",
    pool: "1012928",
    nonce: "1",
    deadline: "1100",
  };
  assert.match(
    projectAmmAccount(s, registry, hash, NOW).order.state,
    /consent alone/,
  );
  s.order.cancelled = "1";
  assert.match(
    projectAmmAccount(s, registry, hash, NOW).order.state,
    /no refund/,
  );
  s.lifecycle.consumed = "1";
  assert.match(
    projectAmmAccount(s, registry, hash, NOW).order.state,
    /not inferred/,
  );
  s.order.pool = "718016";
  assert.match(
    projectAmmAccount(s, registry, hash, NOW).order.state,
    /another vault/,
  );
});
test("stale observations remain labelled stale and cannot be made fresh for planning", () => {
  const s = make();
  assert.equal(projectAmmAccount(s, registry, hash, NOW + 30001).stale, true);
  assert.equal(s.observedAt, NOW);
  assert.throws(() => projectAmmAccount(s, registry, hash, NOW - 1));
  const other = structuredClone(registry);
  other.network.magic = "0";
  assert.throws(() => projectAmmAccount(s, other, hash, NOW));
});
test("public action request binds observed user and pool rather than a new recipient", () => {
  const s = make(),
    r = makeAccountAction(s, "claim", 2484, {
      feeCap: "2",
      validForCheckpoints: 12,
    });
  assert.equal(r.recipientId, s.userId);
  assert.equal(r.marketId, s.marketId);
  assert.equal(r.amountA, "");
  assert.equal(r.feeCap, "2");
  assert.equal(r.validForCheckpoints, 12);
});
