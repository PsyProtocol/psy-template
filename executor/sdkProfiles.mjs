// Explicit source releases; a network name or moving branch cannot select one.
import assert from 'node:assert/strict';
const releases=Object.freeze({
 'mainnet-beta-20261027-v1':Object.freeze({sdkCommit:'c92880c8b6e2c8d392f19368bc8801a2584fd427',clientCommit:'b280d714a8f0930c61962c885374ea63ea63d274',resource:'mainnet-beta-endcap-c92880c8.json',requiresDriverIdentity:false}),
 'sdk-audit-20261102-v1':Object.freeze({sdkCommit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',clientCommit:'7058070057c3242b5d8b29e1a31d498aaa4202c0',resource:'audit-endcap-01b8f2b0.json',requiresDriverIdentity:true}),
});
export function sdkRelease(profile){const r=releases[profile];assert.ok(r,'Explicit reviewed SDK profile required');return r;}
export function sdkReleaseForCommit(commit){const row=Object.entries(releases).find(([,r])=>r.sdkCommit===commit);assert.ok(row,'Explicit reviewed SDK commit required');return{profile:row[0],...row[1]};}
export function assertDriverSdkIdentity(identity,profile){const r=sdkRelease(profile);if(r.requiresDriverIdentity||identity.sdkCommit!==undefined){assert.equal(identity.sdkCommit,r.sdkCommit,'native driver SDK release differs');assert.equal(identity.clientCommit,r.clientCommit,'native driver client release differs');assert.equal(identity.sdkProfile,profile,'native driver SDK profile differs');}}
