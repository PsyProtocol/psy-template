import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	fundingDecision,
	reconcileFaucetFunding,
} from "./reconcileFaucetFunding.mjs";
import { losslessJson } from "../../amm/u124/client.mjs";
import {
	RESET_CHAIN_ROOT,
	RESET_NATIVE_BINDING,
} from "../../market-client/nativeProtocol.mjs";

async function scenario(fn, change = () => {}) {
	const base = await mkdtemp(join(tmpdir(), "psy-faucet-capture-"));
	try {
		const original = join(base, "original"),
			capture = join(base, "capture");
		await mkdir(original);
		await mkdir(capture);
		const publicKey =
			"97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834";
		const request = {
			jsonrpc: "2.0",
			id: 1,
			method: "psy_claim_faucet",
			params: [{ recipient_user_id: 223232, recipient_public_key: publicKey }],
		};
		const requestSha256 =
			"85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d";
		await writeFile(
			join(original, "faucet-request-v1.json"),
			JSON.stringify(request),
		);
		await writeFile(
			join(original, "faucet-broadcast-intent-v1.json"),
			JSON.stringify({ requestSha256, chainRootAt1: RESET_CHAIN_ROOT }),
		);
		await writeFile(
			join(original, "faucet-send-once-v1.lock"),
			JSON.stringify({ requestSha256 }),
		);
		const config = {
			enabled: true,
			faucet_contract_id: 5,
			faucet_method_name: "faucet",
			amount: "1000000000000",
			operator_user_ids: Array.from({ length: 100 }, (_, i) => i + 1),
		};
		await writeFile(
			join(original, "faucet-precheck-5.json"),
			JSON.stringify({ responseText: JSON.stringify({ result: config }) }),
		);
		const b = RESET_NATIVE_BINDING;
		const summary = {
			complete: true,
			checkpoint: 123,
			chainRootAt1: RESET_CHAIN_ROOT,
			nativeLeaf: {
				deployer: 0,
				code_root: b.contract.codeRoot,
				function_tree_root: b.functionTreeRoot,
				state_layout_root: b.contract.layoutRoot,
				state_tree_height: 32,
				state_layout_field_count: 8,
				state_layout_slot_count: b.layoutSlotCount,
			},
			fundingUser: {
				userId: 223232,
				storedPublicKeyHash: "0".repeat(64),
				nativeBalance: "0",
			},
		};
		change({ summary, config });
		await writeFile(join(capture, "SUMMARY.json"), JSON.stringify(summary));
		const calls = [];
		const fetcher = async (endpoint, options) => {
			const q = JSON.parse(options.body);
			calls.push({ endpoint, ...q, redirect: options.redirect });
			let result;
			if (q.method === "psy_get_psy_faucet_config") result = config;
			else if (q.method === "psy_get_user_ids_for_public_key")
				result = [223232];
			else if (q.method === "psy_get_user_registration_tree_leaf_hash")
				result = publicKey;
			else if (q.method === "psy_get_user_contract_state_tree_leaf_hash")
				result = "0".repeat(64);
			else throw Error("Unexpected method");
			return new Response(losslessJson({ jsonrpc: "2.0", id: q.id, result }));
		};
		await fn({ base, original, capture, calls, fetcher });
	} finally {
		await rm(base, { recursive: true, force: true });
	}
}

test("zero balances and a complete empty operator set never resolve or unlock the original grant", () => {
	const r = fundingDecision([{ sender: 1, sent: 0n, claimed: 0n }], 0n);
	assert.equal(r.knownOperatorPending, 0n);
	assert.equal(r.originalFaucetOutcomeResolved, false);
	assert.equal(r.safeToRetryFaucet, false);
	assert.equal(r.canBroadcast, false);
	assert.equal(r.financialReady, false);
});
test("pending cursors are not spendable balance; exact source and a complete claim remain necessary", () => {
	const r = fundingDecision(
		[{ sender: 1, sent: 9007199254740997n, claimed: 1n }],
		0n,
	);
	assert.equal(r.knownOperatorPending, 9007199254740996n);
	assert.equal(r.observedBalance, 0n);
	assert.equal(
		r.next,
		"verify-exact-source-and-complete-claim-before-spending",
	);
	assert.equal(r.financialReady, false);
	assert.equal(r.safeToRetryFaucet, false);
});
test("an observed balance still requires fresh funded execution gates", () => {
	const r = fundingDecision(
		[{ sender: 1, sent: 7n, claimed: 7n }],
		20000000000n,
	);
	assert.equal(r.next, "fresh-funded-execution-preflight-required");
	assert.equal(r.originalFaucetOutcomeResolved, false);
	assert.equal(r.canBroadcast, false);
});
test("reject underflow, noncanonical fields, duplicate senders, wrong amounts and invalid identities", () => {
	for (const grants of [
		[],
		[{ sender: 1, sent: 1n, claimed: 2n }],
		[{ sender: 1, sent: 0xffffffff00000001n, claimed: 0n }],
		[{ sender: 1, sent: 1, claimed: 0n }],
		[{ sender: 223232, sent: 1n, claimed: 0n }],
		[
			{ sender: 1, sent: 1n, claimed: 0n },
			{ sender: 1, sent: 1n, claimed: 0n },
		],
	])
		assert.throws(() => fundingDecision(grants, 0n));
	assert.throws(() =>
		fundingDecision([{ sender: 1, sent: 1n, claimed: 0n }], -1n),
	);
	assert.equal(
		fundingDecision([{ sender: 1, sent: 0xffffffff00000000n, claimed: 0n }], 0n)
			.knownOperatorPending,
		0xffffffff00000000n,
	);
});
test("modified original request fails before RPC, retains original lock, and cannot reuse an output directory", async () => {
	const base = await mkdtemp(join(tmpdir(), "psy-faucet-reconcile-"));
	try {
		const original = join(base, "original"),
			out = join(base, "out");
		await mkdir(original);
		for (const name of [
			"faucet-request-v1.json",
			"faucet-broadcast-intent-v1.json",
			"faucet-send-once-v1.lock",
		])
			await writeFile(join(original, name), "{}");
		let calls = 0;
		const options = {
			fetcher: async () => {
				calls++;
				throw Error("Unexpected network");
			},
		};
		await assert.rejects(
			reconcileFaucetFunding(out, original, base, options),
			/Original request changed/,
		);
		assert.equal(calls, 0);
		const r = JSON.parse(await readFile(join(out, "SUMMARY.json")));
		assert.equal(r.complete, false);
		assert.equal(r.safeToRetryFaucet, false);
		assert.equal(
			await readFile(join(original, "faucet-send-once-v1.lock"), "utf8"),
			"{}",
		);
		await assert.rejects(
			reconcileFaucetFunding(out, original, base, options),
			/EEXIST/,
		);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});
test("the complete acquisition makes only exact one-attempt reads and retains every cursor", async () =>
	scenario(async (s) => {
		const r = await reconcileFaucetFunding(
			join(s.base, "out"),
			s.original,
			s.capture,
			s,
		);
		assert.equal(s.calls.length, 203);
		assert.equal(r.grants.length, 100);
		assert.equal(r.complete, true);
		assert.equal(r.safeToRetryFaucet, false);
		assert.ok(
			s.calls.every(
				(c) => c.method.startsWith("psy_get_") && c.redirect === "manual",
			),
		);
		const cursors = s.calls.filter(
			(c) => c.method === "psy_get_user_contract_state_tree_leaf_hash",
		);
		assert.ok(
			cursors.every(
				(c) => c.params.checkpoint_id === 123 && c.params.contract_id === 0,
			),
		);
		// Consecutive sender IDs can occupy different limbs of the same recipient
		// leaf. Distinct cursor slots need not imply distinct leaf RPC arguments.
		assert.equal(cursors.length, 200);
		assert.equal(
			new Set(cursors.map((c) => `${c.params.user_id}:${c.params.leaf_id}`))
				.size,
			151,
		);
	}));
test("wrong chain and Native layout are rejected before any additional read", async () => {
	for (const mutation of [
		(s) => {
			s.summary.chainRootAt1 = "f".repeat(64);
		},
		(s) => {
			s.summary.nativeLeaf.state_layout_slot_count--;
		},
	])
		await scenario(async (s) => {
			await assert.rejects(
				reconcileFaucetFunding(join(s.base, "out"), s.original, s.capture, s),
			);
			assert.equal(s.calls.length, 0);
		}, mutation);
});
test("changed operator inventory cannot silently exclude original possible senders", async () =>
	scenario(
		async (s) => {
			await assert.rejects(
				reconcileFaucetFunding(join(s.base, "out"), s.original, s.capture, s),
				/inventory changed/,
			);
			assert.equal(s.calls.length, 1);
		},
		(s) => {
			s.config.operator_user_ids[99] = 101;
		},
	));
test("a failed cursor read is retained, stops scheduling and cannot become a zero funding result", async () =>
	scenario(async (s) => {
		const fetcher = async (endpoint, options) => {
			const q = JSON.parse(options.body);
			if (q.method === "psy_get_user_contract_state_tree_leaf_hash")
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: q.id,
						error: { code: -32001, message: "missing" },
					}),
				);
			return s.fetcher(endpoint, options);
		};
		const out = join(s.base, "out");
		await assert.rejects(
			reconcileFaucetFunding(out, s.original, s.capture, { fetcher }),
			/Read RPC error/,
		);
		const result = JSON.parse(await readFile(join(out, "SUMMARY.json")));
		assert.equal(result.complete, false);
		assert.equal(result.safeToRetryFaucet, false);
		assert.ok(result.requests <= 7);
		assert.ok(!Object.hasOwn(result, "knownOperatorPending"));
	}));
