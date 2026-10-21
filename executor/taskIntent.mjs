import assert from 'node:assert/strict';
// Optional operator intent pin. The normal fresh scanner still determines and
// validates the action; an expected file can only restrict it, never supply it.
export function assertSameAction(actual,expected){
 assert.ok(actual&&expected,'expected action unavailable');
 const{validUntilCheckpoint:oldWindow,...a}=expected,{validUntilCheckpoint:newWindow,...b}=actual;
 assert.deepEqual(b,a,'fresh scanner changed reviewed action');
 assert.match(String(oldWindow),/^[1-9][0-9]*$/);assert.match(String(newWindow),/^[1-9][0-9]*$/);
 assert.ok(BigInt(newWindow)>=BigInt(oldWindow),'send window regressed');
}
