// Synthetic rendered-component regression in an isolated same-origin frame.
// It does not use, unlock, replace or approve the actual extension provider.
const task = await taskSpace(24);
const page = task.page("p1");
await page.evaluate(() => {
  const frame = document.createElement("iframe");
  frame.id = "psy-component-qa";
  frame.title = "Synthetic component regression, no wallet execution";
  const origin = location.origin;
  frame.srcdoc = `<!doctype html><html><head><base href="${origin}/"></head><body>
    <h1>Synthetic UI regression — not wallet acceptance</h1><div id="fixture"></div>
    <script type="module">
    import RefreshRuntime from '${origin}/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    try {
      const [{createElement}, {createRoot}, {WalletExecution}, {WalletActivity}] = await Promise.all([
        import('${origin}/node_modules/.vite/deps/react.js'),
        import('${origin}/node_modules/.vite/deps/react-dom_client.js'),
        import('${origin}/src/markets/WalletExecution.tsx'),
        import('${origin}/src/markets/WalletActivity.tsx')]);
      const fixture = document.getElementById('fixture');
      const root = createRoot(fixture);
      const hash = x => x.repeat(64);
      const record = {recordId:hash('1'),registryHash:hash('2'),plan:{kind:'swap',marketId:1000,network:{chainRootAt1:hash('3')}}};
      const entry = {schema:1,recordId:record.recordId,intentId:hash('4'),preparedHash:hash('5'),requestSha256:hash('6'),endUserLeafHash:hash('7'),contentHash:hash('8'),phase:'unresolved',actualFee:'1000001',confirmedCheckpoint:null};
      const calls = [];
      let resolveCapabilities;
      let wait = new Promise(resolve => { resolveCapabilities = resolve; });
      const caps = {prepareOnly:false,broadcast:true,nativeFullCallVerifier:true,registryHashes:[record.registryHash],enabledMarketIds:[1000],chainRootAt1:record.plan.network.chainRootAt1};
      window.psy = {request: async q => {
        calls.push(q);
        if(q.method==='psy_getMarketWriteCapabilities') return wait;
        if(q.method==='psy_listMarketPreparations') return [entry];
        if(q.method==='psy_reconcileMarketPreparation') throw Error('Synthetic lost receipt response');
        throw Error('No preparation or broadcast allowed in this fixture');
      }};
      const until = async fn => {
        const deadline = performance.now()+5000;
        while(!fn()) {
          if(performance.now()>deadline) throw Error('Component regression timeout');
          await new Promise(resolve=>setTimeout(resolve,10));
        }
      };
      const click = text => {
        const button = [...fixture.querySelectorAll('button')].find(x=>x.textContent.includes(text));
        if(!button || button.disabled) throw Error('Expected available control: '+text);
        button.click();
      };
      root.render(createElement(WalletExecution,{account:hash('a'),record}));
      await until(()=>fixture.querySelector('button'));
      click('Check wallet and original history');
      await until(()=>calls.length===1);
      root.render(createElement(WalletExecution,{account:hash('b'),record}));
      await until(()=>!fixture.querySelector('button').disabled);
      resolveCapabilities(caps);
      await until(()=>calls.some(q=>q.method==='psy_listMarketPreparations'));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const accountRaceRejected = !fixture.textContent.includes(entry.intentId) && !fixture.textContent.includes('Broadcast intent saved') && !fixture.textContent.includes('Reviewed wallet execution is available');
      if(!accountRaceRejected) throw Error('Old account result reached new scope');
      wait = Promise.resolve(caps);
      click('Check wallet and original history');
      await until(()=>fixture.textContent.includes(entry.intentId));
      const nextRecord = {...record,recordId:hash('9')};
      root.render(createElement(WalletExecution,{account:hash('b'),record:nextRecord}));
      await until(()=>!fixture.textContent.includes(entry.intentId));
      const recordRaceRejected = !fixture.textContent.includes('Reviewed wallet execution is available');
      root.render(createElement(WalletActivity,{account:hash('a')}));
      await until(()=>fixture.textContent.includes('Transactions & recovery'));
      click('Read original wallet history');
      await until(()=>fixture.textContent.includes('Check original receipt'));
      click('Check original receipt');
      await until(()=>fixture.textContent.includes('Synthetic lost receipt response'));
      const originalRetained = fixture.textContent.includes(entry.intentId) && fixture.textContent.includes('Previous wallet observation retained');
      const recoveryDisabledAfterFailure = [...fixture.querySelectorAll('button')].find(x=>x.textContent.includes('Check original receipt')).disabled;
      const forbiddenCalls = calls.filter(q=>/broadcast|sendTransaction|prepareMarketTransaction|cancelMarketPreparation/.test(q.method)).length;
      const result = {schema:1,scope:'Synthetic browser component regression, not extension or chain acceptance',accountRaceRejected,recordRaceRejected,originalRetained,recoveryDisabledAfterFailure,forbiddenCalls,financialOperations:0};
      if(!accountRaceRejected || !recordRaceRejected || !originalRetained || !recoveryDisabledAfterFailure || forbiddenCalls) throw Error('Component regression failed');
      root.unmount();
      window.__qaResult = result;
    } catch(e) { window.__qaResult = {error:String(e),financialOperations:0}; }
    </script></body></html>`;
  document.body.appendChild(frame);
});
await page.waitForFunction(() => document.getElementById("psy-component-qa")?.contentWindow?.__qaResult, undefined, { timeout: 15000 });
const result = await page.evaluate(() => {
  const frame = document.getElementById("psy-component-qa");
  const result = frame.contentWindow.__qaResult;
  frame.remove();
  return result;
});
const fs = await import("node:fs/promises");
await fs.writeFile("/Users/geir/Downloads/QED资料/litepaper/psy-market-recovery-20261023/product-intent-20261030-v1/public/component-race-result.json", JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(result);
if (result.error) throw Error(result.error);
