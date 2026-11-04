"""Snapshot the application against exact, unpatched mainnet-beta sources.

No Git checkout, fetch, service, wallet or original evidence is modified. Cargo
is not invoked. Use the returned manifest with --locked and the declared domain.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import re
from materialize_mainnet_beta import FREEZE, verify

APP = Path(__file__).resolve().parents[2]


def stamp_sdk_metadata(text, manifest, branch):
    """Stamp provenance only; never alter Cargo dependency declarations."""
    pattern = r'(\[package\.metadata\.psy-sdk\]\n)([^\[]*)'
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise ValueError('one application SDK metadata table required')
    match = matches[0]
    old = match.group(2)
    for key, value in [('branch', branch), ('commit', manifest['sdkCommit']),
                       ('client-commit', manifest['clientCommit'])]:
        if not re.fullmatch(r'[A-Za-z0-9_./-]+', value):
            raise ValueError('invalid SDK provenance value')
        old, count = re.subn(r'^' + key + r' = "[^"\n]*"$', key + ' = "' + value + '"', old, flags=re.M)
        if count != 1:
            raise ValueError('one SDK provenance field required: ' + key)
    return text[:match.start(2)] + old + text[match.end(2):]


def prepare(source, output, test_only=False, freeze=FREEZE, selected_branch=None):
    source, output = source.resolve(), output.absolute()
    manifest = json.loads((freeze / 'manifest.json').read_text())
    if output.exists() or output.is_symlink():
        raise ValueError('fresh application output required')
    for pin in manifest['sourcePins']:
        verify(source / pin['path'], pin)
    if output.resolve().is_relative_to(source) or output.resolve().is_relative_to(APP):
        raise ValueError('output must be outside original repositories and frozen sources')
    app = APP / 'amm/u124/vm-tests'
    files = [app / 'Cargo.toml', app / 'Cargo.lock']
    files += sorted(p for d in ['src', 'tests'] for p in (app / d).rglob('*') if p.is_file())
    for path in files:
        if path.is_symlink():
            raise ValueError('application source links are forbidden')
    output.mkdir(parents=True)
    hashes = {}
    for path in files:
        name = path.relative_to(app)
        data = path.read_bytes()
        hashes[str(name)] = hashlib.sha256(data).hexdigest()
        dest = output / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if name == Path('Cargo.toml'):
            text = data.decode().replace('../../../../psy-node/', str(source / 'psy-node') + '/')
            text = stamp_sdk_metadata(text, manifest, selected_branch or manifest['sdkBranch'])
            if test_only:
                text = text.replace('[package]\n', '[package]\nautobins = false\n', 1)
            data = text.encode()
        dest.write_bytes(data)
    record = {'schema': 1, 'sdkCommit': manifest['sdkCommit'], 'clientCommit': manifest['clientCommit'],
              'backendCommit': manifest['backendCommit'], 'toolchain': manifest['toolchain'],
              'features': ['sdk-audit-v1'] if manifest['sdkBranch'] == 'audit' else [],
              'network': 'testnet', 'networkMagic': '1384803358401154921',
              'sourceFiles': hashes, 'cargoManifest': str(output / 'Cargo.toml'),
              'stagedCargoManifestSha256': hashlib.sha256((output / 'Cargo.toml').read_bytes()).hexdigest(),
              'sdkBranch': selected_branch or manifest['sdkBranch'],
              'automaticBinaryTargets': not test_only,
              'upstreamPatches': [], 'financialOperations': 0,
              'fullUpsVerified': False, 'liveAcceptanceComplete': False}
    (output / 'APPLICATION.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--test-only', action='store_true', help='omit unrelated CLI link targets; library and tests unchanged')
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.out, args.test_only)))
