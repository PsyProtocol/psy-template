import { nativeManifestPath } from "../../market-client/nativeProtocol.mjs";
// Fixed-checkpoint public observations. No proof generation, wallet or send path.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { captureInputs } from "../submissionGuard.mjs";
import { validateU124TokenAbi } from "../u124Abi.mjs";
import {
  canonical,
  exactFields,
  id,
  hashPattern,
} from "../../market-client/protocol.mjs";
import { decodeAmount } from "../../amm/u124/client.mjs";
import { validatePositionSnapshot } from "../../market-client/positionSnapshot.mjs";
import { boundedPublicFetch } from "./boundedFetch.mjs";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  json = async (p) => JSON.parse(await readFile(p));
export async function loadPositions(config, rpcConfig) {
  exactFields(config, ["reviewedDirectory", "registrySha256"]);
  const dir = resolve(config.reviewedDirectory),
    registry = await json(join(dir, "registry.json")),
    artifacts = await json(join(dir, "artifacts.json"));
  assert.equal(sha(canonical(registry)), config.registrySha256);
  assert.equal(registry.schema, 1);
  const sdk = resolve(
    nativeManifestPath(registry),
  );
  assert.equal(sha(await readFile(sdk)), registry.sdkManifestSha256);
  assert.equal(
    sha(await readFile(rpcConfig)),
    registry.network.rpcConfigSha256,
  );
  const paths = [
      sdk,
      rpcConfig,
      join(dir, "registry.json"),
      join(dir, "artifacts.json"),
    ],
    details = new Map();
  for (const [name, h] of Object.entries(artifacts)) {
    assert.match(
      name,
      /^\d+-(abi|config|registration|policy|nft-abi|asset-\d+-abi)\.json$/,
    );
    assert.equal(sha(await readFile(join(dir, name))), h);
    paths.push(join(dir, name));
  }
  assert.equal(registry.markets.length, 3);
  assert.equal(new Set(registry.markets.map((m) => m.marketId)).size, 3);
  for (const m of registry.markets) {
    assert.ok(["orderbook", "bondingcurve", "nftmarket"].includes(m.kind));
    id(m.marketId);
    id(m.vaultId);
    assert.match(m.fingerprint, hashPattern);
    assert.match(m.publicKeyHash, hashPattern);
    const abi = await json(join(dir, m.marketId + "-abi.json")),
      cfg = await json(join(dir, m.marketId + "-config.json")),
      policy = await json(join(dir, m.marketId + "-policy.json")),
      registration = await json(join(dir, m.marketId + "-registration.json"));
    assert.equal(artifacts[m.marketId + "-abi.json"], m.abiSha256);
    assert.deepEqual(cfg, m.config);
    assert.equal(policy.market_id, m.marketId);
    assert.equal(policy.market, m.kind);
    assert.deepEqual(policy.config, cfg);
    assert.deepEqual(registration.contracts, m.dependencies);
    assert.equal(registration.publicKeyHash, m.publicKeyHash);
    assert.equal(registration.fingerprint, m.fingerprint);
    assert.equal(registration.vaultId, m.vaultId);
    for (const a of m.assets) {
      assert.equal(a.decimals, 18);
      assert.equal(
        artifacts[`${m.marketId}-asset-${a.contractId}-abi.json`],
        a.abiSha256,
      );
      validateU124TokenAbi(
        await json(join(dir, `${m.marketId}-asset-${a.contractId}-abi.json`)),
      );
    }
    assert.deepEqual(
      m.dependencies.map((x) => x.contract.contractId).sort((a, b) => a - b),
      [
        0,
        m.marketId,
        ...m.assets.map((a) => a.contractId),
        ...(m.nftId ? [m.nftId] : []),
      ].sort((a, b) => a - b),
    );
    const nft = m.nftId
      ? await json(join(dir, m.marketId + "-nft-abi.json"))
      : null;
    if (nft) {
      assert.equal(artifacts[m.marketId + "-nft-abi.json"], m.nftAbiSha256);
      const f = nft.contract.state.find((x) => x.name === "owned_tokens");
      assert.equal(f.type.length, 128);
      assert.equal(f.type.item_felt_size, 9);
      assert.equal(
        nft.contract.state.find((x) => x.name === "outbox").type.item_felt_size,
        35,
      );
    }
    details.set(m.marketId, { abi, nft });
  }
  return {
    directory: dir,
    registry,
    registryHash: config.registrySha256,
    details,
    current: await captureInputs(paths),
  };
}
export function positionReader(
  loaded,
  { rpcConfig, readState, now = Date.now },
) {
  return async (request) => {
    exactFields(request, ["marketId", "userId", "slotStart", "slotCount"]);
    const { marketId, userId, slotStart, slotCount } = request;
    id(userId);
    const m = loaded.registry.markets.find((x) => x.marketId === marketId);
    assert.ok(m);
    assert.notEqual(userId, m.vaultId);
    assert.ok(
      Number.isSafeInteger(slotStart) &&
        Number.isSafeInteger(slotCount) &&
        slotStart >= 0 &&
        slotCount >= 0 &&
        slotCount <= 8 &&
        slotStart + slotCount <= 128,
    );
    if (m.nftId) assert.ok(slotCount >= 1);
    else assert.equal(slotStart + slotCount, 0);
    await loaded.current();
    const s = await readState(rpcConfig, { fetchImpl: boundedPublicFetch });
    assert.equal(s.networkName, loaded.registry.network.name);
    assert.equal(String(s.network.magic), loaded.registry.network.magic);
    assert.equal(
      s.network.users_per_realm,
      loaded.registry.network.usersPerRealm,
    );
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
          "Position code/layout/function identity changed",
        );
      }),
    );
    assert.deepEqual(
      await s.userIds(m.publicKeyHash),
      [m.vaultId],
      "Position vault registration changed",
    );
    const { abi, nft } = loaded.details.get(marketId),
      fields = new Map(abi.contract.state.map((f) => [f.name, f.offset]));
    const f = (u, name, i = 0) => {
        assert.ok(fields.has(name), name);
        return s.slot(u, marketId, fields.get(name) + i);
      },
      pair = async (u, name, i = 0) =>
        String(
          decodeAmount(await Promise.all([f(u, name, i), f(u, name, i + 1)])),
        ),
      word = async (u, name, i = 0) => String(await f(u, name, i));
    const realm = s.network.realm_configs.find(
      (x) => x.id === Math.floor(userId / s.network.users_per_realm),
    );
    assert.ok(realm);
    const params = { checkpoint_id: s.checkpoint, user_id: userId };
    const [leaf, leafHash, nativeBalance] = await Promise.all([
      s.rpc(realm.rpc_url[0], "psy_get_user_leaf_data", params, {
        exactIntegers: true,
      }),
      s.rpc(realm.rpc_url[0], "psy_get_user_tree_leaf_hash", params),
      s.slot(userId, 0, 0),
    ]);
    assert.notEqual(leaf.public_key, "0".repeat(64));
    const orderNames = m.nftId
      ? [
          "kind",
          "pool",
          "nonce",
          "deadline",
          "cancelled",
          "seller",
          "listing_nonce",
          "nft_sequence",
          "order_checkpoint",
          "admission_epoch",
          "admission_nonce",
          "admission_cutoff",
        ]
      : [
          "kind",
          "pool",
          "side",
          "deadline",
          "nonce",
          "cancelled",
          "order_checkpoint",
          "admission_epoch",
          "admission_nonce",
          "admission_cutoff",
        ];
    const order = Object.fromEntries(
      await Promise.all(
        orderNames.map(async (name) => [name, await word(userId, name)]),
      ),
    );
    for (const name of m.nftId ? ["price"] : ["x", "y", "z"])
      order[name] = await pair(userId, name);
    if (m.nftId)
      for (const [name, prefix] of [
        ["tokenId", "token_id_"],
        ["metadataHash", "metadata_hash_"],
      ])
        order[name] = await Promise.all(
          [0, 1, 2, 3].map((i) => word(userId, prefix + i)),
        );
    const queue = Object.fromEntries(
      await Promise.all(
        ["epoch", "phase", "cutoff", "count"].map(async (n) => [
          n,
          await word(m.vaultId, "queue_" + n),
        ]),
      ),
    );
    queue.root = await Promise.all(
      [0, 1, 2, 3].map((i) => word(m.vaultId, "queue_root", i)),
    );
    const assets = await Promise.all(
      m.assets.map(async (a, index) => {
        const [dec, renounced] = await Promise.all([
          s.slot(a.issuerUserId, a.contractId, 33554445),
          s.slot(a.issuerUserId, a.contractId, 3),
        ]);
        assert.equal(dec, 18n);
        assert.equal(renounced, 1n);
        const wide = async (u, o) =>
          String(
            decodeAmount(
              await Promise.all([
                s.slot(u, a.contractId, o),
                s.slot(u, a.contractId, o + 1),
              ]),
            ),
          );
        const [balance, sentToVault, settled, sent, claimed] =
          await Promise.all([
            wide(userId, 0),
            wide(userId, 33554453 + 4 * m.vaultId),
            pair(
              m.vaultId,
              m.nftId ? "settled_payment" : index ? "settled_b" : "settled_a",
              2 * userId,
            ),
            wide(m.vaultId, 33554453 + 4 * userId),
            wide(userId, 33554453 + 4 * m.vaultId + 2),
          ]);
        assert.ok(BigInt(sent) >= BigInt(claimed));
        return {
          contractId: a.contractId,
          symbol: a.symbol,
          decimals: a.decimals,
          balance,
          sentToVault,
          settled,
          claimable: String(BigInt(sent) - BigInt(claimed)),
        };
      }),
    );
    const [sent, claimed] = await Promise.all([
      s.slot(m.vaultId, 0, 3 + 2 * userId),
      s.slot(userId, 0, 4 + 2 * m.vaultId),
    ]);
    assert.ok(sent >= claimed);
    const lifecycle = {
      consumed: await word(m.vaultId, "consumed", userId),
      settledFee: await word(m.vaultId, "settled_fee", userId),
    };
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
    const result = {
      schema: 1,
      registryHash: loaded.registryHash,
      network: loaded.registry.network,
      assurance: "rpc-observed",
      financialAuthorization: false,
      kind: m.kind,
      marketId,
      vaultId: m.vaultId,
      userId,
      checkpoint: s.checkpoint,
      observedAt: now(),
      user: {
        publicKeyHash: leaf.public_key,
        leafHash,
        nonce: String(leaf.nonce),
        nativeBalance: String(nativeBalance),
      },
      order,
      queue,
      assets,
      lifecycle,
      nativeOutbox: {
        sent: String(sent),
        claimed: String(claimed),
        claimable: String(sent - claimed),
      },
      anchors,
    };
    if (m.kind === "bondingcurve")
      result.curve = {
        phase: await word(m.vaultId, "phase"),
        soldLots: await word(m.vaultId, "sold_lots"),
        quoteReserve: await pair(m.vaultId, "quote_reserve"),
      };
    if (nft) {
      const offset = (name) =>
          nft.contract.state.find((x) => x.name === name).offset,
        owned = offset("owned_tokens"),
        outbox = offset("outbox");
      const read = (u, o) => s.slot(u, m.nftId, o),
        hash = async (u, o) =>
          Promise.all(
            [0, 1, 2, 3].map(async (i) => String(await read(u, o + i))),
          );
      const [nftBalance, ns, nc] = await Promise.all([
        read(userId, offset("balance")),
        read(m.vaultId, outbox + 35 * userId + 32),
        read(userId, outbox + 35 * m.vaultId + 33),
      ]);
      assert.ok(ns >= nc && ns - nc <= 4n);
      const slots = await Promise.all(
        Array.from({ length: slotCount }, async (_, i) => ({
          slot: slotStart + i,
          active: String(await read(userId, owned + 9 * (slotStart + i) + 4)),
          tokenId: await hash(userId, owned + 9 * (slotStart + i)),
          metadataHash: await hash(userId, owned + 9 * (slotStart + i) + 5),
        })),
      );
      const pending = await Promise.all(
        Array.from({ length: Number(ns - nc) }, async (_, i) => {
          const seq = nc + 1n + BigInt(i),
            o = outbox + 35 * userId + Number((seq - 1n) % 4n) * 8;
          return {
            sequence: String(seq),
            tokenId: await hash(m.vaultId, o),
            metadataHash: await hash(m.vaultId, o + 4),
          };
        }),
      );
      result.nft = {
        contractId: m.nftId,
        balance: String(nftBalance),
        slotStart,
        slotCount,
        inventoryComplete: false,
        slots,
        sent: String(ns),
        claimed: String(nc),
        pending,
      };
    }
    await loaded.current();
    validatePositionSnapshot(
      result,
      request,
      loaded.registry,
      loaded.registryHash,
      now(),
    );
    return result;
  };
}
