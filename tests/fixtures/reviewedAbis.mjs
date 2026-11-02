// Unit-only projections from the preserved historical archives. These are not
// bytecode, authenticated state, deployment identities or full UPS evidence.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export function readReviewedAbis() {
  const raw = readFileSync(new URL('./reviewed-abis.json', import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),
    '0a72c78a58d8c591b073636d153c2b6e4ce3f685312b026427e99cd8c427ec0a',
    'Reviewed unit ABI/config fixture changed');
  const fixture = JSON.parse(raw);
  assert.equal(fixture.schema, 1);
  return fixture;
}
