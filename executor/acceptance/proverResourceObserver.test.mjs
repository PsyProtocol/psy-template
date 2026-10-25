import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{sha256}from'../requestBinding.mjs';import{selectedProcesses}from'./proverResourceObserver.mjs';
test('observer includes pinned full market prover and sealed copies, rejects changed binary; no basename guessing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'prover-rss-'));try{
 const h=sha256('binary'),file=join(dir,'compact_market_wallet'),sealed=join(dir,h,'market-wallet');mkdirSync(join(dir,h));writeFileSync(file,'binary');writeFileSync(sealed,'binary');
 const tools={binaries:{compact:{file,sha256:h}}},checked=new Map(),lines=`1 2 1024 50.0 ${file}\n3 2 2048 10.0 ${sealed}\n4 2 4096 0.0 /other/isolated_wallet\n`;
 const rows=selectedProcesses(lines,tools,checked);assert.deepEqual(rows.map(r=>r.rssBytes),[1048576,2097152]);assert.equal(rows[1].binarySha256,h);
 writeFileSync(sealed,'changed binary');assert.throws(()=>selectedProcesses(lines,tools,checked),/changed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
