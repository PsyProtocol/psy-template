"""Capture exact pinned checkpoint proofs and public job references, read-only.

Raw transport failures are kept separate from decoding and digest failures.
No retry, verifier installation, proof generation, wallet or financial action.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ENDPOINT = 'https://coordinator-stg.psy-protocol.xyz'


def save(path, value):
    with path.open('x') as output:
        json.dump(value, output, indent=2)
        output.write('\n')


def decode_proof_response(raw, request_id, expected_sha256):
    reply = json.loads(raw)
    if not isinstance(reply, dict) or type(reply.get('id')) is not int or reply.get('id') != request_id or 'error' in reply:
        raise ValueError('exact request identity and successful JSON-RPC result required')
    result = reply.get('result')
    if not isinstance(result, list) or not result or len(result) > 2_000_000:
        raise ValueError('bounded nonempty proof byte array required')
    if not all(type(byte) is int and 0 <= byte < 256 for byte in result):
        raise ValueError('proof bytes must be integers in 0..255')
    data = bytes(result)
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError('returned bytes differ from the pinned original proof')
    return data


def capture_read(directory, label, request, run=subprocess.run):
    save(directory / (label + '-request.json'), request)
    timed_out = False
    try:
        process = run(['curl', '--silent', '--show-error', '--connect-timeout', '5',
                       '--max-time', '40', '--max-filesize', '2097152', '--header',
                       'content-type: application/json', '--data-binary', '@-', ENDPOINT],
                      input=json.dumps(request).encode(), capture_output=True, timeout=45)
        raw, stderr, code = process.stdout, process.stderr, process.returncode
    except subprocess.TimeoutExpired as error:
        raw, stderr, code = error.stdout or b'', error.stderr or b'', None
        timed_out = True
    with (directory / (label + '-response.raw')).open('xb') as output:
        output.write(raw)
    save(directory / (label + '-transport.json'), {'exitCode': code,
         'stderr': stderr.decode(errors='replace'), 'responseBytes': len(raw),
         'wrapperTimedOut': timed_out})
    if timed_out or code:
        raise RuntimeError('transport failure; raw response preserved; no decode or retry')
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    manifest_bytes = args.manifest.read_bytes()
    manifest = json.loads(manifest_bytes)
    if set(manifest) != {'schema', 'proofs'} or type(manifest['schema']) is not int or manifest['schema'] != 1:
        raise ValueError('explicit proof-pair manifest required')
    rows = manifest['proofs']
    if not isinstance(rows, list) or len(rows) != 2:
        raise ValueError('exactly two checkpoints required')
    ids = []
    for row in rows:
        if set(row) != {'checkpoint', 'sha256'}:
            raise ValueError('checkpoint identity and original digest required')
        if type(row['checkpoint']) is not int or not 0 < row['checkpoint'] < 2**32:
            raise ValueError('checkpoint range')
        if len(row['sha256']) != 64 or any(c not in '0123456789abcdef' for c in row['sha256']):
            raise ValueError('canonical SHA256 required')
        ids.append(row['checkpoint'])
    if ids[1] != ids[0] + 1:
        raise ValueError('ordered adjacent requested IDs required; not authenticated adjacency')
    args.out.mkdir()
    save(args.out / 'PLAN.json', {'maximumLogicalReadRequests': 6, 'maximumAttemptsPerRequest': 1,
                                 'maxSecondsPerRequest': 40, 'endpoint': ENDPOINT,
                                 'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
                                 'financialOperations': 0, 'finalityAuthenticated': False})
    results = []

    def read(label, request):
        return capture_read(args.out, label, request)

    try:
        for row in rows:
            cp = row['checkpoint']
            raw = read(str(cp), {'jsonrpc': '2.0', 'id': cp,
                       'method': 'psy_get_checkpoint_state_transition_proof',
                       'params': {'checkpoint_id': cp}})
            proof = decode_proof_response(raw, cp, row['sha256'])
            with (args.out / (str(cp) + '.bin')).open('xb') as output:
                output.write(proof)
            references = {}
            for method in ['psy_get_unique_pending_id_for_checkpoint_id', 'psy_get_job_stats']:
                label = str(cp) + '-' + method.removeprefix('psy_get_')
                reply = json.loads(read(label, {'jsonrpc': '2.0', 'id': cp, 'method': method,
                                               'params': {'checkpoint_id': cp}}))
                if not isinstance(reply, dict) or type(reply.get('id')) is not int or reply.get('id') != cp:
                    raise ValueError('metadata response identity mismatch')
                references[method] = reply  # RPC errors remain observed errors, never evidence of absence.
                save(args.out / (label + '-decoded.json'), reply)
            results.append({'checkpoint': cp, 'sha256': hashlib.sha256(proof).hexdigest(),
                            'proofBytes': len(proof), 'byteIdenticalToOriginal': True,
                            'unverifiedRpcReferences': references})
    except Exception as error:
        save(args.out / 'SUMMARY.json', {'complete': False, 'error': str(error), 'rows': results,
                                       'financialOperations': 0, 'proofsVerified': 0})
        raise
    save(args.out / 'SUMMARY.json', {'complete': True, 'rows': results, 'financialOperations': 0,
                                   'proofsVerified': 0, 'runtimeBuildAuthenticated': False,
                                   'canonicalFinalityAuthenticated': False})


if __name__ == '__main__':
    main()
