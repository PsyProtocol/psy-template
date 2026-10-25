import test from 'node:test';import assert from 'node:assert/strict';import {compactExactJson,userEndCapWire} from './exactJsonWire.mjs';import {parseLosslessJson} from '../amm/u124/client.mjs';
test('wire compaction preserves U124 literals, quoted whitespace, escaped quotes and UTF-8',()=>{
 const source=' { "amount": 21267647932558653966460912964485513215, "s": "中文 \\" keep  space\\n", "b": "a\\\\b", "n": [1, 2] }\n';
 const raw=Buffer.from(source),out=compactExactJson(raw);assert.ok(out.length<raw.length);assert.ok(out.includes(Buffer.from('21267647932558653966460912964485513215')));assert.deepEqual(parseLosslessJson(out.toString()),parseLosslessJson(source));assert.deepEqual(parseLosslessJson(userEndCapWire(raw).toString()).params,parseLosslessJson(source));
});
test('invalid JSON or UTF-8 cannot be converted into an apparently valid request',()=>{for(const s of ['{"a":1 2}','{"s":"unfinished}','{"a":1,}',Buffer.from([0x22,0xff,0x22])])assert.throws(()=>compactExactJson(s));});
