#!/usr/bin/env node
// Wallet stages stop for a wallet-owned integration; this CLI does not acquire
// an ordinary user's keys, inject a verifier or approve payments on their behalf.
import {continueFundedLifecycle} from './fundedLifecycle.mjs';
const [planFile,runtimeDirectory,...extra]=process.argv.slice(2);
if(!planFile||!runtimeDirectory||extra.length)throw Error('usage: node executor/fundedLifecycleRun.mjs PLAN.json PERSISTENT_RUNTIME');
const result=await continueFundedLifecycle({planFile,runtimeDirectory});
console.log(JSON.stringify(result));
if(!result.complete)process.exitCode=1;
