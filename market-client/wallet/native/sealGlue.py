"""Expose read-only instance identity in application-owned bindgen glue.

Never patches the SDK prover or an existing output. The selected native market
verifier is a separate application crate. Requires an exact original JS hash.
"""
import argparse,hashlib,json,pathlib,shutil
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--js',type=pathlib.Path,required=True);p.add_argument('--sha256',required=True);p.add_argument('--wasm',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True)
a=p.parse_args();raw=a.js.read_bytes();assert hashlib.sha256(raw).hexdigest()==a.sha256,'original application glue changed'
s=raw.decode();assert 'let wasmModule, wasmInstance, wasm;' in s,'unsupported bindgen instance layout'
for name in ['verifier_identity','project_market_identity','verify_market_prepared']:assert 'export function '+name+'(' in s,'not the application public verifier'
assert 'get_owned_wasm_module' not in s,'glue already sealed'
a.out.mkdir();suffix='\n// Application-owned read-only identity; no setter or alternate initializer.\nexport function get_owned_wasm_module() { return wasmModule; }\n'
js=a.out/a.js.name;js.write_bytes(raw+suffix.encode());wasm=a.out/a.wasm.name;shutil.copyfile(a.wasm,wasm)
(a.out/'package.json').write_text('{"type":"module"}\n')
(a.out/'SEAL.json').write_text(json.dumps({'schema':1,'bindgen':'0.2.126','originalGlueSha256':a.sha256,'ownedGlueSha256':hashlib.sha256(js.read_bytes()).hexdigest(),'wasmSha256':hashlib.sha256(wasm.read_bytes()).hexdigest(),'scope':'application verifier only; original generated glue and SDK unchanged','financialOperations':0},indent=2)+'\n')
