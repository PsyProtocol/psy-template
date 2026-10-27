#!/usr/bin/env python3
"""Restore public fixtures and prove ordinary UPSs without RPC or SDK mutation.
Use a fresh output directory. Default only prepares; --run builds/proves offline.
"""
import argparse, datetime, gzip, hashlib, json, os, re, shutil, signal, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'batching/dependencies/session-bound-sdk-20261020/manifest.json'
EXPECTED_MANIFEST = '0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--mode', choices=['fund','claim'], default='fund')
    args = parser.parse_args()
    sdk, config, output = args.sdk.resolve(), args.config.resolve(), args.output.resolve()
    raw = MANIFEST.read_bytes()
    assert sha(raw) == EXPECTED_MANIFEST, 'Selected SDK manifest changed'
    selected = json.loads(raw)
    for path, digest in selected['sourceFiles'].items():
        assert sha((sdk / path).read_bytes()) == digest, 'SDK source changed: ' + path
    assert sha(config.read_bytes()) == selected['configSha256'], 'Frozen compiler/network config changed'
    crate = ROOT / 'amm/u124/vm-tests'
    assert sha((crate / 'Cargo.lock').read_bytes()) == selected['applicationCargoLockSha256']
    output.mkdir(parents=True, exist_ok=False)
    def public(name, value):
        with (output / name).open('x') as f:
            json.dump(value, f, indent=2); f.write('\n')
    public('PLAN.json', {'schema': 1, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'mode': 'run' if args.run else 'prepare-only', 'action':args.mode, 'sdkManifestSha256': EXPECTED_MANIFEST,
        'sdkSourcesVerified': len(selected['sourceFiles']), 'markets': ['amm','orderbook','bondingcurve','nftmarket'],
        'financialBroadcasts': 0, 'rpcCalls': 0, 'rayonThreads': 2, 'proofProcesses': 1,
        'buildLimitSeconds': 5400, 'proofLimitSeconds': 2700, 'secretPolicy': 'ephemeral in-memory synthetic signer only'})
    archive = ROOT / 'executor/verification/2026-10-21-compact-candidate-v1/bulk-four-full-ups-v1'
    index = json.loads((archive / 'manifest.json').read_bytes())
    restored = []
    for entry in index['records']:
        if not entry['source'].startswith('fixtures/'):
            continue
        relative = Path(entry['source'])
        assert '..' not in relative.parts and not relative.is_absolute()
        packed = (archive / entry['file']).read_bytes()
        assert sha(packed) == entry['gzipSha256']
        data = gzip.decompress(packed)
        assert len(data) == entry['bytes'] and sha(data) == entry['sha256']
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as f: f.write(data)
        restored.append({'file': str(relative), 'sha256': sha(data)})
    public('FIXTURES.json', restored)
    app = output / 'app'
    shutil.copytree(crate, app, ignore=shutil.ignore_patterns('target'))
    cargo = app / 'Cargo.toml'
    cargo.write_text(cargo.read_text().replace('[package]', '[package]\nautobins = false', 1).replace('../../../../psy-node', str(sdk)))
    public('SOURCE.json', [{'file': str(p.relative_to(app)), 'sha256': sha(p.read_bytes())}
                           for p in sorted(app.rglob('*')) if p.is_file()])
    env = dict(os.environ, PSY_CONFIG_PATH=str(config), PSY_NETWORK='localhost',
               CARGO_TARGET_DIR=str(output/'target'), BATCH_BUILD=str(output/'fixtures'),
               BATCH_ADMISSION_TEST='1', BATCH_PROOF_PROFILE='compact-v1',
               ORDINARY_FULL_UPS_OUT=str(output/'ordinary-full-ups'),
               ORDINARY_FULL_UPS_MARKETS='amm,orderbook,bondingcurve,nftmarket', ORDINARY_FULL_UPS_MODE=args.mode, RAYON_NUM_THREADS='2')
    build = ['cargo','+nightly-2025-09-20','test','--offline','--locked','--release','--test','batch_lifecycle','--no-run']
    public('COMMANDS.json', {'build':build,'sdk':str(sdk),'configSha256':sha(config.read_bytes()),
                            'scope':'No network acceptance; complete ordinary UPS against synthetic authenticated checkpoint fixtures'})
    if not args.run:
        print('Prepared pinned source/fixtures only; no compiler, prover or RPC started')
        return
    def execute(command, log, seconds):
        begin=time.monotonic()
        with (output/log).open('xb') as f:
            process=subprocess.Popen(command,cwd=app,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
            timed=False
            try: code=process.wait(timeout=seconds)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGTERM);code=process.wait();timed=True
        public(log+'.result.json',{'exitCode':code,'elapsedMs':1000*(time.monotonic()-begin),'timedOut':timed})
        assert code==0, 'Preserved failed offline stage: '+log
    execute(build,'build.log',5400)
    binaries=[p for p in (output/'target/release/deps').glob('batch_lifecycle-*') if p.is_file() and os.access(p,os.X_OK)]
    assert len(binaries)==1, 'Ambiguous test binary; stop'
    command=[str(binaries[0]),'full_ups::ordinary_wallet::four_market_ordinary_wallet_complete_ups','--exact','--ignored','--test-threads=1','--nocapture']
    if os.uname().sysname=='Darwin': command=['/usr/bin/time','-l']+command
    execute(command,'proof.log',2700)

if __name__ == '__main__':
    main()
