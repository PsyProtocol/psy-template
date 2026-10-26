import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// Exercise the actual browser bridge without a browser wallet, credentials or
// a different SDK. Type-only imports disappear; no market signer is invoked.
const source = readFileSync(
  new URL("../src/lib/psy.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const bridge = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
async function fakeWindow(fn) {
  const target = new EventTarget(),
    timers = new Set(),
    intervals = new Set(),
    listeners = new Set();
  const win = {
    addEventListener: (name, callback) => {
      listeners.add(callback);
      target.addEventListener(name, callback);
    },
    removeEventListener: (name, callback) => {
      listeners.delete(callback);
      target.removeEventListener(name, callback);
    },
    setTimeout: (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
      clearTimeout(id);
    },
    setInterval: (fn, ms) => {
      const id = setInterval(fn, ms);
      intervals.add(id);
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id);
      clearInterval(id);
    },
  };
  const before = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: win,
    configurable: true,
  });
  try {
    return await fn({ win, target, timers, intervals, listeners });
  } finally {
    for (const x of timers) clearTimeout(x);
    for (const x of intervals) clearInterval(x);
    if (before) Object.defineProperty(globalThis, "window", before);
    else delete globalThis.window;
  }
}
test("account normalization accepts documented wrappers and rejects malformed provider data", () => {
  assert.deepEqual(bridge.normalizeAccounts(["12345", "12345"]), ["12345"]);
  assert.deepEqual(bridge.normalizeAccounts({ accounts: ["12345"] }), [
    "12345",
  ]);
  assert.deepEqual(bridge.normalizeAccounts([]), []);
  for (const value of [
    null,
    {},
    12345,
    "12345",
    [12345],
    [""],
    ["x".repeat(513)],
    Array(65).fill("123"),
  ])
    assert.throws(() => bridge.normalizeAccounts(value));
});
test("delayed wallet detection clears its timeout, poll and event listener", async () =>
  fakeWindow(async ({ win, target, timers, intervals, listeners }) => {
    const provider = { requestAccounts: async () => ["12345"] },
      pending = bridge.waitForPsy(500);
    setTimeout(() => {
      win.psy = provider;
      target.dispatchEvent(new Event("psy#initialized"));
    }, 5);
    assert.equal(await pending, provider);
    assert.equal(timers.size, 0);
    assert.equal(intervals.size, 0);
    assert.equal(listeners.size, 0);
  }));
test("missing wallet rejects once and leaves no detection resources", async () =>
  fakeWindow(async ({ timers, intervals, listeners }) => {
    await assert.rejects(
      bridge.waitForPsy(5),
      bridge.PsyWalletNotInstalledError,
    );
    assert.equal(timers.size, 0);
    assert.equal(intervals.size, 0);
    assert.equal(listeners.size, 0);
  }));
test("connection requests public accounts only, never sends a transaction", async () =>
  fakeWindow(async ({ win }) => {
    let requests = 0,
      sends = 0;
    win.psy = {
      requestAccounts: async () => {
        requests++;
        return { accounts: ["12345"] };
      },
      sendTransaction: async () => {
        sends++;
        throw Error("must not send");
      },
    };
    assert.deepEqual(await bridge.connect(), ["12345"]);
    assert.equal(requests, 1);
    assert.equal(sends, 0);
  }));
