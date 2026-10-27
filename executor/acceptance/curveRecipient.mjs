// Acceptance-only guard. A coordinator lookup is not an authenticated user leaf
// or permission to fund a market. The caller supplies its SDK-created public
// identity and the exact included registration, never an Executor-picked ID.
import assert from "node:assert/strict";
export function verifyCurveRecipient(config, identity, registration, mapping) {
  assert.ok(Number.isSafeInteger(config.target) && config.target > 0 && config.target < 16777216);
  assert.notEqual(config.target, config.issuer, "Graduation recipient must differ from issuer");
  assert.match(identity.publicKeyHash, /^[0-9a-f]{64}$/);
  assert.equal(registration.userId, config.target, "Graduation target differs from controlled registration");
  assert.equal(registration.publicKeyHash, identity.publicKeyHash, "Recipient public key changed");
  assert.match(registration.contentHash, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(registration.includedCheckpoint) && registration.includedCheckpoint > 0);
  assert.equal(registration.resubmissions, 0);
  assert.deepEqual(mapping, [config.target], "Ambiguous or changed recipient mapping");
  return { userId: config.target, publicKeyHash: identity.publicKeyHash,
    registrationContentHash: registration.contentHash,
    registrationCheckpoint: registration.includedCheckpoint,
    assurance: "included registration and public mapping; not authenticated active leaf",
    fundingAuthorized: false };
}
