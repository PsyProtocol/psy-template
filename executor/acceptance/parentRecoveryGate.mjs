// Prevent another financial cohort from contaminating the still-open interval.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
export function closedParent(prepare) {
 assert.equal(prepare.version,1);assert.equal(prepare.admissionMode,'all-four-v1');
 const file=join(prepare.parentCase,'public/maximum-partial-cancel-refund-complete-v1.json');
 const bytes=readFileSync(file),r=parseLosslessJson(bytes.toString('utf8'));
 assert.equal(r.allOriginalFtNftAndNativePrincipalReturned,true,'parent principal interval remains open');
 assert.equal(r.ordinaryClaimsIncluded,true,'parent ordinary claims remain open');
 assert.equal(r.maximumCapacityPassed,false,'recovery must not be relabelled maximum acceptance');
 const before=BigInt(r.nativeBefore),after=BigInt(r.nativeAfter),fees=BigInt(r.fees);assert.ok(before>=after&&after>=0n&&fees>=0n,'nonnegative parent fee accounting');assert.equal(before-after,fees,'parent fee conservation');
 return {file,sha256:createHash('sha256').update(bytes).digest('hex'),completedAt:r.completedAt,scope:'parent failed-intake principal/claim interval closed; not maximum or production acceptance'};
}
