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


def check_original_failure(report, expected=(PREVIOUS, CURRENT)):
    assert report['resourcesConstructed'] is True and report['stage'] == 'proofComparison'
    assert [row['sha256'] for row in report['inputIdentities']] == list(expected)
    assert [row['proofSha256'] for row in report['proofs']] == list(expected)
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
    parser.add_argument('--manifest', type=Path, help='explicit original pair; never a replacement verifier')
    parser.add_argument('--with-control', action='store_true', help='one synthetic cached-genesis proof; real pair must remain rejected')
    args = parser.parse_args()
    args.out.mkdir()
    expected=(PREVIOUS,CURRENT)
    if args.manifest:
        manifest=json.loads(args.manifest.read_text())
        assert manifest['schema']==1 and len(manifest['proofs'])==2
        rows=manifest['proofs'];assert all(type(r['checkpoint'])is int and 0<r['checkpoint']<2**32 for r in rows)
        assert rows[1]['checkpoint']==rows[0]['checkpoint']+1
        expected=tuple(r['sha256']for r in rows)
        assert all(len(h)==64 and all(c in '0123456789abcdef'for c in h)for h in expected)
        previous,current=[args.evidence/(str(r['checkpoint'])+'.bin')for r in rows]
    else:
        previous,current=[args.evidence/(name+'.bin')for name in ['previous-proof','current-proof']]
    assert [hashlib.sha256(p.read_bytes()).hexdigest() for p in [previous, current]] == list(expected)
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
    check_original_failure(cached,expected)
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
        check_original_failure(bad,expected)
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
        check_original_failure(substituted,expected)
        raise RuntimeError('Substituted input was mislabeled as the original crypto failure')
    except AssertionError:
        pass

    control = None
    if args.with_control:
        controlled=run('selfcheck','cached-with-control')
        check_original_failure(controlled,expected)
        control=controlled['fixedResourceControl']
        for name in ['genesisCachedAndSourceResourcesEqual','genesisNativeVerified','genesisSdkBorrowedVerified','genesisApplicationOwnedVerified','mutatedPublicInputsRejected']:
            assert control[name]is True,name
        assert control['proofsGenerated']==1 and controlled['proofsGenerated']==1
        assert control['canonicalGenesisVerified']is False and control['realTransitionProofsAccepted']==0
        assert all(row['fingerprintRecomputed']for row in control['inventory'])
        proof=args.out/'selfcheck.genesis-control.bin'
        assert hashlib.sha256(proof.read_bytes()).hexdigest()==control['proofSha256']
        report_before=(args.out/'selfcheck.json').read_bytes();proof_before=proof.read_bytes()
        collision=subprocess.run([str(args.binary),'cached-with-control',str(previous),str(current),str(args.out/'selfcheck.json')],capture_output=True,timeout=120)
        assert collision.returncode!=0 and report_before==(args.out/'selfcheck.json').read_bytes() and proof_before==proof.read_bytes()
    target = args.out / 'cached.json'
    before = target.read_bytes()
    result = subprocess.run([str(args.binary), 'cached', str(previous), str(current), str(target)],
                            capture_output=True, timeout=120)
    assert result.returncode != 0 and target.read_bytes() == before
    (args.out / 'REGRESSION.json').write_text(json.dumps({
        'schema': 1, 'scope': 'real offline diagnostic and evidence-classification regressions; zero accepted checkpoint proofs',
        'expectedProofSha256':list(expected),'syntheticControl':control,'runs': runs, 'outputCollisionPreserved': True, 'decodeFailuresNotCryptoFailures': True,
        'substituteNotOriginalFailure': True, 'acceptedCheckpointProofs': 0,
        'financialOperations': 0, 'proofsGenerated': 1 if args.with_control else 0, 'randomAuthorization': False,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
