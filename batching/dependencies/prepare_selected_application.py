"""Prepare the selected mainnet-beta release using its exact existing source freeze.

Branch provenance is separate from immutable commit/profile identity. Never
follow a moving branch or relabel old proofs, keys, manifests or runtime packs.
"""
import argparse
import hashlib
import json
from pathlib import Path
from prepare_mainnet_beta_application import APP, prepare


def selection():
    raw = Path(__file__).with_name('selected.json').read_bytes()
    selected = json.loads(raw)
    assert selected['schema'] == 1
    assert selected['sdkRepository'] == 'https://github.com/PsyProtocol/psy-sdk.git'
    assert selected['sdkBranch'] == 'mainnet-beta'
    assert selected['sdkCommit'] == '01b8f2b0a077367a7b9879baba1a72aea8ab5510'
    assert selected['clientCommit'] == '7058070057c3242b5d8b29e1a31d498aaa4202c0'
    assert selected['sourceManifest'] == 'batching/dependencies/audit-20261102/manifest.json'
    assert selected['sourceManifestSha256'] == '246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467'
    assert selected['sdkProfile'] == 'sdk-audit-20261102-v1'
    assert selected['compilerFeatures'] == ['sdk-audit-v1']
    manifest = APP / selected['sourceManifest']
    assert hashlib.sha256(manifest.read_bytes()).hexdigest() == selected['sourceManifestSha256']
    freeze = json.loads(manifest.read_bytes())
    assert all(freeze[k] == selected[k] for k in ['sdkCommit', 'clientCommit'])
    return selected, manifest.parent, hashlib.sha256(raw).hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--test-only', action='store_true')
    args = parser.parse_args()
    selected, freeze, digest = selection()
    record = prepare(args.source, args.out, args.test_only, freeze=freeze)
    assert record['features'] == selected['compilerFeatures']
    with (args.out / 'SOURCE-SELECTION.json').open('x') as f:
        json.dump({'selection': selected, 'selectionSha256': digest,
                   'sourceBytesChanged': False, 'networkRequests': 0,
                   'financialOperations': 0}, f, indent=2)
        f.write('\n')
    print(json.dumps(record))
