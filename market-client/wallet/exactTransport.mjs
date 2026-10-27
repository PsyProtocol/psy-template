// Extension-owned fixed-network transport. No signer, prover, replacement,
// reserialization of a prepared request, automatic send retry or ACK-as-finality.
import {nativeProfile,nativeManifestPath,isMainnetBetaProfile,RESET_BETA_PROFILE} from "../nativeProtocol.mjs";
import { digest, canonical, hashPattern } from "../protocol.mjs";
const ok = (v, text) => { if (!v) throw Error(text); };
const hashBytes = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, "0")).join("");
function bounded(v, max = 4294967295) {
  if (typeof v === "number") ok(Number.isSafeInteger(v), "Rounded network integer");
  ok(/^(0|[1-9]\d*)$/.test(String(v)), "Canonical network integer");
  const n = BigInt(v); ok(n <= BigInt(max), "Network integer overflow"); return Number(n);
}
export function createExactMarketTransport({ bundle, fetcher = fetch, parse, maxPages = 20 }) {
  ok(typeof parse === "function" && Number.isSafeInteger(maxPages) && maxPages >= 1 && maxPages <= 100, "Lossless codec and bounded history required");
  const { registry, networkConfig: network } = bundle;
  const profile=nativeProfile(registry);
  if(profile===RESET_BETA_PROFILE)nativeManifestPath(registry);
  ok(isMainnetBetaProfile(profile) && registry.sdkManifestSha256 === "06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f", "Pinned SDK profile required");
  ok(registry.network.name === "testnet" && BigInt(network.magic) === 1384803358401154921n && BigInt(registry.network.magic) === BigInt(network.magic), "Pinned testnet required");
  ok(network.users_per_realm === registry.network.usersPerRealm && network.realm_configs.length > 0, "Realm domain changed");
  const coordinator = network.coordinator_configs[0].rpc_url[0];
  const realm = (user) => {
    const row = network.realm_configs.find(r => r.id === Math.floor(user / network.users_per_realm));
    ok(row, "Unsupported account realm"); return row.rpc_url[0];
  };
  let active = 0, queue = [];
  async function read(url, options = {}) {
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try {
      const r = await fetcher(url, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
      ok(r.ok, "Configured network read unavailable");
      const raw = await r.text(); ok(raw.length <= 4_000_000, "Public response limit");
      const v = parse(raw); ok(!v.error, "Public RPC rejected"); return v;
    } finally { const next = queue.shift(); if (next) next(); else active--; }
  }
  const rpc = async (url, method, params) => {
    ok(method.startsWith("psy_get_"), "Read RPC only");
    return (await read(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).result;
  };
  async function commonCheckpoint() {
    const heads = await Promise.all(network.realm_configs.map(r => rpc(r.rpc_url[0], "psy_get_latest_l2_block_state", {})));
    const cp = Math.min(...heads.map(h => bounded(h.checkpoint_id)));
    ok(cp > 0, "No common checkpoint"); return cp;
  }
  async function identityAt(p, cp) {
    const params = { checkpoint_id: cp, user_id: p.userId };
    const [leaf, leafHash] = await Promise.all([
      rpc(realm(p.userId), "psy_get_user_leaf_data", params),
      rpc(realm(p.userId), "psy_get_user_tree_leaf_hash", params),
    ]);
    ok(hashPattern.test(leafHash) && hashPattern.test(leaf.public_key), "Invalid user observation");
    return { leaf, leafHash };
  }
  return {
    async recheck(record, p) {
      ok(await hashBytes(p.requestJson) === p.requestSha256, "Exact prepared request changed");
      const market = registry.markets.find(m => m.marketId === record.plan.marketId);
      ok(market && market.quarantined !== true && record.registryHash === bundle.registryHash && p.registryHash === bundle.registryHash, "Unreviewed or quarantined market");
      ok(p.networkHash === await digest(registry.network) && p.sdkManifestSha256 === registry.sdkManifestSha256, "Prepared dependency/network changed");
      const cp = await commonCheckpoint();
      ok(cp >= record.plan.startCheckpoint && cp <= p.validUntilCheckpoint, "Prepared proof expired or checkpoint moved backwards");
      const anchor = await rpc(coordinator, "psy_get_checkpoint_leaf_data", { checkpoint_id: 1 });
      ok(anchor.global_chain_root === registry.network.chainRootAt1, "Wrong chain instance");
      await Promise.all(market.dependencies.map(async expected => {
        const id = expected.contract.contractId, leaf = await rpc(coordinator, "psy_get_contract_leaf_data", { contract_id: id });
        // Layout slots exceed u32 on the reset chain. Reviewed registries use exact
        // safe integers; larger or rounded observations must reject, not coerce.
        const got = { contract: { contractId: id, codeRoot: leaf.code_root, layoutRoot: leaf.state_layout_root, stateTreeHeight: bounded(leaf.state_tree_height) }, functionTreeRoot: leaf.function_tree_root, layoutFieldCount: bounded(leaf.state_layout_field_count), layoutSlotCount: bounded(leaf.state_layout_slot_count, Number.MAX_SAFE_INTEGER) };
        ok(canonical(got) === canonical(expected), "Code/layout/function dependency changed");
      }));
      const [mapping, current] = await Promise.all([
        rpc(coordinator, "psy_get_user_ids_for_public_key", [market.publicKeyHash, 0, 64]), identityAt(p, cp),
      ]);
      ok(Array.isArray(mapping) && mapping.length === 1 && bounded(mapping[0], 16777215) === market.vaultId, "Vault registration changed");
      ok(current.leafHash === p.startUserLeafHash && current.leaf.public_key === p.publicKeyHash && bounded(current.leaf.user_id, 16777215) === p.userId && BigInt(current.leaf.nonce) + 1n === BigInt(p.walletNonce), "Start leaf, account or nonce changed");
      const anchors = [...record.plan.anchors, ...(record.plan.sellerAnchors ?? [])];
      ok(anchors.length > 0 && anchors.length <= 32, "Full approved state anchors required");
      await Promise.all(anchors.map(async a => {
        ok(hashPattern.test(a.root) && market.dependencies.some(d => d.contract.contractId === a.contractId), "Unreviewed state anchor");
        const root = await rpc(realm(a.userId), "psy_get_user_contract_tree_leaf_hash", { checkpoint_id: cp, user_id: a.userId, contract_id: a.contractId });
        ok(root === a.root, "Approved state endpoint changed");
      }));
      const value = await rpc(realm(p.userId), "psy_get_user_contract_state_tree_leaf_hash", { checkpoint_id: cp, user_id: p.userId, contract_id: 0, leaf_id: 0 });
      ok(hashPattern.test(value), "Invalid native balance leaf");
      const balance = BigInt("0x" + value.slice(48)), debit = record.plan.debits.filter(d => d.contractId === 0).reduce((n,d) => n + BigInt(d.amount), 0n);
      ok(BigInt(p.actualFee) > 0n && BigInt(p.actualFee) <= BigInt(record.plan.maxNetworkFee) && balance >= debit + BigInt(p.actualFee), "Insufficient actual fees/escrow");
      // No completed balance/nonce observation survives this invocation.
      return { requestSha256: p.requestSha256, identityAndDependenciesVerified: true, fullStateAndNonceVerified: true, feesVerified: true, checkpoint: cp };
    },
    async broadcastExact(requestJson, requestSha256) {
      ok(typeof requestJson === "string" && requestJson.length <= 6_000_000 && await hashBytes(requestJson) === requestSha256, "Exact request byte identity required");
      const request = parse(requestJson), core = request.user_ec_input?.core;
      const user = bounded(core?.state_transition?.user_id, 16777215);
      ok(user > 0 && hashPattern.test(core.state_transition.end_user_leaf_hash), "Original user/endcap identity required");
      // Preserve the exact public request substring. The JSON-RPC envelope is
      // transport framing; parsing is only for endpoint/response validation.
      const body = '{"jsonrpc":"2.0","id":1,"method":"psy_submit_user_end_cap","params":' + requestJson + '}';
      const r = await fetcher(realm(user), { method: "POST", headers: { "content-type": "application/json" }, body, redirect: "error", signal: AbortSignal.timeout(30000) });
      ok(r.ok, "Exact broadcast response unavailable; reconcile original identity");
      const raw = await r.text(); ok(raw.length <= 262144, "Broadcast response limit");
      const response = parse(raw);
      ok(!response.error && response.result === core.state_transition.end_user_leaf_hash, "Broadcast ACK differs; reconcile original identity");
      return { accepted: true, confirmed: false, requestSha256, endUserLeafHash: response.result };
    },
    async reconcile(p) {
      ok(await hashBytes(p.requestJson) === p.requestSha256, "Original request bytes changed");
      ok(hashPattern.test(p.contentHash ?? ""), "Verified original content hash required");
      ok(p.networkHash === await digest(registry.network) && p.sdkManifestSha256 === registry.sdkManifestSha256, "Receipt network/dependency identity changed");
      const chain = await rpc(coordinator, "psy_get_checkpoint_leaf_data", { checkpoint_id: 1 });
      ok(chain.global_chain_root === registry.network.chainRootAt1, "Wrong receipt chain instance");
      const sourceCheckpoint = bounded(parse(p.requestJson).user_ec_input.core.checkpoint_id);
      const services = network.api_services_url[0].replace(/\/$/, ""), seen = new Set();
      for (let page = 0; page < maxPages; page++) {
        const listing = await read(services + "/api/v1/get/user/transactions?user_id=" + p.userId + "&limit=100&offset=" + page * 100);
        ok(listing.success === true && Array.isArray(listing.data?.items) && listing.data.items.length <= 100, "Invalid original receipt history");
        const fingerprint = JSON.stringify(listing.data.items, (_,v) => typeof v === "bigint" ? v.toString() : v);
        if (seen.has(fingerprint)) return { status: "unresolved" }; seen.add(fingerprint);
        for (const e of listing.data.items) {
          if (e.tx_type !== "user_endcap" || bounded(e.owner_user_id,16777215) !== p.userId || e.content_hash !== p.contentHash) continue;
          const cp = bounded(e.included_checkpoint_id);
          if (cp < sourceCheckpoint) continue;
          const historical = await rpc(realm(p.userId), "psy_get_user_tree_leaf_hash", { checkpoint_id: cp, user_id: p.userId });
          if (historical !== p.endUserLeafHash) continue;
          const response = await read(services + "/api/v1/transaction/hash/" + e.content_hash), receipt = response.data;
          if (response.success !== true || receipt?.status !== "included" || receipt.content_hash !== e.content_hash || bounded(receipt.owner_user_id,16777215) !== p.userId || bounded(receipt.included_checkpoint_id) !== cp) continue;
          const common = await commonCheckpoint();
          if (common < cp) return { status: "unresolved" };
          const current = await identityAt(p,common);
          ok(current.leaf.public_key === p.publicKeyHash && bounded(current.leaf.user_id,16777215) === p.userId, "Receipt account/key changed");
          return { status: "included", success: true, requestSha256: p.requestSha256, userId: p.userId, endUserLeafHash: p.endUserLeafHash, contentHash: e.content_hash, networkHash: p.networkHash, checkpoint: cp, commonCheckpoint: common, commonNonce: String(current.leaf.nonce), commonLeafHash: current.leafHash };
        }
        if (listing.data.has_next === false || listing.data.items.length < 100) break;
      }
      return { status: "unresolved" };
    },
  };
}
