// Read-only reconciliation of one preserved grant. Never retries the grant or
// converts an absent indexed record into permission to send again.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLosslessJson, losslessJson } from "../../amm/u124/client.mjs";
import { decodeFeltSlot } from "../../orderbook/matcherCore.mjs";
import {
	RESET_CHAIN_ROOT,
	RESET_NATIVE_BINDING,
} from "../../market-client/nativeProtocol.mjs";

const COORDINATOR = "https://coordinator-stg.psy-protocol.xyz";
const FAUCET = "https://faucet-stg.psy-protocol.xyz";
const REALMS = [
	"https://realm0-stg.psy-protocol.xyz",
	"https://realm1-stg.psy-protocol.xyz",
];
const USER = 223232;
const PUBLIC_KEY =
	"97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834";
const ORIGINAL =
	"85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const realm = (user) => REALMS[Math.floor(user / 1048576)];
const integer = (n, max) => typeof n === "bigint" && n >= 0n && n <= max;

export function fundingDecision(grants, balance) {
	assert.ok(integer(balance, 0xffffffffffffffffn), "Invalid observed balance");
	assert.ok(Array.isArray(grants) && grants.length > 0);
	const senders = new Set();
	let pending = 0n;
	for (const g of grants) {
		assert.ok(
			Number.isSafeInteger(g.sender) &&
				g.sender > 0 &&
				g.sender < 2097152 &&
				g.sender !== USER,
		);
		assert.ok(!senders.has(g.sender), "Duplicate sender");
		senders.add(g.sender);
		assert.ok(
			integer(g.sent, 0xffffffff00000000n) &&
				integer(g.claimed, 0xffffffff00000000n),
			"Noncanonical funding cursor",
		);
		assert.ok(g.sent >= g.claimed, "Funding cursor underflow");
		pending += g.sent - g.claimed;
	}
	return {
		observedBalance: balance,
		knownOperatorPending: pending,
		next:
			pending > 0n
				? "verify-exact-source-and-complete-claim-before-spending"
				: balance > 0n
					? "fresh-funded-execution-preflight-required"
					: "await-original-request-disposition-or-independent-funding",
		// Observations cannot close an unknown service request or authorize a UPS.
		originalFaucetOutcomeResolved: false,
		safeToRetryFaucet: false,
		financialReady: false,
		canBroadcast: false,
	};
}

export async function reconcileFaucetFunding(
	directory,
	originalPublic,
	captureDirectory,
	{ fetcher = fetch } = {},
) {
	const out = resolve(directory);
	await mkdir(out, { mode: 0o700 });
	const save = (name, value) =>
		writeFile(join(out, name), losslessJson(value) + "\n", { flag: "wx" });
	let requests = 0,
		bytes = 0;
	const deadline = AbortSignal.timeout(240000);
	const original = resolve(originalPublic),
		capture = resolve(captureDirectory);
	const originalFiles = [
		"faucet-request-v1.json",
		"faucet-broadcast-intent-v1.json",
		"faucet-send-once-v1.lock",
	];
	const originalHashes = async () =>
		Object.fromEntries(
			await Promise.all(
				originalFiles.map(async (n) => [
					n,
					sha(await readFile(join(original, n))),
				]),
			),
		);
	const before = await originalHashes();
	await save("PLAN.json", {
		schema: 1,
		maximumRequests: 204,
		attemptsPerRequest: 1,
		concurrency: 4,
		checkpointSource: "existing fresh read-only capture",
		maximumBytes: 4194304,
		originalRequestSha256: ORIGINAL,
		financialOperations: 0,
		newFaucetRequests: 0,
	});
	async function read(label, endpoint, method, params) {
		assert.ok([FAUCET, COORDINATOR, ...REALMS].includes(endpoint));
		assert.ok(
			[
				"psy_get_psy_faucet_config",
				"psy_get_user_ids_for_public_key",
				"psy_get_user_registration_tree_leaf_hash",
				"psy_get_user_contract_state_tree_leaf_hash",
			].includes(method),
		);
		assert.ok(++requests <= 204, "Read budget exceeded");
		const request = { jsonrpc: "2.0", id: requests, method, params };
		await save(label + "-request.json", { endpoint, request });
		try {
			const response = await fetcher(endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(request),
				redirect: "manual",
				signal: AbortSignal.any([deadline, AbortSignal.timeout(25000)]),
			});
			const chunks = [];
			let size = 0;
			for await (const chunk of response.body) {
				size += chunk.length;
				assert.ok(
					size <= 32768 && bytes + size <= 4194304,
					"Read byte budget exceeded",
				);
				chunks.push(chunk);
			}
			const raw = Buffer.concat(chunks);
			bytes += raw.length;
			await writeFile(join(out, label + "-response.json"), raw, { flag: "wx" });
			await save(label + "-transport.json", {
				httpStatus: response.status,
				bytes: raw.length,
				sha256: sha(raw),
			});
			assert.equal(response.status, 200, "Read HTTP response rejected");
			const envelope = parseLosslessJson(raw.toString("utf8"));
			assert.equal(envelope.jsonrpc, "2.0");
			assert.equal(envelope.id, BigInt(request.id));
			assert.ok(
				!Object.hasOwn(envelope, "error") && Object.hasOwn(envelope, "result"),
				"Read RPC error",
			);
			return envelope.result;
		} catch (error) {
			await save(label + "-failure.json", {
				message: error.message,
				automaticRetry: false,
			});
			throw error;
		}
	}
	try {
		assert.equal(
			before["faucet-request-v1.json"],
			ORIGINAL,
			"Original request changed",
		);
		const request = parseLosslessJson(
			await readFile(join(original, originalFiles[0]), "utf8"),
		);
		const intent = parseLosslessJson(
			await readFile(join(original, originalFiles[1]), "utf8"),
		);
		const lock = parseLosslessJson(
			await readFile(join(original, originalFiles[2]), "utf8"),
		);
		assert.equal(request.method, "psy_claim_faucet");
		assert.equal(request.params[0].recipient_user_id, BigInt(USER));
		assert.equal(request.params[0].recipient_public_key, PUBLIC_KEY);
		assert.equal(intent.requestSha256, ORIGINAL);
		assert.equal(lock.requestSha256, ORIGINAL);
		assert.equal(intent.chainRootAt1, RESET_CHAIN_ROOT);
		const summary = parseLosslessJson(
			await readFile(join(capture, "SUMMARY.json"), "utf8"),
		);
		assert.equal(summary.complete, true);
		assert.equal(summary.chainRootAt1, RESET_CHAIN_ROOT);
		const n = summary.nativeLeaf,
			b = RESET_NATIVE_BINDING;
		assert.equal(n.deployer, 0n);
		assert.equal(n.code_root, b.contract.codeRoot);
		assert.equal(n.function_tree_root, b.functionTreeRoot);
		assert.equal(n.state_layout_root, b.contract.layoutRoot);
		assert.equal(n.state_tree_height, BigInt(b.contract.stateTreeHeight));
		assert.equal(n.state_layout_field_count, BigInt(b.layoutFieldCount));
		assert.equal(n.state_layout_slot_count, BigInt(b.layoutSlotCount));
		const checkpoint = Number(summary.checkpoint);
		assert.ok(
			Number.isSafeInteger(checkpoint) &&
				checkpoint > 0 &&
				checkpoint < 4294967296,
		);
		const user = summary.fundingUser;
		assert.equal(user.userId, BigInt(USER));
		assert.ok(
			[PUBLIC_KEY, "0".repeat(64)].includes(user.storedPublicKeyHash),
			"Recipient identity changed",
		);
		const historical = parseLosslessJson(
			JSON.parse(
				await readFile(join(original, "faucet-precheck-5.json"), "utf8"),
			).responseText,
		).result;
		const current = await read(
			"faucet-config",
			FAUCET,
			"psy_get_psy_faucet_config",
			[],
		);
		const inventory = (value) => {
			assert.ok(Array.isArray(value) && value.length === 100);
			assert.ok(
				value.every(
					(x) => integer(x, 2097151n) && x > 0n && x !== BigInt(USER),
				),
			);
			const numbers = value.map(Number).sort((a, b) => a - b);
			assert.equal(new Set(numbers).size, numbers.length);
			return numbers;
		};
		const operators = inventory(current.operator_user_ids);
		assert.deepEqual(
			operators,
			inventory(historical.operator_user_ids),
			"Faucet operator inventory changed",
		);
		assert.equal(current.faucet_contract_id, historical.faucet_contract_id);
		assert.equal(current.faucet_method_name, historical.faucet_method_name);
		assert.equal(current.amount, historical.amount);
		assert.deepEqual(
			await read(
				"recipient-index",
				COORDINATOR,
				"psy_get_user_ids_for_public_key",
				[PUBLIC_KEY, 0, 64],
			),
			[BigInt(USER)],
		);
		assert.equal(
			await read(
				"recipient-registration",
				COORDINATOR,
				"psy_get_user_registration_tree_leaf_hash",
				{ checkpoint_id: checkpoint, leaf_index: 728 },
			),
			PUBLIC_KEY,
		);
		const jobs = operators.flatMap((sender) => [
			{ sender, user: sender, slot: 3 + 2 * USER, kind: "sent" },
			{ sender, user: USER, slot: 4 + 2 * sender, kind: "claimed" },
		]);
		const rows = [];
		let at = 0,
			failure;
		await Promise.all(
			Array.from({ length: 4 }, async () => {
				while (!failure && at < jobs.length) {
					const i = at++,
						job = jobs[i];
					try {
						const leaf = await read(
							"cursor-" + i,
							realm(job.user),
							"psy_get_user_contract_state_tree_leaf_hash",
							{
								checkpoint_id: checkpoint,
								user_id: job.user,
								contract_id: 0,
								leaf_id: Math.floor(job.slot / 4),
							},
						);
						rows.push({ ...job, amount: decodeFeltSlot(leaf, job.slot) });
					} catch (error) {
						failure ??= error;
					}
				}
			}),
		);
		if (failure) throw failure;
		assert.equal(rows.length, 200, "Incomplete inventory");
		const grants = operators.map((sender) => ({
			sender,
			sent: rows.find((r) => r.sender === sender && r.kind === "sent").amount,
			claimed: rows.find((r) => r.sender === sender && r.kind === "claimed")
				.amount,
		}));
		const decision = fundingDecision(grants, BigInt(user.nativeBalance));
		assert.deepEqual(
			await originalHashes(),
			before,
			"Original identity or send lock changed",
		);
		const result = {
			schema: 1,
			complete: true,
			checkpoint,
			recipient: USER,
			publicKeyHash: PUBLIC_KEY,
			originalRequestSha256: ORIGINAL,
			originalFilesUnchanged: true,
			originalSendLockPreserved: true,
			registrationObservationMatched: true,
			registrationProofReverified: false,
			operatorCount: operators.length,
			grants,
			...decision,
			requests,
			bytes,
			financialOperations: 0,
			proofsGenerated: 0,
			newFaucetRequests: 0,
			scope:
				"RPC observations at one checkpoint across the exact 100 advertised operators; not global incoming completeness, finality or service-request disposition",
		};
		await save("SUMMARY.json", result);
		return result;
	} catch (error) {
		await save("SUMMARY.json", {
			schema: 1,
			complete: false,
			error: error.message,
			requests,
			bytes,
			financialOperations: 0,
			newFaucetRequests: 0,
			safeToRetryFaucet: false,
			financialReady: false,
		});
		throw error;
	}
}
if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	if (process.argv.length !== 5)
		throw Error(
			"Usage: reconcileFaucetFunding.mjs FRESH_DIRECTORY ORIGINAL_PUBLIC FRESH_CAPTURE",
		);
	const r = await reconcileFaucetFunding(...process.argv.slice(2));
	const { grants, ...summary } = r;
	console.log(losslessJson(summary));
}
