// Artifact bytes, including Goldilocks literals, must never pass through the
// native JSON number serializer. Parse an ABI for bounded metadata separately.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function copyCompiledArtifact(source,destination,expectedSha256){
 assert.match(expectedSha256,/^[0-9a-f]{64}$/);const bytes=readFileSync(source);
 assert.equal(sha(bytes),expectedSha256,'source artifact differs from reviewed bytes');
 const a=parseLosslessJson(bytes.toString('utf8'));assert.ok(a.abi?.contract&&Array.isArray(a.circuit_definitions),'complete compiled artifact required');
 writeFileSync(destination,bytes,{flag:'wx'});assert.equal(sha(readFileSync(destination)),expectedSha256);
 // This bounded ABI view is never serialized back as an artifact.
 const abi=JSON.parse(bytes.toString('utf8')).abi;
 for(const m of abi.contract.methods){assert.ok(Number.isSafeInteger(m.method_id)&&m.method_id>=0&&m.method_id<2**32);assert.ok(Number.isSafeInteger(m.input_felt_count)&&m.input_felt_count>=0&&m.input_felt_count<=128);}
 return{sha256:expectedSha256,abi};
}
