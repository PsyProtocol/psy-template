export interface Readiness {
  schema: 1;
  registryHash: string;
  network: Record<string, unknown>;
  observedAt: number;
  assurance: "rpc-observed";
  financialAuthorization: false;
  financialSubmission: false;
  state: string;
  checkpoint: number | null;
  chainRoot: string | null;
  nativeCodeRoot: string | null;
  nativeFunctionRoot: string | null;
  nativeSchemaCompatible: boolean | null;
  nativeRootMatchesRegistry: boolean | null;
  checkedDependencies: number;
  issues: string[];
}
export function validateReadiness(
  value: unknown,
  registry: { network: unknown },
  registryHash: string,
  now?: number,
): Readiness;
export function readinessPresentation(state?: string): string[];
