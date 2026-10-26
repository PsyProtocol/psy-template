// Synthetic RPC transport for actual adapter/ABI tests. Never a UI data source.
import { createHash } from "node:crypto";
import { readFile, mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPositions } from "./positions.mjs";
export const positionNow = 1793000000000;
const H = (x) => createHash("sha256").update(x).digest("hex");
export async function positionFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "psy-position-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = resolve(
    "market-client/reviewed/staging-position-readers-20261027-v2",
  );
  await cp(source, dir, { recursive: true });
  const pin = JSON.parse(await readFile(join(source, "client-pin.json")));
  const rpcConfig = resolve(
    "market-client/reviewed/staging-qa-20261026-account-v2/rpc-config.json",
  );
  const loaded = await loadPositions(
    { reviewedDirectory: dir, ...pin },
    rpcConfig,
  );
  return { dir, rpcConfig, loaded };
}
export function fakePositionState(loaded, marketId, { userId = 12345 } = {}) {
  const m = loaded.registry.markets.find((m) => m.marketId === marketId),
    abi = loaded.details.get(marketId).abi,
    fields = new Map(abi.contract.state.map((x) => [x.name, x.offset])),
    slots = new Map();
  const put = (u, c, o, v) => slots.set(`${u}:${c}:${o}`, BigInt(v)),
    field = (u, n, v, i = 0) => put(u, marketId, fields.get(n) + i, v),
    pair = (u, n, v, i = 0) => {
      field(u, n, BigInt(v) % 2n ** 62n, i);
      field(u, n, BigInt(v) / 2n ** 62n, i + 1);
    };
  field(userId, "kind", 1);
  field(userId, "pool", m.vaultId);
  field(userId, "nonce", 1);
  field(userId, "deadline", 1064);
  field(userId, "order_checkpoint", 1000);
  field(m.vaultId, "queue_epoch", 1);
  field(m.vaultId, "queue_phase", 1);
  field(m.vaultId, "queue_count", 1);
  field(m.vaultId, "queue_cutoff", 1010);
  for (const name of m.nftId ? ["price"] : ["x", "y", "z"])
    pair(userId, name, 4611686018427387921n);
  for (const a of m.assets) {
    put(a.issuerUserId, a.contractId, 33554445, 18);
    put(a.issuerUserId, a.contractId, 3, 1);
    put(userId, a.contractId, 0, 17);
    put(userId, a.contractId, 1, 1);
    put(m.vaultId, a.contractId, 33554453 + 4 * userId, 17);
  }
  put(userId, 0, 0, 100000000000n);
  put(m.vaultId, 0, 3 + 2 * userId, 2000000000n);
  put(userId, 0, 4 + 2 * m.vaultId, 1000000000n);
  if (m.kind === "bondingcurve") {
    field(m.vaultId, "sold_lots", 2);
    pair(m.vaultId, "quote_reserve", 4611686018427387921n);
  }
  if (m.nftId) {
    put(userId, m.nftId, 0, 1);
    put(userId, m.nftId, 30, 101);
    put(userId, m.nftId, 34, 1);
    put(m.vaultId, m.nftId, 1182 + 35 * userId + 32, 2);
    put(userId, m.nftId, 1182 + 35 * m.vaultId + 33, 1);
    put(m.vaultId, m.nftId, 1182 + 35 * userId + 8, 202);
  }
  const state = {
    networkName: loaded.registry.network.name,
    network: {
      magic: loaded.registry.network.magic,
      users_per_realm: loaded.registry.network.usersPerRealm,
      realm_configs: [{ id: 0, rpc_url: ["https://invalid.test"] }],
    },
    checkpoint: 1000,
    slot: async (u, c, o) => slots.get(`${u}:${c}:${o}`) ?? 0n,
    contractLeaf: async (c) => {
      const d = m.dependencies.find((x) => x.contract.contractId === c);
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
    contractStateRoot: async (u, c) => H(`${u}:${c}`),
    rpc: async (_url, method, params) => {
      if (params.checkpoint_id !== 1000 || params.user_id !== userId)
        throw Error("checkpoint/user scope changed");
      return method === "psy_get_user_leaf_data"
        ? { public_key: H("ordinary user"), nonce: 7n }
        : H("user leaf");
    },
  };
  return { state, slots, put, field };
}
