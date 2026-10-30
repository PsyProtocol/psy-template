"""Exercise the owned native delivery CLI; no RPC, proving or financial action.

Inputs are locally approved reference resources and explicitly untrusted test
manifests. There is no successful runtime transition/finality bundle fixture.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

SDK = 'c92880c8b6e2c8d392f19368bc8801a2584fd427'
CLIENT = 'b280d714a8f0930c61962c885374ea63ea63d274'
BACKEND = '736572e9dd3ca93566471cf5a2a1cb67a13fe01d'
VK = '8816e9054d99382ce4d2d530505b436bb7109bee26102e4eb6afde57cdad51dd'
COMMON = 'bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d'


def save(path, value):
    with path.open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir()
    reference = args.out / 'local-reference'
    result = subprocess.run([str(args.binary), 'export', str(reference)], capture_output=True, timeout=120)
    (args.out / 'export.log').write_bytes(result.stdout + result.stderr)
    assert result.returncode == 0
    inventory = json.loads((reference / 'reference.json').read_text())
    assert inventory['kind'] == 'local-fixed-checkpoint-reference-v1'
    resources = inventory['resources']
    assert resources['verifier']['sha256'] == VK
    assert resources['common']['sha256'] == COMMON
    for row in resources.values():
        assert hashlib.sha256((reference / row['file']).read_bytes()).hexdigest() == row['sha256']
    before = (reference / 'reference.json').read_bytes()
    collision = subprocess.run([str(args.binary), 'export', str(reference)], capture_output=True, timeout=120)
    (args.out / 'export-collision.log').write_bytes(collision.stdout + collision.stderr)
    assert collision.returncode != 0 and (reference / 'reference.json').read_bytes() == before

    def base():
        return {'schema': 1, 'kind': 'checkpoint-runtime-delivery-v1',
                'release': {'sdkCommit': SDK, 'clientCommit': CLIENT, 'backendCommit': BACKEND},
                'runtimeClaim': {'binarySha256': '0' * 64, 'buildManifestSha256': '0' * 64,
                                 'snapshotId': 'UNTRUSTED-TEST-ONLY', 'chainInstanceClaim': 'UNTRUSTED-TEST-ONLY',
                                 'exporter': 'UNTRUSTED-TEST-ONLY'},
                'resources': json.loads(json.dumps(resources)), 'boundaryPriorChainHash': '0' * 64,
                'checkpoints': [{'checkpointId': cp, 'record': {'file': str(cp) + '.record.json', 'sha256': '0' * 64},
                                 'opening': {'file': str(cp) + '.opening.json', 'sha256': '0' * 64}}
                                for cp in [18504, 18505]]}

    runs = []

    def reject(label, mutate, expected, setup=None, wrong_pin=False):
        directory = args.out / label
        directory.mkdir()
        for row in resources.values():
            shutil.copyfile(reference / row['file'], directory / row['file'])
        manifest = base()
        mutate(manifest)
        save(directory / 'delivery.json', manifest)
        if setup:
            setup(directory)
        pin = hashlib.sha256((directory / 'delivery.json').read_bytes()).hexdigest()
        report = args.out / (label + '.report.json')
        process = subprocess.run([str(args.binary), 'verify', str(directory), 'f' * 64 if wrong_pin else pin,
                                  str(report)], capture_output=True, timeout=120)
        (args.out / (label + '.log')).write_bytes(process.stdout + process.stderr)
        value = json.loads(report.read_text())
        assert process.returncode != 0 and value['inspectionPassed'] is False
        assert expected in value['error'], value['error']
        for key in ['runtimeIdentityAuthenticated', 'snapshotProvenanceAuthenticated', 'chainDomainAuthenticated',
                    'finalityVerified', 'causalSealVerified', 'qualifiedSource', 'randomAuthorization', 'broadcast']:
            assert value[key] is False
        assert value['financialOperations'] == value['proofsGenerated'] == 0
        runs.append({'label': label, 'exitCode': process.returncode, 'expectedRejection': expected,
                     'manifestSha256': pin})
        return directory, report

    no_change = lambda d: None
    reject('wrong-reviewed-pin', no_change, 'reviewed delivery manifest differs', wrong_pin=True)
    reject('rpc-observation-is-not-delivery', lambda d: d.update(kind='rpc-observation'), 'versioned runtime delivery required')
    reject('unapproved-sdk', lambda d: d['release'].update(sdkCommit='f' * 40), 'differs from frozen approval')
    reject('unknown-manifest-field', lambda d: d.update(verificationPassed=True), 'invalid strict delivery manifest')
    reject('foreign-verifier', lambda d: d['resources']['verifier'].update(sha256=hashlib.sha256(b'foreign').hexdigest()),
           'runtime resources differ', setup=lambda p: (p / 'transition-verifier.bin').write_bytes(b'foreign'))
    reject('resource-digest-substitution', no_change, 'delivery member digest mismatch',
           setup=lambda p: (p / 'transition-common.bin').write_bytes(b'substituted'))
    reject('path-escape', lambda d: d['resources']['verifier'].update(file='../transition-verifier.bin'), 'confined basenames')

    def link(p):
        (p / 'transition-verifier.bin').unlink()
        (p / 'transition-verifier.bin').symlink_to(reference.absolute() / 'transition-verifier.bin')
    reject('symlink-member', no_change, 'bounded regular public file required', setup=link)
    reject('missing-runtime-record', no_change, 'No such file or directory')
    reject('rpc-leaf-not-runtime-record', lambda d: d['checkpoints'][0]['record'].update(sha256=hashlib.sha256(b'{"random_seed":"observed"}').hexdigest()),
           'invalid frozen public database record type', setup=lambda p: (p / '18504.record.json').write_bytes(b'{"random_seed":"observed"}'))
    directory, report = reject('output-collision', no_change, 'No such file or directory')
    retained = report.read_bytes()
    collision = subprocess.run([str(args.binary), 'verify', str(directory),
                                hashlib.sha256((directory / 'delivery.json').read_bytes()).hexdigest(), str(report)],
                               capture_output=True, timeout=120)
    assert collision.returncode != 0 and report.read_bytes() == retained
    (args.out / 'verify-collision.log').write_bytes(collision.stdout + collision.stderr)
    save(args.out / 'SUMMARY.json', {'schema': 1, 'scope': 'Native export, strict import and rejection regressions only',
         'runs': runs, 'fixedReferenceHashesMatchPriorAudit': True, 'outputCollisionsPreserved': True,
         'nativeInvocations': len(runs) + 3, 'acceptedRuntimeBundles': 0, 'checkpointProofsAccepted': 0,
         'financialOperations': 0, 'proofsGenerated': 0, 'rpcRequests': 0,
         'runtimeIdentityAuthenticated': False, 'finalityVerified': False, 'randomAuthorization': False})


if __name__ == '__main__':
    main()
