// RPC status is not permission to write, a receipt or SDK/key attestation.
import {
  canonical,
  hashPattern,
  requireThat as ok,
  exactFields,
} from "./protocol.mjs";
const states = new Set([
  "rpc-unavailable",
  "identity-rejected",
  "protocol-incompatible",
  "deployment-required",
  "registry-matches",
]);
export function validateReadiness(
  value,
  registry,
  registryHash,
  now = Date.now(),
) {
  exactFields(value, [
    "schema",
    "registryHash",
    "network",
    "observedAt",
    "assurance",
    "financialAuthorization",
    "financialSubmission",
    "state",
    "checkpoint",
    "chainRoot",
    "nativeCodeRoot",
    "nativeFunctionRoot",
    "nativeSchemaCompatible",
    "nativeRootMatchesRegistry",
    "checkedDependencies",
    "issues",
  ]);
  ok(
    value.schema === 1 &&
      value.registryHash === registryHash &&
      canonical(value.network) === canonical(registry.network),
    "Network status identity changed",
  );
  ok(
    value.assurance === "rpc-observed" &&
      value.financialAuthorization === false &&
      value.financialSubmission === false,
    "Readonly diagnostic cannot grant financial authorization",
  );
  ok(
    Number.isSafeInteger(value.observedAt) &&
      now >= value.observedAt &&
      now - value.observedAt <= 30000 &&
      states.has(value.state),
    "Network diagnostic expired or invalid",
  );
  ok(
    Array.isArray(value.issues) &&
      value.issues.length <= 4 &&
      value.issues.every((x) => typeof x === "string" && x.length <= 300),
    "Bounded diagnostic issues required",
  );
  ok(
    Number.isSafeInteger(value.checkedDependencies) &&
      value.checkedDependencies >= 0 &&
      value.checkedDependencies <= 32,
    "Bounded dependency count required",
  );
  for (const key of ["chainRoot", "nativeCodeRoot", "nativeFunctionRoot"])
    ok(
      value[key] === null || hashPattern.test(value[key]),
      "Invalid observed identity",
    );
  for (const key of ["nativeSchemaCompatible", "nativeRootMatchesRegistry"])
    ok(
      value[key] === null || typeof value[key] === "boolean",
      "Invalid protocol status",
    );
  ok(
    value.checkpoint === null ||
      (Number.isSafeInteger(value.checkpoint) &&
        value.checkpoint > 0 &&
        value.checkpoint < 4294967296),
    "Invalid diagnostic checkpoint",
  );
  if (value.state === "registry-matches")
    ok(
      value.chainRoot &&
        value.checkpoint &&
        value.nativeSchemaCompatible === true &&
        value.nativeRootMatchesRegistry === true,
      "Unverified deployment marked matched",
    );
  if (value.state === "protocol-incompatible")
    ok(
      value.chainRoot &&
        value.checkpoint &&
        (value.nativeSchemaCompatible === false ||
          value.nativeRootMatchesRegistry === false),
      "Missing protocol incompatibility evidence",
    );
  return structuredClone(value);
}
export function readinessPresentation(state) {
  return (
    {
      "rpc-unavailable": [
        "RPC unavailable",
        "Try checking the connection again. Live trading remains disabled.",
      ],
      "identity-rejected": [
        "Identity verification incomplete",
        "The current network or deployment could not be validated. Live trading remains disabled.",
      ],
      "protocol-incompatible": [
        "Wallet compatibility update required",
        "RPC is online, but this chain differs from the reviewed wallet and deployment. Live balances, quotes and trading remain unavailable.",
      ],
      "deployment-required": [
        "Accepted deployment required",
        "RPC is online. Rebind markets only after a new isolated deployment passes acceptance.",
      ],
      "registry-matches": [
        "Public deployment identities match",
        "Wallet approvals and full transaction verification are still required. Trading remains disabled.",
      ],
    }[state] ?? [
      "Connection not checked",
      "Check the configured testnet connection.",
    ]
  );
}
