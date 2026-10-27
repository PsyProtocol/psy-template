// Extension-owned integration. A web request may supply a reviewed record, never
// a prover, verifier report, persistence adapter or broadcast implementation.
import { createBrowserWalletLock } from "./lockCoordinator.mjs";
import { createMarketActionClient } from "../marketActionClient.mjs";
import { canonical, digest, exactFields } from "../protocol.mjs";
import { createStagedWallet } from "./staged.mjs";
import { buildAmmPlan } from "../ammPlan.mjs";
import { createExactMarketTransport } from "./exactTransport.mjs";
import { createNativeMarketBackend } from "./nativeBackend.mjs";
import { prepareMarketCapsule } from "./capsule.mjs";
function createMarketService({
  store,
  bundle,
  provider,
  prepareTrace,
  parse,
  stringify,
}, nativeOptions) {
  if(bundle.amm&&canonical(bundle.amm.networkConfig)!==canonical(bundle.networkConfig))throw Error("AMM and market bundles must share the exact network domain");
  const exactTransport=nativeOptions?createExactMarketTransport({bundle,parse,fetcher:nativeOptions.fetcher}):null;
  const selectBundle=(record)=>{
    if(record.registryHash===bundle.registryHash)return bundle;
    if(bundle.amm&&record.registryHash===bundle.amm.registryHash)return bundle.amm;
    throw Error("Unsigned record belongs to another reviewed registry");
  };
  const verifyRecord=async(record,fresh)=>{
    const selected=selectBundle(record),now=fresh?Date.now():record.snapshot.observedAt;
    if(selected.registry.markets.some(m=>m.marketId===record.plan.marketId&&m.kind==="amm")){
      exactFields(record,["schema","request","snapshot","plan","registryHash","recordId"]);
      if(await digest(selected.registry)!==selected.registryHash)throw Error("AMM registry changed");
      const plan=buildAmmPlan(record.snapshot,record.request,selected.registry,{now,registryHash:selected.registryHash});
      const original={schema:1,request:record.request,snapshot:record.snapshot,plan:record.plan};
      if(record.schema!==1||canonical(plan)!==canonical(record.plan)||await digest(original)!==record.recordId)throw Error("AMM approved record changed");
      return record;
    }
    return createMarketActionClient({...selected,now:()=>now}).validate(record);
  };
  const backends=new Map();
  const nativeFor=record=>{
    const selected=selectBundle(record);
    if(!backends.has(selected.registryHash))backends.set(selected.registryHash,createNativeMarketBackend({...nativeOptions,bundle:selected,parse,stringify}));
    return backends.get(selected.registryHash);
  };
  const unavailable = async () => {
    throw Error(
      "Reviewed native full-call/session verifier and exact transport are not connected; market broadcast disabled",
    );
  };
  const service = createStagedWallet({
    store,
    // Preparation/cancellation and writes share the browser authority whenever
    // available; a legacy prepare-only instance cannot overwrite a live intent.
    exclusive: nativeOptions?.exclusive ?? (typeof globalThis.navigator?.locks?.request === "function" ? createBrowserWalletLock() : undefined),
    ...(nativeOptions ? {confirmBroadcast: nativeOptions.confirmBroadcast} : {}),
    // Historical reconstruction is separate from live state freshness. Proofs
    // take longer than the UI snapshot TTL. Never use this immutable-record
    // check as the fresh native pre-broadcast identity/state/nonce gate.
    verifyRecord: (r) => verifyRecord(r,false),
    backend: {
      prepareOnly: async (r) => {
        // Filled only by the authoritative background wrapper below. No page can
        // replace it and the service never runs preparations concurrently.
        const c = activeContext;
        if (!c) throw Error("Wallet-owned preparation context missing");
        const market = selectBundle(r).registry.markets.find(
          (m) => m.marketId === r.plan.marketId,
        );
        const envelope = await prepareTrace(r, c);
        return prepareMarketCapsule({
          record: r,
          context: c,
          provider,
          envelope,
          parse,
          stringify,
          dependencies: market.dependencies,
          ...(nativeOptions ? {publicVerifier:{identify:request=>nativeFor(r).identifyForPreparation(r,[...r.plan.calls,{contract_id:"0",method_name:"burn",inputs:[]}],request)}} : {}),
        });
      },
      verifyPrepared: nativeOptions ? (r,p)=>nativeFor(r).verifyPrepared(r,p) : unavailable,
      recheck: nativeOptions ? (r,p)=>nativeFor(r).recheck(r,p) : unavailable,
      broadcastExact: nativeOptions ? exactTransport.broadcastExact : unavailable,
      reconcile: nativeOptions ? p=>nativeFor({registryHash:p.registryHash}).reconcile(p) : unavailable,
    },
  });
  let activeContext,
    tail = Promise.resolve();
  return {
    capabilities: () => ({
      schema: 1,
      prepareOnly: !nativeOptions,
      broadcast: Boolean(nativeOptions),
      nativeFullCallVerifier: Boolean(nativeOptions),
      financialAuthorization: false,
      registryHash: bundle.registryHash,
      requiredSdkManifestSha256: bundle.registry.sdkManifestSha256,
      boundary:
        nativeOptions ? "Extension-owned complete verification and exact transport; separate wallet confirmation required; no page write route enabled by this factory" : "Internal prepare-only integration; no web write capability or SDK attestation",
    }),
    async prepare(context, record) {
      const c = structuredClone(context),
        r = structuredClone(record);
      const task = tail
        .catch(() => {})
        .then(async () => {
          await verifyRecord(r,true); // Fresh observation required before a new trace.
          activeContext = c;
          try {
            return await service.prepare(c, r);
          } finally {
            activeContext = undefined;
          }
        });
      tail = task;
      return task;
    },
    ...(nativeOptions ? {
      verify:service.verify,
      broadcast:service.broadcast,
      reconcile:service.reconcile,
    } : {}),
    list: service.list,
    cancelPreparation: service.cancelPreparation,
    async contextFor(identity) {
      return {
        ...structuredClone(identity),
        networkHash: await digest(bundle.registry.network),
      };
    },
    async assertNoPending(account, chainKey) {
      return service.assertNoPending({
        account,
        chainKey,
        networkHash: await digest(bundle.registry.network),
      });
    },
    async assertNetwork(config) {
      const expected = bundle.networkConfig;
      const domain = (c) => ({
        magic: String(BigInt(c.magic)),
        users_per_realm: c.users_per_realm,
        realm_configs: c.realm_configs.map((r) => ({
          id: r.id,
          rpc_url: r.rpc_url,
        })),
        coordinator_configs: c.coordinator_configs.map((r) => ({
          id: r.id,
          rpc_url: r.rpc_url,
        })),
        api_services_url: c.api_services_url,
      });
      if (canonical(domain(config)) !== canonical(domain(expected)))
        throw Error(
          "Market wallet network domain/endpoints differ from reviewed configuration",
        );
    },
  };
}

export function createPrepareOnlyMarketService(options){return createMarketService(options,null);}
export function createMarketWalletService(options){
 const {native,expectedVerifierPackSha256,fetcher,confirmBroadcast}=options;
 if(typeof confirmBroadcast!=="function"||!/^[0-9a-f]{64}$/.test(expectedVerifierPackSha256??"")||!["identity","verify","identify"].every(k=>typeof native?.[k]==="function"))throw Error("Extension-owned native verifier and build identity required");
 const exclusive=createBrowserWalletLock();
 return createMarketService(options,{native,expectedVerifierPackSha256,fetcher,confirmBroadcast,exclusive});
}
