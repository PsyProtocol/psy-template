// Live readonly diagnostics, never a financial preflight or authorization.
import assert from "node:assert/strict";
import { canonical, hashPattern } from "../../market-client/protocol.mjs";
export function createReadinessReader({
  registry,
  registryHash,
  rpcConfig,
  readState,
  now = Date.now,
  fetchImpl,
}) {
  const native = registry.markets[0].dependencies.find(
    (d) => d.contract.contractId === 0,
  );
  assert.ok(native, "reviewed native identity required");
  let pending;
  async function capture() {
    const result = {
      schema: 1,
      registryHash,
      network: structuredClone(registry.network),
      observedAt: now(),
      assurance: "rpc-observed",
      financialAuthorization: false,
      financialSubmission: false,
      state: "rpc-unavailable",
      checkpoint: null,
      chainRoot: null,
      nativeCodeRoot: null,
      nativeFunctionRoot: null,
      nativeSchemaCompatible: null,
      nativeRootMatchesRegistry: null,
      checkedDependencies: 0,
      issues: [],
    };
    let s;
    try {
      s = await readState(rpcConfig, { fetchImpl });
    } catch {
      return {
        ...result,
        issues: [
          "Configured RPC reads are unavailable. No financial action was submitted.",
        ],
      };
    }
    result.checkpoint = s.checkpoint;
    try {
      assert.equal(s.networkName, registry.network.name);
      assert.equal(BigInt(s.network.magic), BigInt(registry.network.magic));
      assert.equal(s.network.users_per_realm, registry.network.usersPerRealm);
      assert.ok(
        Number.isSafeInteger(s.checkpoint) &&
          s.checkpoint > 0 &&
          s.checkpoint < 4294967296,
      );
      const [anchor, leaf] = await Promise.all([
        s.rpc(s.coordinator, "psy_get_checkpoint_leaf_data", {
          checkpoint_id: 1,
        }),
        s.contractLeaf(0),
      ]);
      assert.ok(hashPattern.test(anchor.global_chain_root));
      assert.ok(
        hashPattern.test(leaf.code_root) &&
          hashPattern.test(leaf.function_tree_root),
      );
      result.chainRoot = anchor.global_chain_root;
      result.nativeCodeRoot = leaf.code_root;
      result.nativeFunctionRoot = leaf.function_tree_root;
      // The selected SDK's exact leaf serializer requires a QHashOut owner. A
      // numeric owner is a protocol change, never permission to coerce schemas.
      result.nativeSchemaCompatible =
        typeof leaf.deployer === "string" && hashPattern.test(leaf.deployer);
      result.nativeRootMatchesRegistry =
        leaf.code_root === native.contract.codeRoot &&
        leaf.function_tree_root === native.functionTreeRoot &&
        leaf.state_layout_root === native.contract.layoutRoot &&
        leaf.state_tree_height === native.contract.stateTreeHeight &&
        leaf.state_layout_field_count === native.layoutFieldCount &&
        leaf.state_layout_slot_count === native.layoutSlotCount;
      if (!result.nativeSchemaCompatible || !result.nativeRootMatchesRegistry) {
        result.state = "protocol-incompatible";
        result.issues = [
          "The current chain does not match the reviewed wallet protocol and deployment identity.",
        ];
        return result;
      }
      if (
        !hashPattern.test(registry.network.chainRootAt1 ?? "") ||
        registry.network.chainRootAt1 !== result.chainRoot
      ) {
        result.state = "deployment-required";
        result.issues = [
          "The observed chain has no matching reviewed checkpoint-one identity. A new chain-scoped deployment manifest is required.",
        ];
        return result;
      }
      const expected = new Map(
        registry.markets.flatMap((m) =>
          m.dependencies.map((d) => [d.contract.contractId, d]),
        ),
      );
      for (const [id, d] of expected) {
        if (id === 0) continue;
        const l = await s.contractLeaf(id);
        result.checkedDependencies++;
        if (
          canonical({
            contract: {
              contractId: id,
              codeRoot: l.code_root,
              layoutRoot: l.state_layout_root,
              stateTreeHeight: l.state_tree_height,
            },
            functionTreeRoot: l.function_tree_root,
            layoutFieldCount: l.state_layout_field_count,
            layoutSlotCount: l.state_layout_slot_count,
          }) !== canonical(d)
        ) {
          result.state = "deployment-required";
          result.issues = [
            "Reviewed market or asset identity differs. A new accepted deployment is required.",
          ];
          return result;
        }
      }
      result.state = "registry-matches";
      result.issues = [
        "Public identities match. Wallet approvals, full native verification and exact submission acceptance are still required.",
      ];
      return result;
    } catch {
      result.state = "identity-rejected";
      result.issues = [
        "Network or deployment identity could not be validated. Existing deployment data must not be reused.",
      ];
      return result;
    }
  }
  return async () => {
    // Share only a simultaneous diagnostic read; completed state is never reused.
    if (!pending) pending = capture();
    const run = pending;
    try {
      return structuredClone(await run);
    } finally {
      if (pending === run) pending = undefined;
    }
  };
}
