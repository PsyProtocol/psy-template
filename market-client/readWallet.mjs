import { canonical, requireThat as ok, id } from "./protocol.mjs";
function domain(config) {
  const name = config?.defaultNetwork,
    n = config?.networks?.[name];
  ok(n, "Wallet network metadata missing");
  const rows = (list) => {
    ok(Array.isArray(list) && list.length > 0, "Missing network endpoints");
    const out = list
      .map((r) => {
        ok(
          Number.isSafeInteger(r.id) &&
            r.id >= 0 &&
            Array.isArray(r.rpc_url) &&
            r.rpc_url.length,
          "Invalid network endpoint",
        );
        return {
          id: r.id,
          urls: r.rpc_url.map((value) => {
            const u = new URL(value);
            ok(
              u.protocol === "https:" && !u.username && !u.password && !u.hash,
              "Invalid pinned endpoint URL",
            );
            return u.href;
          }),
        };
      })
      .sort((a, b) => a.id - b.id);
    ok(
      new Set(out.map((r) => r.id)).size === out.length,
      "Duplicate realm/coordinator ID",
    );
    return out;
  };
  ok(
    Number.isSafeInteger(n.users_per_realm) && n.users_per_realm > 0,
    "Invalid realm size",
  );
  return {
    name,
    magic: String(n.magic),
    usersPerRealm: n.users_per_realm,
    realms: rows(n.realm_configs),
    coordinators: rows(n.coordinator_configs),
    services: n.api_services_url,
  };
}
export async function readWalletContext(provider, address, expectedConfig) {
  ok(
    provider &&
      typeof provider.request === "function" &&
      typeof address === "string" &&
      address.length > 0 &&
      address.length <= 512,
    "Connected provider/account required",
  );
  const [network, build, user] = await Promise.all([
    provider.request({ method: "psy_getNetworkConfig", params: [] }),
    provider.request({ method: "psy_getWalletBuildInfo", params: [] }),
    provider.request({ method: "psy_getUserId", params: [address] }),
  ]);
  ok(
    canonical(domain(network)) === canonical(domain(expectedConfig)),
    "Wallet network endpoints or domain differ from the pinned application network",
  );
  ok(
    build && typeof build.buildId === "string" && build.buildId.length <= 128,
    "Wallet build metadata unavailable",
  );
  const text = String(user);
  ok(/^[1-9]\d{0,7}$/.test(text), "Invalid wallet user ID");
  const userId = id(Number(text));
  const accounts = await provider.request({
      method: "psy_accounts",
      params: [],
    }),
    list = Array.isArray(accounts) ? accounts : accounts?.accounts;
  ok(
    Array.isArray(list) && list[0] === address,
    "Wallet account changed during identity read",
  );
  return {
    account: address,
    userId,
    networkMetadataMatches: true,
    buildId: build.buildId,
    assurance: "wallet-reported-metadata",
    sdkAttested: false,
    keyAttested: false,
    exactProofTransportAvailable: false,
    financialAuthorization: false,
  };
}
