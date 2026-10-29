"""Bounded, read-only sparse inventory capture; native frozen-SDK verification.

Every request/response is retained. Only explicitly budgeted transport retries
for identical read-only requests are permitted. No signing/financial API exists.
An incomplete capture cannot be labelled complete or resumed by overwriting it.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

REALMS = ['https://realm0-stg.psy-protocol.xyz', 'https://realm1-stg.psy-protocol.xyz']
COORDINATOR = 'https://coordinator-stg.psy-protocol.xyz'


def collect(driver, output, limit, seconds, resume=None, read_retries=0, max_retry_attempts=0):
    if output.exists():
        raise ValueError('fresh output directory required')
    output.mkdir()
    started = time.monotonic()
    count = 0
    retried = 0
    written = 0
    byte_limit = 256 * 1024 * 1024
    def raw_save(name, data):
        nonlocal written
        reserve = 0 if name == 'STOPPED.json' else 8192
        if written + len(data) > byte_limit - reserve:
            raise RuntimeError('capture byte budget exhausted; incomplete inventory')
        with (output / name).open('xb') as f:
            f.write(data)
        written += len(data)
    def save(name, value):
        raw_save(name, (json.dumps(value, indent=2) + '\n').encode())
    driver_hash=hashlib.sha256(driver.read_bytes()).hexdigest()
    save('PLAN.json', dict(schema=1, maxReadOnlyRpcRequests=limit, maxSeconds=seconds,
                          retriesPerRead=read_retries, maxTotalRetryAttempts=max_retry_attempts, financialOperations=0, driverSha256=driver_hash,
                          collectorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                          maxCapturedBytes=byte_limit,
                          resumeDirectory=str(resume) if resume else None))
    def rpc(url, method, params):
        nonlocal count, retried
        request = dict(jsonrpc='2.0', id=1, method=method, params=params)
        encoded = json.dumps(request).encode()
        identity = hashlib.sha256(url.encode()+b'\n'+encoded).hexdigest()
        for attempt in range(read_retries+1):
            if count >= limit or time.monotonic() - started >= seconds:
                raise RuntimeError('read-only request/time budget exhausted')
            count += 1
            prefix = f'{count:05d}'
            save(prefix + '-request.json', dict(endpoint=url, request=request, readIdentitySha256=identity, attempt=attempt))
            remaining = max(1, min(25, int(seconds - (time.monotonic() - started))))
            p = subprocess.run(['curl', '--silent', '--show-error', '--fail-with-body', '--max-filesize', '16777216', '--max-time', str(remaining),
                                '-H', 'Content-Type: application/json', '--data-binary', '@-', url],
                               input=encoded, capture_output=True, timeout=remaining + 3)
            raw_save(prefix + '-response.raw', p.stdout)
            save(prefix + '-transport.json', dict(exitCode=p.returncode, stderr=p.stderr.decode(errors='replace')))
            if p.returncode:
                if p.returncode in [7,28,35,52,56] and attempt < read_retries and retried < max_retry_attempts:
                    retried += 1
                    time.sleep(0.2)
                    continue
                raise RuntimeError(f'RPC transport failed at {prefix}; bounded read recovery stopped')
            v = json.loads(p.stdout)
            if v.get('jsonrpc') != '2.0' or v.get('id') != 1 or 'error' in v or 'result' not in v:
                raise RuntimeError(f'RPC envelope failed at {prefix}; no semantic retry')
            return v['result']
    try:
        parent_scope=None
        if resume:
            parent_scope=json.loads((resume/'SCOPE.json').read_text())
            parent_plan=json.loads((resume/'PLAN.json').read_text())
            if parent_plan['driverSha256']!=driver_hash or (resume/'COMPLETE.json').exists():
                raise ValueError('resume requires the same frozen driver and an incomplete capture')
        checkpoint = parent_scope['checkpoint'] if resume else rpc(REALMS[0], 'psy_get_latest_checkpoint_id', {})
        if type(checkpoint) is not int or not 0 < checkpoint < 2**32:
            raise ValueError('exact checkpoint required')
        anchors = [rpc(url, 'psy_get_checkpoint_global_state_roots', dict(checkpoint_id=1)) for url in [*REALMS, COORDINATOR]]
        if any(a != anchors[0] for a in anchors[1:]):
            raise ValueError('chain-instance observations disagree')
        roots = rpc(REALMS[0], 'psy_get_checkpoint_global_state_roots', dict(checkpoint_id=checkpoint))
        if resume and (parent_scope['roots']!=roots or parent_scope['checkpointOneRoots']!=anchors[0]):
            raise ValueError('resume root/chain changed; never switch source checkpoints')
        save('SCOPE.json', dict(checkpoint=checkpoint, roots=roots, checkpointOneRoots=anchors[0], finalityAuthenticated=False))
        transcript = dict(schema=1, checkpoint=checkpoint, userTreeRoot=roots['user_tree_root'], proofs=[])
        if resume:
            parent=max(resume.glob('transcript-*.json'))
            raw=parent.read_bytes();transcript=json.loads(raw)
            if transcript['checkpoint']!=checkpoint or transcript['userTreeRoot']!=roots['user_tree_root']:
                raise ValueError('resume transcript scope differs')
            save('RESUME.json',dict(parentTranscript=parent.name,parentTranscriptSha256=hashlib.sha256(raw).hexdigest(),
                                   reusedProofs=len(transcript['proofs']),parentScopeSha256=hashlib.sha256((resume/'SCOPE.json').read_bytes()).hexdigest()))
        top = {}
        step = len(transcript['proofs'])
        while True:
            if time.monotonic() - started >= seconds:
                raise RuntimeError('capture deadline exhausted; incomplete inventory')
            inp, out = output / f'transcript-{step:05d}.json', output / f'verified-{step:05d}.json'
            save(inp.name, transcript)
            if written > byte_limit - 2*1024*1024:
                raise RuntimeError('capture byte budget exhausted before verification; incomplete inventory')
            subprocess.run([str(driver), str(inp), str(out)], check=True, timeout=30)
            report = json.loads(out.read_text())
            written += out.stat().st_size
            if written > byte_limit - 8192 or time.monotonic() - started >= seconds:
                raise RuntimeError('capture byte/time budget exhausted; incomplete inventory')
            if report['completeRelativeToRoot']:
                save('COMPLETE.json', dict(report=report, readOnlyRpcRequests=count,
                     elapsedSeconds=time.monotonic()-started, readTransportRetries=retried, financialOperations=0,
                     warning='Root/instance are RPC observations. Source eligibility, finality and live spending authorization are separate gates.'))
                return
            uid = report['nextUserId']
            realm = uid >> 20
            if realm >= len(REALMS):
                raise ValueError('nonempty account in an unconfigured realm; do not omit it')
            proof = rpc(REALMS[realm], 'psy_get_user_tree_merkle_proof', dict(checkpoint_id=checkpoint, user_id=uid))
            if len(proof['siblings']) == 20:
                if realm not in top:
                    top[realm] = rpc(COORDINATOR, 'psy_get_user_sub_tree_merkle_proof',
                                    dict(checkpoint_id=checkpoint, root_level=0, leaf_level=12, leaf_index=realm))
                t = top[realm]
                if len(t['siblings']) != 12 or t['index'] != realm or t['value'] != proof['root'] or proof['index'] != uid % (1 << 20):
                    raise ValueError('realm/global path endpoints disagree')
                proof = dict(root=t['root'], value=proof['value'], index=uid, siblings=proof['siblings']+t['siblings'])
            # The native verifier authenticates every composed path, requested
            # index, zero subtree and frontier before choosing the next query.
            transcript['proofs'].append(proof)
            step += 1
    except Exception as e:
        save('STOPPED.json', dict(error=str(e), readOnlyRpcRequests=count,
             elapsedSeconds=time.monotonic()-started, complete=False, readTransportRetries=retried, financialOperations=0))
        raise


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('driver', type=Path)
    p.add_argument('fresh_output', type=Path)
    p.add_argument('--max-requests', type=int, default=128)
    p.add_argument('--max-seconds', type=int, default=600)
    p.add_argument('--resume',type=Path)
    p.add_argument('--read-retries',type=int,default=0)
    p.add_argument('--max-retry-attempts',type=int,default=0)
    a = p.parse_args()
    if not 1 <= a.max_requests <= 4096 or not 1 <= a.max_seconds <= 1200:
        raise ValueError('bounded read-only budget required')
    if not 0 <= a.read_retries <= 1 or not 0 <= a.max_retry_attempts <= 16:
        raise ValueError('read-only retry budget is at most one per request and sixteen total')
    collect(a.driver.resolve(strict=True), a.fresh_output, a.max_requests, a.max_seconds, a.resume,a.read_retries,a.max_retry_attempts)
