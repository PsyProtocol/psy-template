// Reproduce the wallet's reviewed application module bundle; no SDK mutation.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { canonical } from "../protocol.mjs";
const root = resolve(import.meta.dirname, "../.."),
  dest = resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw Error(
    "Explicit fresh wallet src/market-preparation directory required",
  );
if (existsSync(dest)) throw Error("Fresh wallet module output required");
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  paths = new Set();
function collect(p) {
  if (paths.has(p)) return;
  if (!p.startsWith(root + "/")) throw Error("Outside application source");
  paths.add(p);
  const s = readFileSync(p, "utf8");
  for (const m of s.matchAll(/from\s+["'](\.[^"']+)["']/g))
    collect(resolve(dirname(p), m[1]));
}
collect(resolve(root, "market-client/wallet/prepareService.mjs"));
paths.add(resolve(root, "market-client/wallet/prepareService.d.mts"));
const dir = resolve(
  root,
  "market-client/reviewed/mainnet-beta-markets-20261027-v3",
);
const registry = JSON.parse(readFileSync(resolve(dir, "registry.json"))),
  abis = {};
for (const m of registry.markets) {
  abis[m.marketId] = JSON.parse(
    readFileSync(resolve(dir, m.marketId + "-abi.json")),
  );
  for (const a of m.assets)
    abis[a.contractId] = JSON.parse(
      readFileSync(
        resolve(dir, `${m.marketId}-asset-${a.contractId}-abi.json`),
      ),
    );
  if (m.nftId)
    abis[m.nftId] = JSON.parse(
      readFileSync(resolve(dir, m.marketId + "-nft-abi.json")),
    );
}
const net = JSON.parse(
  readFileSync(
    resolve(
      root,
      "market-client/reviewed/mainnet-beta-markets-20261027-v3/rpc-config.json",
    ),
  ),
);
const bundle = {
  registry,
  registryHash: sha(canonical(registry)),
  abis,
  networkConfig: net.networks[registry.network.name],
};
mkdirSync(dest, { recursive: true });
const entries = [];
for (const p of [...paths].sort()) {
  const name = relative(root, p),
    bytes = readFileSync(p),
    target = resolve(dest, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  entries.push({ file: name, sha256: sha(bytes) });
}
const bytes = JSON.stringify(bundle, null, 2) + "\n";
writeFileSync(resolve(dest, "bundle.json"), bytes);
writeFileSync(
  resolve(dest, "SOURCE.json"),
  JSON.stringify(
    {
      schema: 1,
      scope:
        "Application-only prepare integration; not SDK attestation or enabled broadcast",
      bundleSha256: sha(bytes),
      requiredSdkManifestSha256: registry.sdkManifestSha256,
      files: entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    files: entries.length,
    bundleSha256: sha(bytes),
    financialBroadcast: false,
  }),
);
