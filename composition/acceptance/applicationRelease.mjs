// Explicit case-local application rebuild, never an SDK migration. Original
// release files/binaries remain immutable; select this pin for NEW operations.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{join}from'node:path';import{sha256}from'../../executor/requestBinding.mjs';import{COMPOSITION_SDK}from'../contract/runtimePolicy.mjs';
export function ordinaryRelease(base,previous){const release=JSON.parse(readFileSync(join(base,'public/QA-ORDINARY-RELEASE-v3.json'),'utf8'));assert.equal(release.schema,1);assert.equal(release.sdkManifestSha256,COMPOSITION_SDK);assert.equal(release.previousSha256,previous.sha256);assert.equal(sha256(readFileSync(release.file)),release.sha256,'reviewed QA ordinary application changed');return release;}
