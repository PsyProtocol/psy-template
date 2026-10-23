// A retired QA case stays inert even if an old request is included later.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
export function assertCaseActive(base){assert.ok(!existsSync(join(base,'public/QUARANTINED-v1.json')),'quarantined QA case: read-only reconciliation only; no deployment, issuance, funding or registration');}
