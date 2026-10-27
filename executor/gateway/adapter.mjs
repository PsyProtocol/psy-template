import { nativeManifestPath } from "../../market-client/nativeProtocol.mjs";
// Public-only application adapter: reuse the formal Executor's checkpoint and
// exact-receipt readers. No wallet file, signing key, driver or send path loads.
import assert from "node:assert/strict";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createReadinessReader } from "./readiness.mjs";
import { boundedPublicFetch } from "./boundedFetch.mjs";
import { publicState } from "../publicState.mjs";
import { receiptReader } from "../chainReceipts.mjs";
import { captureInputs } from "../submissionGuard.mjs";
import { validateU124TokenAbi } from "../u124Abi.mjs";
import { publishFile } from "../durableFile.mjs";
import { decodeAmount } from "../../amm/u124/client.mjs";
import {
  canonical,
  id,
  exactFields,
  hashPattern,
  WRITE_BOUNDARY,
} from "../../market-client/protocol.mjs";
import { buildAmmPlan, marketFor } from "../../market-client/ammPlan.mjs";
import { loadPositions, positionReader } from "./positions.mjs";
import { marketActionReader } from "./marketActions.mjs";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  json = async (p) => JSON.parse(await readFile(p, "utf8"));
export async function loadGateway(file) {
  const c = await json(file);
  exactFields(c, [
    "schema",
    "reviewedDirectory",
    "registrySha256",
    "rpcConfig",
    "port",
    "origin",
    "executorStatusFile",
    ...(Object.hasOwn(c, "positions") ? ["positions"] : []),
  ]);
  assert.equal(c.schema, 1);
  assert.ok(hashPattern.test(c.registrySha256));
  assert.ok(Number.isSafeInteger(c.port) && c.port >= 1024 && c.port <= 65535);
  assert.equal(c.origin, "http://127.0.0.1:5273");
  assert.equal(
    c.executorStatusFile,
    null,
    "Executor status integration requires an explicitly reviewed projection; no arbitrary file endpoint",
  );
  const dir = resolve(c.reviewedDirectory),
    registry = await json(join(dir, "registry.json")),
    artifacts = await json(join(dir, "artifacts.json"));
  assert.equal(sha(canonical(registry)), c.registrySha256);
  assert.equal(registry.schema, 1);
  assert.equal(registry.network.name, registry.nativeProtocol ? "testnet" : "sepolia");
  const sdk = resolve(
    nativeManifestPath(registry),
  );
  assert.equal(sha(await readFile(sdk)), registry.sdkManifestSha256);
  assert.equal(
    sha(await readFile(c.rpcConfig)),
    registry.network.rpcConfigSha256,
  );
  const paths = [
    file,
    sdk,
    c.rpcConfig,
    join(dir, "registry.json"),
    join(dir, "artifacts.json"),
  ];
  for (const [name, digest] of Object.entries(artifacts)) {
    assert.match(
      name,
      /^\d+-(abi|asset-\d+-abi|dependencies|policy|config)\.json$/,
    );
    assert.equal(sha(await readFile(join(dir, name))), digest);
    paths.push(join(dir, name));
  }
  const markets = new Map();
  assert.equal(
    new Set(registry.markets.map((m) => m.marketId)).size,
    registry.markets.length,
  );
  for (const m of registry.markets) {
    assert.equal(m.kind, "amm");
    id(m.marketId);
    id(m.vaultId);
    assert.equal(m.assets.length, 2);
    assert.notEqual(m.assets[0].contractId, m.assets[1].contractId);
    assert.ok(
      hashPattern.test(m.fingerprint) && hashPattern.test(m.publicKeyHash),
    );
    const abi = await json(join(dir, m.marketId + "-abi.json")),
      policy = await json(join(dir, m.marketId + "-policy.json")),
      config = await json(join(dir, m.marketId + "-config.json")),
      dependencies = await json(join(dir, m.marketId + "-dependencies.json"));
    assert.equal(artifacts[m.marketId + "-abi.json"], m.abiSha256);
    assert.equal(artifacts[m.marketId + "-policy.json"], m.policySha256);
    assert.deepEqual(dependencies, m.dependencies);
    assert.equal(policy.market_id, m.marketId);
    assert.equal(policy.market, "amm");
    assert.deepEqual(policy.config, config);
    assert.equal(config.assetA, m.assets[0].contractId);
    assert.equal(config.assetB, m.assets[1].contractId);
    for (const method of m.methods)
      assert.deepEqual(
        Object.fromEntries(
          ["name", "method_id", "input_felt_count"].map((k) => [
            k,
            abi.contract.methods.find((x) => x.name === method.name)?.[k],
          ]),
        ),
        method,
      );
    for (const a of m.assets) {
      assert.equal(a.decimals, 18);
      id(a.issuerUserId);
      assert.equal(
        artifacts[m.marketId + "-asset-" + a.contractId + "-abi.json"],
        a.abiSha256,
      );
      const token = await json(
        join(dir, m.marketId + "-asset-" + a.contractId + "-abi.json"),
      );
      validateU124TokenAbi(token);
      for (const method of a.methods)
        assert.deepEqual(
          Object.fromEntries(
            ["name", "method_id", "input_felt_count"].map((k) => [
              k,
              token.contract.methods.find((x) => x.name === method.name)?.[k],
            ]),
          ),
          method,
        );
    }
    assert.deepEqual(
      [...m.dependencies.map((d) => d.contract.contractId)].sort(
        (a, b) => a - b,
      ),
      [0, ...m.assets.map((a) => a.contractId), m.marketId].sort(
        (a, b) => a - b,
      ),
    );
    markets.set(m.marketId, { abi, config });
  }
  const positions = c.positions
    ? await loadPositions(c.positions, c.rpcConfig)
    : null;
  return {
    config: c,
    registry,
    markets,
    positions,
    current: await captureInputs(paths),
  };
}
export async function createGatewayAdapter(
  loaded,
  {
    readState = publicState,
    readReceipts = receiptReader,
    now = Date.now,
    planDirectory,
  } = {},
) {
  const { config: c, registry, markets, current } = loaded;
  const readPositions = loaded.positions
    ? positionReader(loaded.positions, {
        rpcConfig: c.rpcConfig,
        readState,
        now,
      })
    : null;
  const positionSnapshot = readPositions
    ? async (input) => {
        await current();
        return readPositions(input);
      }
    : undefined;
  const readMarketPlan = loaded.positions
    ? await marketActionReader(loaded.positions, {
        rpcConfig: c.rpcConfig,
        readState,
        now,
      })
    : null;
  const marketPlan = readMarketPlan
    ? async (input) => {
        await current();
        const result = await readMarketPlan(input);
        const { recordId, registryHash, ...record } = result;
        await persistUnsigned(record, recordId);
        return result;
      }
    : undefined;
  async function persistUnsigned(record, recordId) {
    if (!planDirectory) return;
    assert.equal(sha(canonical(record)), recordId);
    await mkdir(planDirectory, { recursive: true, mode: 0o700 });
    const path = join(planDirectory, recordId + ".json"),
      data = canonical(record) + "\n";
    try {
      assert.ok(
        (await readdir(planDirectory)).length < 1000,
        "Unsigned plan store capacity reached",
      );
      await publishFile(path, data);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      assert.equal(await readFile(path, "utf8"), data);
    }
  }
  const readReadiness = createReadinessReader({
    registry,
    registryHash: c.registrySha256,
    rpcConfig: c.rpcConfig,
    readState,
    now,
    fetchImpl: boundedPublicFetch,
  });
  const readiness = async () => {
    await current();
    if (loaded.positions) await loaded.positions.current();
    return readReadiness();
  };
  let finder;
  const status = async () => {
    await current();
    if (loaded.positions) await loaded.positions.current();
    return {
      schema: 1,
      registry,
      registryHash: c.registrySha256,
      capabilities: {
        publicReads: true,
        unsignedPlans: true,
        exactReceiptReads: true,
        financialSubmission: false,
        walletPreparedProof: false,
        executorControl: false,
      },
      executor: {
        status: "not-attached",
        reason: "No service status projection has been reviewed",
      },
      writeBoundary: WRITE_BOUNDARY,
    };
  };
  async function snapshot({ marketId, userId }) {
    exactFields(arguments[0], ["marketId", "userId"]);
    id(userId);
    const m = marketFor(registry, marketId);
    assert.notEqual(userId, m.vaultId);
    await current();
    const s = await readState(c.rpcConfig, { fetchImpl: boundedPublicFetch });
    assert.equal(s.networkName, registry.network.name);
    assert.equal(String(s.network.magic), registry.network.magic);
    assert.equal(s.network.users_per_realm, registry.network.usersPerRealm);
    await Promise.all(
      m.dependencies.map(async (expected) => {
        const l = await s.contractLeaf(expected.contract.contractId);
        assert.deepEqual(
          {
            contract: {
              contractId: expected.contract.contractId,
              codeRoot: l.code_root,
              layoutRoot: l.state_layout_root,
              stateTreeHeight: l.state_tree_height,
            },
            functionTreeRoot: l.function_tree_root,
            layoutFieldCount: l.state_layout_field_count,
            layoutSlotCount: l.state_layout_slot_count,
          },
          expected,
          "Reviewed code/layout/function identity changed",
        );
      }),
    );
    assert.deepEqual(
      await s.userIds(m.publicKeyHash),
      [m.vaultId],
      "Vault key registration changed",
    );
    const { abi } = markets.get(marketId),
      map = new Map(abi.contract.state.map((f) => [f.name, f]));
    const field = (u, name, i = 0) => {
      const f = map.get(name);
      assert.ok(f, "Missing reviewed field " + name);
      return s.slot(u, marketId, f.offset + i);
    };
    const pair = async (u, name, i = 0) =>
      decodeAmount(
        await Promise.all([field(u, name, i), field(u, name, i + 1)]),
      );
    const realm = s.network.realm_configs.find(
      (x) => x.id === Math.floor(userId / s.network.users_per_realm),
    );
    assert.ok(realm, "Missing user realm");
    const params = { checkpoint_id: s.checkpoint, user_id: userId };
    const [leaf, leafHash] = await Promise.all([
      s.rpc(realm.rpc_url[0], "psy_get_user_leaf_data", params, {
        exactIntegers: true,
      }),
      s.rpc(realm.rpc_url[0], "psy_get_user_tree_leaf_hash", params),
    ]);
    if (leaf.public_key === "0".repeat(64))
      throw Object.assign(Error("Account has no active leaf at the observed checkpoint"), {
        code: "ACCOUNT_NOT_ACTIVE",
      });
    assert.ok(
      hashPattern.test(leaf.public_key) &&
        leaf.public_key !== "0".repeat(64) &&
        hashPattern.test(leafHash),
      "Public user registration/leaf missing",
    );
    const order = Object.fromEntries(
      await Promise.all(
        [
          "kind",
          "pool",
          "side",
          "deadline",
          "nonce",
          "cancelled",
          "admission_epoch",
          "admission_cutoff",
          "admission_nonce",
        ].map(async (name) => [name, String(await field(userId, name))]),
      ),
    );
    const pool = Object.fromEntries(
      await Promise.all(
        [
          ["reserveA", "reserve_a", 0],
          ["reserveB", "reserve_b", 0],
          ["totalShares", "total_shares", 0],
          ["ownedShares", "shares", 2 * userId],
        ].map(async ([key, name, i]) => [
          key,
          String(await pair(m.vaultId, name, i)),
        ]),
      ),
    );
    const queue = Object.fromEntries(
      await Promise.all(
        [
          ["epoch", "queue_epoch"],
          ["phase", "queue_phase"],
          ["cutoff", "queue_cutoff"],
          ["count", "queue_count"],
        ].map(async ([key, name]) => [
          key,
          String(await field(m.vaultId, name)),
        ]),
      ),
    );
    const assets = await Promise.all(
      m.assets.map(async (a, index) => {
        const [decimals, renounced] = await Promise.all([
          s.slot(a.issuerUserId, a.contractId, 33554445),
          s.slot(a.issuerUserId, a.contractId, 3),
        ]);
        assert.equal(
          decimals,
          BigInt(a.decimals),
          "Canonical decimals changed",
        );
        assert.equal(renounced, 1n, "Asset administration is mutable");
        const wide = async (u, offset) =>
          decodeAmount(
            await Promise.all([
              s.slot(u, a.contractId, offset),
              s.slot(u, a.contractId, offset + 1),
            ]),
          );
        const [balance, sentToVault, vaultSettled, sentToUser, claimedByUser] =
          await Promise.all([
            wide(userId, 0),
            wide(userId, 33554453 + 4 * m.vaultId),
            pair(m.vaultId, index ? "settled_b" : "settled_a", 2 * userId),
            wide(m.vaultId, 33554453 + 4 * userId),
            wide(userId, 33554453 + 4 * m.vaultId + 2),
          ]);
        assert.ok(
          sentToVault >= vaultSettled && sentToUser >= claimedByUser,
          "Outbox cursor underflow",
        );
        return {
          contractId: a.contractId,
          symbol: a.symbol,
          decimals: a.decimals,
          balance: String(balance),
          sentToVault: String(sentToVault),
          vaultSettled: String(vaultSettled),
          claimableFromVault: String(sentToUser - claimedByUser),
        };
      }),
    );
    const [
      nativeBalance,
      feeSent,
      feeSettled,
      feeClaimed,
      nativeSent,
      nativeClaimed,
      consumed,
      recoveryPool,
      batchReady,
      batchPhase,
    ] = await Promise.all([
      s.slot(userId, 0, 0),
      s.slot(userId, 0, 3 + 2 * m.vaultId),
      field(m.vaultId, "settled_fee", userId),
      s.slot(m.vaultId, 0, 4 + 2 * userId),
      s.slot(m.vaultId, 0, 3 + 2 * userId),
      s.slot(userId, 0, 4 + 2 * m.vaultId),
      field(m.vaultId, "consumed", userId),
      field(userId, "recovery_pool"),
      field(m.vaultId, "batch_ready"),
      field(m.vaultId, "batch_phase"),
    ]);
    assert.ok(nativeSent >= nativeClaimed, "Native output cursor underflow");
    const anchors = (
      await Promise.all(
        [userId, m.vaultId].map((u) =>
          Promise.all(
            m.dependencies.map(async (d) => ({
              userId: u,
              contractId: d.contract.contractId,
              root: await s.contractStateRoot(u, d.contract.contractId),
            })),
          ),
        ),
      )
    ).flat();
    await current();
    return {
      schema: 2,
      registryHash: c.registrySha256,
      network: registry.network,
      marketId,
      userId,
      checkpoint: s.checkpoint,
      observedAt: now(),
      assurance: "rpc-observed",
      financialAuthorization: false,
      user: {
        publicKeyHash: leaf.public_key,
        nonce: String(leaf.nonce),
        leafHash,
        nativeBalance: String(nativeBalance),
      },
      pool,
      queue,
      order,
      assets,
      anchors,
      lifecycle: {
        consumed: String(consumed),
        recoveryPool: String(recoveryPool),
        batchReady: String(batchReady),
        batchPhase: String(batchPhase),
      },
      funding: {
        feeSent: String(feeSent),
        feeSettled: String(feeSettled),
        feeClaimed: String(feeClaimed),
        nativeSent: String(nativeSent),
        nativeClaimed: String(nativeClaimed),
        nativeClaimable: String(nativeSent - nativeClaimed),
      },
    };
  }
  const plan = async (request) => {
    const observed = await snapshot({
      marketId: request.marketId,
      userId: request.userId,
    });
    const plan = buildAmmPlan(observed, request, registry, {
      now: now(),
      registryHash: c.registrySha256,
    });
    const record = { schema: 1, request, snapshot: observed, plan },
      recordId = sha(canonical(record));
    await persistUnsigned(record, recordId);
    return { ...record, recordId, registryHash: c.registrySha256 };
  };
  const receipt = async (input) => {
    exactFields(input, ["userId", "endUserLeafHash", "minCheckpoint"]);
    id(input.userId);
    assert.ok(hashPattern.test(input.endUserLeafHash));
    assert.ok(
      Number.isSafeInteger(input.minCheckpoint) && input.minCheckpoint > 0,
    );
    await current();
    finder ??= await readReceipts(c.rpcConfig, {
      maxPages: 20,
      fetchImpl: boundedPublicFetch,
    });
    return {
      registryHash: c.registrySha256,
      result: await finder(input),
      financialAuthorization: false,
    };
  };
  return {
    readiness,
    status,
    snapshot,
    plan,
    receipt,
    ...(positionSnapshot ? { positionSnapshot } : {}),
    ...(marketPlan ? { marketPlan } : {}),
  };
}
