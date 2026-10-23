// Recovery is authorized only for the reviewed application which fsyncs its
// request and broadcast intent before submitting. Empty original output is a
// pre-broadcast interruption, never evidence that an unknown send failed.
import assert from'node:assert/strict';
export const INTERRUPTIBLE_ORDINARY_SHA='483ba52494aeb182077cf295629fc8a9bc2e28ab68d55758a9ec055a2fe76a99';
export function interruptedOrdinaryGuard({binarySha256,originalFiles,sourceAlive,currentCheckpoint,validUntilCheckpoint,nonce,sent,claimed,balance,expectedBalance}){assert.equal(binarySha256,INTERRUPTIBLE_ORDINARY_SHA);assert.deepEqual(originalFiles,[],'any proof/request/intent requires exact reconciliation');assert.equal(sourceAlive,false,'original process must have stopped');assert.ok(currentCheckpoint<=validUntilCheckpoint,'cannot renew interrupted input window');assert.equal(nonce,1n,'owned QA actor must retain original post-faucet-claim nonce');assert.equal(sent,0n);assert.equal(claimed,0n);assert.equal(balance,expectedBalance);return true;}
