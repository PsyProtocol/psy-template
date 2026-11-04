import { validateCommitmentRecord, validateCallCommitments } from "./commitments.mjs";
import { publicManifest, stablePublic, shaPublic } from "./capsule.mjs";
// Projection only, never authorization. The wallet-owned native backend must
// independently reverify the exact artifacts before this can be persisted.
export async function commitmentCapsule({record,context,requestJson,verificationBundleJson,report}) {
  validateCommitmentRecord(record);
  validateCallCommitments(report.callCommitments);
  if (typeof requestJson !== "string" || typeof verificationBundleJson !== "string")
    throw Error("Exact public artifacts required");
  const p = {
    schema:3, requestJson, requestSha256:await shaPublic(requestJson),
    verificationBundleJson, verificationBundleSha256:await shaPublic(verificationBundleJson),
    userId:record.request.userId, publicKeyHash:context.account, networkHash:context.networkHash,
    registryHash:record.registryHash, sdkManifestSha256:record.plan.sdkManifestSha256,
    verifierPackSha256:record.plan.verifierPackSha256,
    startUserLeafHash:record.plan.startUserLeafHash, walletNonce:record.plan.walletNonce,
    validUntilCheckpoint:record.plan.validUntilCheckpoint,
    actualFee:report.actualFee, callCommitments:structuredClone(report.callCommitments),
    endUserLeafHash:report.endUserLeafHash, sigHash:report.sigHash,
    sessionHash:report.sessionHash, fingerprint:report.fingerprint, contentHash:report.contentHash,
  };
  return {...p,manifestSha256:await shaPublic(stablePublic(publicManifest(p)))};
}
