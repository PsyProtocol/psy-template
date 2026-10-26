import { readFile, mkdir, cp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
export const H = (x) => createHash("sha256").update(String(x)).digest("hex");
export const NOW = 1793000000000;
export async function fixtureConfig(directory) {
  const source = resolve("market-client/reviewed/staging-qa-20261026"),
    reviewed = join(directory, "reviewed");
  await mkdir(directory, { recursive: true });
  await cp(source, reviewed, { recursive: true });
  const p = JSON.parse(await readFile(join(source, "client-pin.json"))),
    config = {
      schema: 1,
      reviewedDirectory: reviewed,
      registrySha256: p.registrySha256,
      rpcConfig: join(reviewed, "rpc-config.json"),
      port: 5274,
      origin: "http://127.0.0.1:5273",
      executorStatusFile: null,
    };
  const file = join(directory, "gateway.json");
  await writeFile(file, JSON.stringify(config));
  return file;
}
export async function fixtureRegistry() {
  return JSON.parse(
    await readFile("market-client/reviewed/staging-qa-20261026/registry.json"),
  );
}
export async function fixturePin() {
  return JSON.parse(
    await readFile(
      "market-client/reviewed/staging-qa-20261026/client-pin.json",
    ),
  );
}
export function observed(
  registry,
  registryHash,
  { marketId = 2485, userId = 12345, now = NOW } = {},
) {
  const m = registry.markets.find((m) => m.marketId === marketId),
    R = 1000n * 10n ** 18n;
  return {
    schema: 1,
    registryHash,
    network: registry.network,
    marketId,
    userId,
    checkpoint: 1000,
    observedAt: now,
    assurance: "rpc-observed",
    financialAuthorization: false,
    user: {
      publicKeyHash: H("public-user"),
      leafHash: H("start-user"),
      nonce: "7",
      nativeBalance: "100000000000",
    },
    pool: {
      reserveA: String(R),
      reserveB: String(R),
      totalShares: String(R),
      ownedShares: "0",
    },
    order: {
      kind: "0",
      pool: "0",
      side: "0",
      deadline: "0",
      nonce: "0",
      cancelled: "0",
      admission_epoch: "0",
      admission_cutoff: "0",
      admission_nonce: "0",
    },
    queue: { epoch: "1", phase: "1", cutoff: "1010", count: "0" },
    assets: m.assets.map((a) => ({
      contractId: a.contractId,
      symbol: a.symbol,
      decimals: a.decimals,
      balance: String(R),
      sentToVault: "0",
      vaultSettled: "0",
      claimableFromVault: "0",
    })),
    anchors: [userId, m.vaultId].flatMap((u) =>
      m.dependencies.map((d) => ({
        userId: u,
        contractId: d.contract.contractId,
        root: H("state:" + u + ":" + d.contract.contractId),
      })),
    ),
    funding: { feeSent: "0", feeSettled: "0", feeClaimed: "0" },
  };
}
export const swapRequest = () => ({
  kind: "swap",
  marketId: 2485,
  userId: 12345,
  recipientId: 12345,
  amountA: "4.611686018427387921",
  amountB: "",
  assetIn: 2483,
  slippageBps: 50,
  validForCheckpoints: 64,
  feeCap: "5",
});
export function fakePublicState(loaded, snapshot) {
  const m = loaded.registry.markets.find(
      (x) => x.marketId === snapshot.marketId,
    ),
    abi = loaded.markets.get(m.marketId).abi,
    map = new Map(abi.contract.state.map((f) => [f.name, f.offset])),
    slots = new Map();
  const put = (u, c, o, n) => slots.set(u + ":" + c + ":" + o, BigInt(n));
  const pair = (u, c, o, n) => {
    const x = BigInt(n),
      radix = 1n << 62n;
    put(u, c, o, x % radix);
    put(u, c, o + 1, x / radix);
  };
  for (const [name, n] of Object.entries(snapshot.order))
    put(snapshot.userId, m.marketId, map.get(name), n);
  for (const [name, key] of [
    ["reserve_a", "reserveA"],
    ["reserve_b", "reserveB"],
    ["total_shares", "totalShares"],
  ])
    pair(m.vaultId, m.marketId, map.get(name), snapshot.pool[key]);
  pair(
    m.vaultId,
    m.marketId,
    map.get("shares") + 2 * snapshot.userId,
    snapshot.pool.ownedShares,
  );
  for (const [name, key] of [
    ["queue_epoch", "epoch"],
    ["queue_phase", "phase"],
    ["queue_cutoff", "cutoff"],
    ["queue_count", "count"],
  ])
    put(m.vaultId, m.marketId, map.get(name), snapshot.queue[key]);
  m.assets.forEach((a, i) => {
    const x = snapshot.assets[i];
    put(a.issuerUserId, a.contractId, 33554445, a.decimals);
    put(a.issuerUserId, a.contractId, 3, 1);
    pair(snapshot.userId, a.contractId, 0, x.balance);
    pair(
      snapshot.userId,
      a.contractId,
      33554453 + 4 * m.vaultId,
      x.sentToVault,
    );
    pair(
      m.vaultId,
      m.marketId,
      map.get(i ? "settled_b" : "settled_a") + 2 * snapshot.userId,
      x.vaultSettled,
    );
    pair(
      m.vaultId,
      a.contractId,
      33554453 + 4 * snapshot.userId,
      x.claimableFromVault,
    );
    pair(snapshot.userId, a.contractId, 33554453 + 4 * m.vaultId + 2, 0);
  });
  put(snapshot.userId, 0, 0, snapshot.user.nativeBalance);
  put(snapshot.userId, 0, 3 + 2 * m.vaultId, snapshot.funding.feeSent);
  put(
    m.vaultId,
    m.marketId,
    map.get("settled_fee") + snapshot.userId,
    snapshot.funding.feeSettled,
  );
  put(m.vaultId, 0, 4 + 2 * snapshot.userId, snapshot.funding.feeClaimed);
  return {
    networkName: loaded.registry.network.name,
    network: {
      magic: loaded.registry.network.magic,
      users_per_realm: loaded.registry.network.usersPerRealm,
      realm_configs: [{ id: 0, rpc_url: ["https://example.invalid"] }],
    },
    checkpoint: snapshot.checkpoint,
    contractLeaf: async (id) => {
      const d = m.dependencies.find((d) => d.contract.contractId === id);
      return {
        code_root: d.contract.codeRoot,
        state_layout_root: d.contract.layoutRoot,
        state_tree_height: d.contract.stateTreeHeight,
        function_tree_root: d.functionTreeRoot,
        state_layout_field_count: d.layoutFieldCount,
        state_layout_slot_count: d.layoutSlotCount,
      };
    },
    userIds: async () => [m.vaultId],
    rpc: async (_url, method) =>
      method === "psy_get_user_leaf_data"
        ? {
            public_key: snapshot.user.publicKeyHash,
            nonce: BigInt(snapshot.user.nonce),
          }
        : snapshot.user.leafHash,
    slot: async (u, c, o) => {
      const v = slots.get(u + ":" + c + ":" + o);
      if (v === undefined) throw Error("Undefined synthetic state slot");
      return v;
    },
    contractStateRoot: async (u, c) =>
      snapshot.anchors.find((a) => a.userId === u && a.contractId === c).root,
  };
}
