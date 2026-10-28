"""Exercise the real offline diagnostic; expected crypto rejection is not acceptance."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

PREVIOUS = '7f59e1b7028c9e36b06606a9009cee200ecf2b13913e9a82cc83bf34862925db'
CURRENT = 'bb7a12da2e29fc8a34b6abdfb61956a1d9f36f032c3b2a8952385a9ea71be3c3'
FINGERPRINT = '5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06'
ERROR = 'Condition failed: `vanishing_polys_zeta[i] == z_h_zeta * reduce_with_powers(chunk, zeta_pow_deg)`'


def check_original_failure(report):
    assert report['resourcesConstructed'] is True and report['stage'] == 'proofComparison'
    assert [row['sha256'] for row in report['inputIdentities']] == [PREVIOUS, CURRENT]
    assert [row['proofSha256'] for row in report['proofs']] == [PREVIOUS, CURRENT]
    for row in report['proofs']:
        assert row['strictAndSdkDecodeEqual'] and row['strictRoundtripExact'] and row['sdkRoundtripExact']
        assert row['fingerprint'] == FINGERPRINT
        assert row['sdkBorrowedVerified'] is False and row['applicationOwnedVerified'] is False
        assert row['sdkBorrowedError'] == ERROR and row['applicationOwnedError'] == ERROR
    assert report['allProofsMatched'] is False
    for field in ['finalityVerified', 'randomAuthorization', 'chainDomainAuthenticated', 'broadcast']:
        assert report[field] is False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir()
    previous, current = [args.evidence / (name + '.bin') for name in ['previous-proof', 'current-proof']]
    assert [hashlib.sha256(p.read_bytes()).hexdigest() for p in [previous, current]] == [PREVIOUS, CURRENT]
    runs = []

    def run(label, mode, before=previous, now=current):
        target = args.out / (label + '.json')
        result = subprocess.run([str(args.binary), mode, str(before), str(now), str(target)],
                                capture_output=True, timeout=120)
        (args.out / (label + '.log')).write_bytes(result.stdout + result.stderr)
        assert result.returncode != 0, 'No captured proof is expected to be accepted under the frozen resources'
        report = json.loads(target.read_text())
        runs.append({'label': label, 'exitCode': result.returncode})
        return report

    cached = run('cached', 'cached')
    check_original_failure(cached)
    constructed = run('constructed', 'constructed')
    assert constructed['stage'] == 'resourceConstruction' and constructed['resourcesConstructed'] is False
    assert constructed['error'] == 'official frozen network resource construction: PSY_NETWORK testnet does not match localhost'
    assert constructed['inputIdentities'] == cached['inputIdentities']
    assert constructed['sourceParameters']['officialRotationParameters']['available'] is False

    malformed = args.out / 'malformed.bin'
    malformed.write_bytes(b'not a checkpoint proof')
    bad = run('malformed', 'cached', malformed)
    assert bad['resourcesConstructed'] is True and bad['stage'] == 'proofReadDecodeOrComparison'
    assert bad['error'].startswith('strict proof decode:')
    try:
        check_original_failure(bad)
        raise RuntimeError('Malformed input was mislabeled as the original crypto failure')
    except (AssertionError, KeyError):
        pass

    trailing = args.out / 'trailing.bin'
    trailing.write_bytes(previous.read_bytes() + b'\x00')
    bad = run('trailing', 'cached', trailing)
    assert bad['resourcesConstructed'] is True and bad['stage'] == 'proofReadDecodeOrComparison'
    assert bad['error'].startswith('strict proof decode:')

    substituted = run('substituted', 'cached', current)
    try:
        check_original_failure(substituted)
        raise RuntimeError('Substituted input was mislabeled as the original crypto failure')
    except AssertionError:
        pass

    target = args.out / 'cached.json'
    before = target.read_bytes()
    result = subprocess.run([str(args.binary), 'cached', str(previous), str(current), str(target)],
                            capture_output=True, timeout=120)
    assert result.returncode != 0 and target.read_bytes() == before
    (args.out / 'REGRESSION.json').write_text(json.dumps({
        'schema': 1, 'scope': 'real offline diagnostic and evidence-classification regressions; zero accepted checkpoint proofs',
        'runs': runs, 'outputCollisionPreserved': True, 'decodeFailuresNotCryptoFailures': True,
        'substituteNotOriginalFailure': True, 'acceptedCheckpointProofs': 0,
        'financialOperations': 0, 'proofsGenerated': 0, 'randomAuthorization': False,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
