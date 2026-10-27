import test from "node:test";
import assert from "node:assert/strict";
import { verifyCurveRecipient } from "./curveRecipient.mjs";
test("live Curve candidate requires the exact controlled registration, not fixture target", () => {
  const c = { target: 1856512, issuer: 1590272 },
    identity = { publicKeyHash: "1".repeat(64) },
    registration = { userId: c.target, publicKeyHash: identity.publicKeyHash,
      contentHash: "2".repeat(64), includedCheckpoint: 4827, resubmissions: 0 };
  assert.equal(verifyCurveRecipient(c, identity, registration, [c.target]).fundingAuthorized, false);
  for (const [config, record, mapping] of [
    [{ ...c, target: 400 }, registration, [400]],
    [{ ...c, target: c.issuer }, registration, [c.issuer]],
    [c, { ...registration, publicKeyHash: "3".repeat(64) }, [c.target]],
    [c, { ...registration, includedCheckpoint: 0 }, [c.target]],
    [c, registration, [c.target, 400]],
  ]) assert.throws(() => verifyCurveRecipient(config, identity, record, mapping));
});
