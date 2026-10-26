// Read-only unsigned planning. One fixed public-state session serves every party.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { positionReader } from "./positions.mjs";
import { boundedPublicFetch } from "./boundedFetch.mjs";
import { canonical } from "../../market-client/protocol.mjs";
import {
  actionQuery,
  buildMarketPlan,
} from "../../market-client/marketPlan.mjs";

export async function marketActionReader(
  loaded,
  { rpcConfig, readState, now = Date.now },
) {
  const abis = {};
  const dir = loaded.directory;
  for (const m of loaded.registry.markets) {
    abis[m.marketId] = loaded.details.get(m.marketId).abi;
    for (const a of m.assets)
      abis[a.contractId] = JSON.parse(
        await readFile(
          join(dir, `${m.marketId}-asset-${a.contractId}-abi.json`),
        ),
      );
    if (m.nftId) abis[m.nftId] = loaded.details.get(m.marketId).nft;
  }
  return async (input) => {
    const request = structuredClone(input),
      query = actionQuery(request, loaded.registry),
      m = loaded.registry.markets.find((m) => m.marketId === request.marketId);
    await loaded.current();
    const state = await readState(rpcConfig, { fetchImpl: boundedPublicFetch });
    const reader = positionReader(loaded, {
      rpcConfig,
      readState: async () => state,
      now,
    });
    const snapshot = await reader(query),
      user = request.userId,
      vault = m.vaultId;
    const fields = new Map(
      loaded.details
        .get(m.marketId)
        .abi.contract.state.map((f) => [f.name, f.offset]),
    );
    const field = async (u, n) => {
      assert.ok(fields.has(n), "Missing reviewed planning field");
      return String(await state.slot(u, m.marketId, fields.get(n)));
    };
    const [
      feeSent,
      feeClaimed,
      recoveryPool,
      batchReady,
      batchPhase,
      vaultPool,
    ] = await Promise.all([
      state.slot(user, 0, 3 + 2 * vault),
      state.slot(vault, 0, 4 + 2 * user),
      field(user, "recovery_pool"),
      field(vault, "batch_ready"),
      field(vault, "batch_phase"),
      field(vault, "pool"),
    ]);
    let nftDeposit = null;
    if (m.nftId) {
      const nft = loaded.details.get(m.marketId).nft,
        outbox = nft.contract.state.find((f) => f.name === "outbox").offset;
      const [sent, claimed] = await Promise.all([
        state.slot(user, m.nftId, outbox + 35 * vault + 32),
        state.slot(vault, m.nftId, outbox + 35 * user + 33),
      ]);
      nftDeposit = { sent: String(sent), claimed: String(claimed) };
    }
    const seller =
      request.kind === "nft-buy"
        ? await reader({
            marketId: m.marketId,
            userId: request.terms.sellerId,
            slotStart: 0,
            slotCount: 8,
          })
        : null;
    let sellerEscrow = null;
    if (seller) {
      const nft = loaded.details.get(m.marketId).nft,
        outbox = nft.contract.state.find((f) => f.name === "outbox").offset,
        sid = seller.userId;
      const [sent, claimed, feeSent] = await Promise.all([
        state.slot(sid, m.nftId, outbox + 35 * vault + 32),
        state.slot(vault, m.nftId, outbox + 35 * sid + 33),
        state.slot(sid, 0, 3 + 2 * vault),
      ]);
      const packet =
        outbox +
        35 * vault +
        8 * Number(BigInt(seller.order.nft_sequence) % 4n);
      const hash = (offset) =>
        Promise.all(
          [0, 1, 2, 3].map(async (i) =>
            String(await state.slot(sid, m.nftId, packet + offset + i)),
          ),
        );
      sellerEscrow = {
        sent: String(sent),
        claimed: String(claimed),
        feeSent: String(feeSent),
        tokenId: await hash(0),
        metadataHash: await hash(4),
      };
    }
    const context = {
      checkpoint: snapshot.checkpoint,
      feeSent: String(feeSent),
      feeClaimed: String(feeClaimed),
      recoveryPool,
      batchReady,
      batchPhase,
      vaultPool,
      nftDeposit,
      seller,
      sellerEscrow,
    };
    const plan = buildMarketPlan(
      snapshot,
      context,
      request,
      loaded.registry,
      abis,
      { registryHash: loaded.registryHash, now: now() },
    );
    await loaded.current();
    const record = { schema: 1, request, snapshot, context, plan };
    return {
      ...record,
      registryHash: loaded.registryHash,
      recordId: createHash("sha256").update(canonical(record)).digest("hex"),
    };
  };
}
