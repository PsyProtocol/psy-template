export interface OwnedMarketWasmModule {
 default(options: {module_or_path: WebAssembly.Module}): Promise<unknown>;
 verifier_identity(): string;
 project_market_identity(request: string): string;
 verify_market_prepared(request: string, approval: string, bundle: string): string;
 get_owned_wasm_module(): WebAssembly.Module | undefined;
}
export interface MarketVerifierReleasePin {
 sdkManifestSha256: string; networkMagic: string;
 wasmSha256: string; verifierPackSha256: string;
}
export interface OwnedMarketNative {
 identity(): Promise<string>;
 identify(request: string): Promise<string>;
 verify(request: string, approval: string, bundle: string): Promise<string>;
}
export function loadOwnedMarketVerifier(options: {
 module: OwnedMarketWasmModule; wasmUrl: string;
 release: MarketVerifierReleasePin; fetcher?: typeof fetch;
}): Promise<OwnedMarketNative>;
