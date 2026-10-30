"""Native source-cohort diagnostics stay separate from release qualification.

No network, key installation, generated proof, signing or financial operation.
The two finite named comparisons are observations, never replacement verifiers.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def closed(value):
    assert value['kind'] == 'unapproved-source-cohort-diagnostic-v1'
    for key in ['approvedReleaseCompatible', 'comparisonResourcesInstalled',
                'runtimeIdentityAuthenticated', 'finalityVerified', 'qualifiedSource',
                'randomAuthorization', 'broadcast']:
        assert value[key] is False, key
    assert value['financialOperations'] == value['proofsGenerated'] == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--previous', type=Path, required=True)
    parser.add_argument('--current', type=Path, required=True)
    parser.add_argument('--original-report', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir()
    expected = json.loads(args.original_report.read_text())
    closed(expected)
    assert all(not row['approvedResourceProofVerified'] and not row['unapprovedNamedComparisonProofVerified']
               for row in expected['proofs'])
    assert expected['observedRelation']['approvedRelationMatches'] is False
    assert expected['observedRelation']['unapprovedNamedRelationMatches'] is False
    malformed = args.out / 'malformed.bin'
    malformed.write_bytes(b'not a checkpoint proof')
    altered = args.out / 'altered-public-input.bin'
    changed = bytearray(args.current.read_bytes())
    changed[-32] ^= 1
    altered.write_bytes(changed)
    runs = []

    def run(label, cohort, previous, current, expected_code):
        target = args.out / (label + '.json')
        p = subprocess.run([str(args.binary), cohort, str(previous), str(current), '-', str(target)],
                           capture_output=True, timeout=120)
        (args.out / (label + '.log')).write_bytes(p.stdout + p.stderr)
        assert (p.returncode == 0) == (expected_code == 0)
        value = json.loads(target.read_text())
        closed(value)
        runs.append({'label': label, 'exitCode': p.returncode})
        return value

    bad = run('malformed', 'cached-mainnet-beta-f786b599', malformed, args.current, 1)
    assert bad['diagnosticCompleted'] is False and 'error' in bad
    changed = run('changed-public-input', 'cached-mainnet-beta-f786b599', args.previous, altered, 0)
    assert changed['proofs'][1]['proofSha256'] != expected['proofs'][1]['proofSha256']
    assert not changed['proofs'][1]['unapprovedNamedComparisonProofVerified']
    unknown = run('external-resource-selector', '/unreviewed/resource.json', args.previous, args.current, 1)
    assert 'no external verifier input' in unknown['error']
    retained = args.original_report.read_bytes()
    collision = subprocess.run([str(args.binary), 'cached-mainnet-beta-f786b599', str(args.previous),
                                str(args.current), '-', str(args.original_report)], capture_output=True, timeout=120)
    (args.out / 'collision.log').write_bytes(collision.stdout + collision.stderr)
    assert collision.returncode != 0 and args.original_report.read_bytes() == retained
    with (args.out / 'SUMMARY.json').open('x') as output:
        json.dump({'schema': 1, 'scope': 'native diagnostic classification/rejection only', 'runs': runs,
                   'nativeInvocations': 4, 'originalReportSha256': hashlib.sha256(retained).hexdigest(),
                   'outputCollisionPreserved': True, 'malformedNotClassifiedAsCryptoRejection': True,
                   'comparisonKeyCannotBeSelectedByExternalResource': True,
                   'approvedReleaseCompatible': False, 'comparisonResourcesInstalled': False,
                   'runtimeIdentityAuthenticated': False, 'finalityVerified': False,
                   'qualifiedSource': False, 'randomAuthorization': False,
                   'proofsGenerated': 0, 'financialOperations': 0, 'broadcast': False}, output, indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
