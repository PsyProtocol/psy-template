import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import {
  unsignedPlanDirectory,
  assertPortAvailable,
} from "../scripts/run_markets.mjs";

test("durable unsigned-plan directories are configuration-scoped without replacing an explicit directory", () => {
  assert.equal(unsignedPlanDirectory("a"), unsignedPlanDirectory("a"));
  assert.notEqual(unsignedPlanDirectory("a"), unsignedPlanDirectory("b"));
  assert.equal(unsignedPlanDirectory("a", "/example/plans"), "/example/plans");
  assert.throws(() => unsignedPlanDirectory("a", "relative"), /absolute/);
});
test("an occupied port rejects without taking ownership or stopping its server", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await assert.rejects(assertPortAvailable(port), /Keep the existing owner/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await assertPortAvailable(port);
});
