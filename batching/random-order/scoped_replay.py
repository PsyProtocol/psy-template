"""Reverify saved conditional proofs and reject endpoint/resource substitutions."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir()
    original = args.input
    summary = json.loads((original / 'REPORT.json').read_text())
    rows = []
    def invoke(name, statement, layout, root, checkpoint, proof, accepted, expected_stage=None):
        target = args.out / (name + '-report.json')
        result = subprocess.run([str(args.binary), str(statement), str(layout), root,
            str(checkpoint), str(proof), str(target)], capture_output=True, timeout=120)
        (args.out / (name + '.log')).write_bytes(result.stdout + result.stderr)
        assert result.returncode == (0 if accepted else 1), name
        report = json.loads(target.read_text())
        assert report['inputIdentities'] == {
            'statementSha256': hashlib.sha256(statement.read_bytes()).hexdigest(),
            'layoutSha256': hashlib.sha256(layout.read_bytes()).hexdigest(),
            'proofSha256': hashlib.sha256(proof.read_bytes()).hexdigest()}, name
        row = {'name': name, 'exitCode': result.returncode, 'acceptedComponent': accepted}
        if accepted:
            assert report['conditionalComponentProofVerified'] is True
            assert report['proofSha256'] == hashlib.sha256(proof.read_bytes()).hexdigest()
            for key in ['chainInstanceAuthenticated', 'finalityVerified', 'qualifiedSource', 'causalSealVerified', 'randomAuthorization', 'fullUpsVerified', 'broadcast']:
                assert report[key] is False
        else:
            assert report['conditionalComponentProofVerified'] is False
            assert report['failureKind'] == 'rejected' and report['stage'] == expected_stage, name
            row['stage'] = report['stage']
        rows.append(row)

    for market in ['amm', 'curve']:
        invoke(market, original / (market + '-input.json'), original / 'layout.json',
            summary[market + 'CheckpointRoot'], summary['sealCheckpoint'], original / (market + '-proof.bin'), True)
    good = json.loads((original / 'amm-input.json').read_text())
    def changed(name, value, stage='public-inputs'):
        path = args.out / (name + '.json')
        path.write_text(json.dumps(value) + '\n')
        invoke(name, path, original / 'layout.json', summary['ammCheckpointRoot'],
            summary['sealCheckpoint'], original / 'amm-proof.bin', False, stage)

    for index in range(36):
        value = json.loads(json.dumps(good)); value['scopeFields'][index] = str(int(value['scopeFields'][index]) + 1)
        changed('scope-' + str(index), value, 'input' if index == 0 else 'public-inputs')
    for index in [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 51, 52]:
        value = json.loads(json.dumps(good)); value['fields'][index] = str(int(value['fields'][index]) + 1)
        changed('base-' + str(index), value, 'input' if index in [1, 50] else 'public-inputs')
    value = json.loads(json.dumps(good)); value['seed'][0] = str(int(value['seed'][0]) + 1); changed('seed', value)
    invoke('checkpoint', original / 'amm-input.json', original / 'layout.json', summary['ammCheckpointRoot'],
        summary['sealCheckpoint'] + 1, original / 'amm-proof.bin', False, 'public-inputs')
    layout = json.loads((original / 'layout.json').read_text()); layout['root_slot'] -= 1
    layout_path = args.out / 'changed-layout.json'; layout_path.write_text(json.dumps(layout) + '\n')
    invoke('layout', original / 'amm-input.json', layout_path, summary['ammCheckpointRoot'],
        summary['sealCheckpoint'], original / 'amm-proof.bin', False, 'proof')
    for name, transform in [('trailing-proof', lambda b: b + b'\x00'), ('corrupt-proof', lambda b: b[:8] + bytes([b[8] ^ 1]) + b[9:])]:
        proof = args.out / (name + '.bin'); proof.write_bytes(transform((original / 'amm-proof.bin').read_bytes()))
        invoke(name, original / 'amm-input.json', original / 'layout.json', summary['ammCheckpointRoot'], summary['sealCheckpoint'], proof, False, 'input' if name == 'trailing-proof' else 'proof')
    (args.out / 'REPLAY.json').write_text(json.dumps({'schema': 2,
        'scope': 'saved conditional component verification and rejections; not source/finality/market acceptance',
        'acceptedSavedComponents': 2, 'rejectedCases': sum(not r['acceptedComponent'] for r in rows), 'runs': rows,
        'financialOperations': 0, 'proofsGenerated': 0, 'randomAuthorization': False}, indent=2) + '\n')


if __name__ == '__main__':
    main()
