"""Independently verify preserved public UPSs without proving or using RPC.

The reviewed executable fixes the SDK Endcap key and common data. This does
not establish wallet approval, source eligibility, delta cryptography or live
inclusion; those require their separate producer/key/receipt evidence.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

# Immutable executable retained by the reviewed NFT v21 cohort. No SDK switch.
VERIFIER_SHA256 = '17b296cc113c8d31175bd42a10d1f5ae953dfcfbd01a40d31e984a1cf122ee20'
SDK_COMMIT = '01b8f2b0a077367a7b9879baba1a72aea8ab5510'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    with path.open('x') as f:
        json.dump(value, f, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())


def verify(verifier, source, output, expected_requests):
    if not 1 <= expected_requests <= 40:
        raise ValueError('explicit request count within the proof budget required')
    binary_hash = digest(verifier.read_bytes())
    if binary_hash != VERIFIER_SHA256:
        raise ValueError('reviewed fixed verifier executable differs')
    requests = sorted(source.glob('*/request.json'))
    if len(requests) != expected_requests:
        raise ValueError('exact completed request cohort required')
    # A fresh child directory is mandatory. Neither originals nor earlier
    # verification reports can be overwritten, even after a partial failure.
    output.mkdir()
    start = time.monotonic()
    save(output / 'PLAN.json', dict(
        schema=1, sdkCommit=SDK_COMMIT, verifierSha256=binary_hash,
        scriptSha256=digest(Path(__file__).read_bytes()),
        requests=expected_requests, maximumSeconds=900,
        mutations=['fee', 'end-state', 'proof-bytes'], newProofs=0, financialOperations=0))
    rows = []

    def run(request, report, log, valid):
        remaining = 900 - (time.monotonic() - start)
        if remaining <= 0:
            raise RuntimeError('independent verification time budget exhausted')
        if digest(verifier.read_bytes()) != binary_hash:
            raise ValueError('fixed verifier changed during verification')
        with log.open('xb') as f:
            result = subprocess.run([str(verifier), str(request), str(report)],
                                    stdout=f, stderr=subprocess.STDOUT,
                                    timeout=min(60, remaining))
        if valid:
            if result.returncode != 0 or not report.exists():
                raise RuntimeError('preserved public proof rejected: ' + request.parent.name)
        elif result.returncode == 0 or report.exists():
            raise RuntimeError('changed public metadata unexpectedly accepted')

    for request in requests:
        raw = request.read_bytes()
        identity = digest(raw)
        original = json.loads(raw)
        core = original['user_ec_input']['core']
        stage = output / request.parent.name
        stage.mkdir()
        run(request, stage / 'verified.json', stage / 'verify.log', True)
        report = json.loads((stage / 'verified.json').read_text())
        if not (report['requestSha256'] == identity
                and report['fullProofVerifiedAgainstPinnedNodeKeyAndCommon'] is True
                and report['metadataEndpointsAndFeesVerified'] is True
                and report['broadcast'] is False):
            raise ValueError('independent verifier report scope/identity differs')
        for kind in ('fee', 'end-state', 'proof-bytes'):
            changed = json.loads(raw)
            c = changed['user_ec_input']['core']
            if kind == 'fee':
                c['stats']['guta_fees_collected'] += 1
            elif kind == 'end-state':
                end = c['state_transition']['end_user_leaf_hash']
                c['state_transition']['end_user_leaf_hash'] = ('1' if end[0] == '0' else '0') + end[1:]
            else:
                changed['proof'][-1] ^= 1
            save(stage / (kind + '-request.json'), changed)
            run(stage / (kind + '-request.json'), stage / (kind + '-unexpected.json'),
                stage / (kind + '-rejected.log'), False)
        if digest(request.read_bytes()) != identity:
            raise ValueError('original public request changed')
        rows.append(dict(stage=request.parent.name, requestSha256=identity,
                         userId=core['new_user_leaf']['user_id'],
                         nonce=core['new_user_leaf']['nonce'],
                         fixedEndcapAndMetadataVerified=True,
                         changedFeeRejected=True, changedEndStateRejected=True,
                         changedProofRejected=True))
    result = dict(schema=1, sdkCommit=SDK_COMMIT, verifierSha256=binary_hash,
                  completeRequestsReverified=len(rows), changedFeeRejections=len(rows),
                  changedEndStateRejections=len(rows), changedProofRejections=len(rows),
                  newProofs=0, financialOperations=0,
                  approvalStackVerifiedHere=False, stateDeltaCryptographyVerifiedHere=False,
                  networkInclusionVerifiedHere=False, seconds=time.monotonic() - start, rows=rows)
    save(output / 'SUMMARY.json', result)
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('verifier', type=Path)
    p.add_argument('source', type=Path)
    p.add_argument('fresh_output', type=Path)
    p.add_argument('--expected-requests', type=int, required=True)
    args = p.parse_args()
    result = verify(args.verifier.resolve(strict=True), args.source.resolve(strict=True),
                    args.fresh_output.resolve(), args.expected_requests)
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}, indent=2))
