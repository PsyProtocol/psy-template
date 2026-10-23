// Immutable case-local generation selection; original controller evidence stays.
import assert from'node:assert/strict';import{existsSync,readFileSync}from'node:fs';import{join}from'node:path';
export function controllerDirectory(base){const file=join(base,'public/CONTROLLER-GENERATION-v1.json');if(!existsSync(file))return join(base,'controllers');const r=JSON.parse(readFileSync(file,'utf8'));assert.equal(r.schema,1);assert.equal(r.directory,'controllers-initialized-v1');assert.equal(r.priorDirectory,'controllers');return join(base,r.directory);}
