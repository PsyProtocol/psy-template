// Reproduce the wallet's reviewed application module bundle; no SDK mutation.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import {nativeManifestPath} from "../nativeProtocol.mjs";
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
collect(resolve(root, "market-client/wallet/native/ownedLoader.mjs"));
collect(resolve(root, "market-client/wallet/approvalPolicy.mjs"));
paths.add(resolve(root, "market-client/wallet/approvalPolicy.d.mts"));
paths.add(resolve(root, "market-client/wallet/prepareService.d.mts"));
paths.add(resolve(root, "market-client/wallet/native/ownedLoader.d.mts"));
paths.add(resolve(root, "market-client/protocol.d.mts"));
paths.add(resolve(root, "market-client/rpcWire.d.mts"));
paths.add(resolve(root, "token/wide/arithmetic.d.mts"));
// Optional reviewed-directory pair is explicit; no search or protocol fallback.
if(Boolean(process.argv[3])!==Boolean(process.argv[4])||process.argv.length>5)
  throw Error("Supply both reviewed market and AMM directories or neither");
function readReviewed(input){
 const dir=realpathSync(resolve(root,input)),allowed=realpathSync(resolve(root,"market-client/reviewed"));
 if(!dir.startsWith(allowed+"/"))throw Error("Reviewed input must remain inside the application review directory");
 const registry=JSON.parse(readFileSync(resolve(dir,"registry.json"))),abis={};
 nativeManifestPath(registry);
 const registryHash=sha(canonical(registry));
 if(JSON.parse(readFileSync(resolve(dir,"client-pin.json"))).registrySha256!==registryHash)
  throw Error("Reviewed registry pin changed");
 function abi(name,expected){const raw=readFileSync(resolve(dir,name));if(sha(raw)!==expected)throw Error("Reviewed ABI changed: "+name);return JSON.parse(raw);}
 for(const m of registry.markets){
  abis[m.marketId]=abi(m.marketId+"-abi.json",m.abiSha256);
  for(const a of m.assets)abis[a.contractId]=abi(`${m.marketId}-asset-${a.contractId}-abi.json`,a.abiSha256);
  if(m.nftId)abis[m.nftId]=abi(m.marketId+"-nft-abi.json",m.nftAbiSha256);
 }
 const configBytes=readFileSync(resolve(dir,"rpc-config.json"));
 if(sha(configBytes)!==registry.network.rpcConfigSha256)throw Error("Reviewed RPC configuration changed");
 const config=JSON.parse(configBytes);
 return {registry,registryHash,abis,networkConfig:config.networks[registry.network.name]};
}
const bundle=readReviewed(process.argv[3]??"market-client/reviewed/mainnet-beta-markets-20261027-v3");
bundle.amm=readReviewed(process.argv[4]??"market-client/reviewed/mainnet-beta-amm-20261027-v2");
if(canonical(bundle.amm.networkConfig)!==canonical(bundle.networkConfig)||canonical(bundle.amm.registry.network)!==canonical(bundle.registry.network))
 throw Error("Reviewed wallet bundles use different network/chain domains");
const registry=bundle.registry;
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
