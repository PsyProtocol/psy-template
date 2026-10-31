// Fixed-profile public reads only. Captures are observations, never authority.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseLosslessJson, losslessJson } from "../../amm/u124/client.mjs";
import { decodeFeltSlot } from "../../orderbook/matcherCore.mjs";
const COORDINATOR = "https://coordinator-stg.psy-protocol.xyz";
const REALMS = [
  "https://realm0-stg.psy-protocol.xyz",
  "https://realm1-stg.psy-protocol.xyz",
];
const PROVER = "https://prove-stg.psy-protocol.xyz";
const sha = (value) => createHash("sha256").update(value).digest("hex");
// Reject mixed checkpoint roots before resource construction/proving. This
// joins declared roots and path metadata only; the frozen Rust verifier must
// still authenticate each complete Merkle path and checkpoint leaf.
export function validateCheckpointRootContext(context) {
  const hash = (value) =>
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const cp = context.checkpointId;
  if (
    !(typeof cp === "bigint" || (Number.isSafeInteger(cp) && cp > 0)) ||
    BigInt(cp) < 1n ||
    BigInt(cp) >= 4294967296n ||
    !hash(context.checkpointTreeRoot)
  )
    throw Error("Invalid checkpoint root context");
  for (const [path, index] of [
    [context.chainAnchorPath, 1n],
    [context.checkpointPath, BigInt(cp)],
  ]) {
    if (
      !path ||
      path.root !== context.checkpointTreeRoot ||
      path.index !== index ||
      !hash(path.value) ||
      !Array.isArray(path.siblings) ||
      path.siblings.length !== 32 ||
      !path.siblings.every(hash)
    )
      throw Error("Checkpoint root/path context mismatch");
  }
  return {
    declaredRootsAndPathMetadataMatch: true,
    membershipVerified: false,
    canonicalFinalityAuthenticated: false,
  };
}
export async function captureNativeBinding(
  directory,
  { fetcher = fetch } = {},
) {
  const out = resolve(directory);
  await mkdir(out, { mode: 0o700 }); // A fresh output is mandatory.
  const save = (name, value) =>
    writeFile(resolve(out, name), losslessJson(value) + "\n", { flag: "wx" });
  let reads = 0,
    bytes = 0;
  await save("PLAN.json", {
    schema: 1,
    maximumRequests: 18,
    attemptsPerRequest: 1,
    timeoutMilliseconds: 25000,
    maximumBytes: 33554432,
    financialOperations: 0,
    proofsGenerated: 0,
  });
  const read = async (label, endpoint, method, params) => {
    if (
      ![COORDINATOR, ...REALMS, PROVER].includes(endpoint) ||
      !method.startsWith("psy_get_") ||
      reads >= 18
    )
      throw Error("Read scope exceeded");
    reads++;
    const request = { jsonrpc: "2.0", id: 1, method, params };
    await save(label + "-request.json", request);
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      });
      const chunks = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader)
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 4194304 || bytes + size > 33554432) {
              await reader.cancel();
              throw Error("Capture byte limit exceeded");
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
      const raw = Buffer.concat(chunks);
      bytes += raw.length;
      await writeFile(resolve(out, label + ".json"), raw, { flag: "wx" });
      await save(label + "-transport.json", {
        endpoint,
        httpStatus: response.status,
        bytes: raw.length,
        sha256: sha(raw),
        attempts: 1,
      });
      if (response.status !== 200)
        throw Error("Public HTTP response rejected: " + response.status);
      const value = parseLosslessJson(raw.toString("utf8"));
      if (
        value.jsonrpc !== "2.0" ||
        value.id !== 1n ||
        Object.hasOwn(value, "error") ||
        !Object.hasOwn(value, "result")
      )
        throw Error("Public RPC response identity/error rejected");
      return value.result;
    } catch (error) {
      await save(label + "-failure.json", {
        error: error.message,
        cause: error.cause?.code ?? null,
        financialOperations: 0,
      });
      throw error;
    }
  };
  try {
    const heads = [];
    for (let i = 0; i < REALMS.length; i++)
      heads.push(
        await read(
          "realm" + i + "-head",
          REALMS[i],
          "psy_get_latest_l2_block_state",
          {},
        ),
      );
    if (
      heads.some(
        (h) =>
          typeof h.checkpoint_id !== "bigint" ||
          h.checkpoint_id < 3n ||
          h.checkpoint_id >= 4294967296n,
      )
    )
      throw Error("Invalid checkpoint heads");
    const checkpoint = Number(
      heads.reduce(
        (m, h) => (h.checkpoint_id < m ? h.checkpoint_id : m),
        heads[0].checkpoint_id,
      ),
    );
    const anchors = [];
    for (const [i, endpoint] of [...REALMS, COORDINATOR].entries())
      anchors.push(
        await read("anchor-" + i, endpoint, "psy_get_checkpoint_leaf_data", {
          checkpoint_id: 1,
        }),
      );
    if (
      anchors.some(
        (a) =>
          !/^[0-9a-f]{64}$/.test(a.global_chain_root) ||
          a.global_chain_root !== anchors[0].global_chain_root,
      )
    )
      throw Error("Chain identity differs across views");
    const nativeLeaf = await read(
      "native-leaf",
      COORDINATOR,
      "psy_get_contract_leaf_data",
      { contract_id: 0 },
    );
    await read("native-code", COORDINATOR, "psy_get_contract_code_definition", {
      contract_id: 0,
    });
    await read(
      "source-roots",
      COORDINATOR,
      "psy_get_checkpoint_global_state_roots",
      { checkpoint_id: checkpoint },
    );
    const leaf = await read(
      "source-leaf",
      COORDINATOR,
      "psy_get_checkpoint_leaf_data",
      { checkpoint_id: checkpoint },
    );
    await read(
      "native-membership",
      COORDINATOR,
      "psy_get_contract_tree_merkle_proof",
      { checkpoint_id: checkpoint, contract_id: 0 },
    );
    const tree = await read(
      "checkpoint-tree-root",
      COORDINATOR,
      "psy_get_checkpoint_tree_root",
      { checkpoint_id: checkpoint },
    );
    const anchorPath = await read(
      "anchor-path",
      COORDINATOR,
      "psy_get_checkpoint_tree_merkle_proof",
      { checkpoint_id: checkpoint, leaf_checkpoint_id: 1 },
    );
    const path = await read(
      "source-path",
      COORDINATOR,
      "psy_get_checkpoint_tree_merkle_proof",
      { checkpoint_id: checkpoint, leaf_checkpoint_id: checkpoint },
    );
    const after = await read(
      "native-leaf-after",
      COORDINATOR,
      "psy_get_contract_leaf_data",
      { contract_id: 0 },
    );
    if (losslessJson(after) !== losslessJson(nativeLeaf))
      throw Error("Native identity changed during capture");
    const context = {
      schema: 1,
      checkpointId: checkpoint,
      expectedChainRootAt1: anchors[0].global_chain_root,
      chainAnchorLeaf: anchors[2],
      checkpointLeaf: leaf,
      chainAnchorPath: anchorPath,
      checkpointPath: path,
      checkpointTreeRoot: tree,
    };
    validateCheckpointRootContext(context);
    await save("checkpoint-context.json", context);
    const funding = await read(
      "funding-user",
      REALMS[0],
      "psy_get_user_leaf_data",
      { checkpoint_id: checkpoint, user_id: 223232 },
    );
    if (
      funding.user_id !== 223232n ||
      !/^[0-9a-f]{64}$/.test(funding.public_key ?? "") ||
      typeof funding.balance !== "bigint" ||
      funding.balance < 0n ||
      typeof funding.nonce !== "bigint" ||
      funding.nonce < 0n
    )
      throw Error("Funding observation identity/amount rejected");
    // The account leaf's balance is a system field. Spendable test PSY lives
    // in Native contract 0, slot 0; claiming can leave the system field zero.
    const nativeBalanceLeaf = await read(
      "funding-native-balance",
      REALMS[0],
      "psy_get_user_contract_state_tree_leaf_hash",
      { checkpoint_id: checkpoint, user_id: 223232, contract_id: 0, leaf_id: 0 },
    );
    const nativeBalance = decodeFeltSlot(nativeBalanceLeaf, 0);
    if (nativeBalance >= 18446744069414584321n)
      throw Error("Noncanonical Native balance");
    const registry = await read(
      "runtime-client-resources",
      PROVER,
      "psy_get_circuits_data",
      [],
    );
    if (typeof registry !== "string")
      throw Error("Expected encoded client registry");
    const resources = parseLosslessJson(registry);
    if (!resources.ups_end_cap) throw Error("Client Endcap resource absent");
    await save("runtime-endcap-envelope.json", {
      jsonrpc: "2.0",
      id: 1,
      result: losslessJson({ ups_end_cap: resources.ups_end_cap }),
    });
    const summary = {
      schema: 1,
      complete: true,
      checkpoint,
      chainRootAt1: anchors[0].global_chain_root,
      nativeLeaf,
      fundingUser: {
        userId: funding.user_id,
        storedPublicKeyHash: funding.public_key,
        userStateInitialized: funding.public_key !== "0".repeat(64),
        registrationStatus: "not-queried",
        storedUserLeafSystemBalance: String(funding.balance),
        nativeBalance: String(nativeBalance),
        nativeBalanceSource: "contract-0-slot-0-at-captured-checkpoint",
        nonce: String(funding.nonce),
      },
      resourceRoles: Object.keys(resources),
      reads,
      bytes,
      financialOperations: 0,
      proofsGenerated: 0,
      financialReady: false,
      canonicalFinalityAuthenticated: false,
    };
    await save("SUMMARY.json", summary);
    return summary;
  } catch (error) {
    await save("SUMMARY.json", {
      schema: 1,
      complete: false,
      error: error.message,
      reads,
      bytes,
      financialOperations: 0,
      proofsGenerated: 0,
      financialReady: false,
    });
    throw error;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw Error("Usage: captureNativeBinding.mjs FRESH_DIRECTORY");
  console.log(losslessJson(await captureNativeBinding(process.argv[2])));
}
