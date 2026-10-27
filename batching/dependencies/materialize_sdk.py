"""Reconstruct the reviewed SDK dependency in a fresh directory; never edit Node.

Use the frozen commit's Git objects and the existing, explicitly listed SDK delta.
No branches, working trees, services, wallets, or original artifacts are modified.
This is a source snapshot, not a claim of upstream release or runtime attestation.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

FREEZE = Path(__file__).resolve().parent / 'session-bound-sdk-20261020'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def verify(root, manifest):
    for name, expected in manifest['sourceFiles'].items():
        path = root / name
        if path.is_symlink() or not path.is_file() or digest(path.read_bytes()) != expected:
            raise ValueError('SDK source mismatch: ' + name)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--objects', required=True, type=Path, help='read-only Git repository containing the frozen commit')
    parser.add_argument('--genesis-objects', required=True, type=Path, help='read-only psy-genesis Git objects')
    parser.add_argument('--out', required=True, type=Path, help='fresh SDK directory, usually FRESH_WORKSPACE/psy-node')
    args = parser.parse_args()
    manifest = json.loads((FREEZE / 'manifest.json').read_text())
    patch = (FREEZE / 'existing-sdk-delta.patch').read_bytes()
    config = (FREEZE / 'build-config.json').read_bytes()
    if digest(patch) != manifest['deltaSha256'] or digest(config) != manifest['configSha256']:
        raise ValueError('freeze checksum mismatch')
    app = Path(__file__).resolve().parents[2]
    if digest((FREEZE / 'Cargo.lock').read_bytes()) != manifest['applicationCargoLockSha256']:
        raise ValueError('application Cargo.lock differs from frozen dependency contract')
    root = args.out.absolute()
    if root.exists() or root.is_symlink():
        raise ValueError('output must not exist; preserve old artifacts')
    genesis = manifest['genesis']
    genesis_bytes = subprocess.check_output(['git', '-C', str(args.genesis_objects.resolve()), 'show', genesis['commit'] + ':' + genesis['file']])
    if digest(genesis_bytes) != genesis['sha256']:
        raise ValueError('genesis build-input checksum mismatch')
    for source in (args.objects.resolve(), args.genesis_objects.resolve()):
        if root.resolve().is_relative_to(source):
            raise ValueError('output must be outside original source repositories')
    archive = subprocess.check_output(['git', '-C', str(args.objects.resolve()), 'archive', manifest['baseCommit']])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        members = tar.getmembers()
        for member in members:
            name = Path(member.name)
            if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                raise ValueError('unsupported archive entry: ' + member.name)
        root.mkdir(parents=True)
        # Names and entry types validated above; no links or devices accepted.
        tar.extractall(root)
    names = subprocess.check_output(['git', 'apply', '--numstat', str(FREEZE / 'existing-sdk-delta.patch')], cwd=root, text=True)
    if sorted(line.split('\t')[2] for line in names.splitlines()) != sorted(manifest['deltaFiles']):
        raise ValueError('unexpected SDK delta file set')
    subprocess.run(['git', 'apply', '--check', str(FREEZE / 'existing-sdk-delta.patch')], cwd=root, check=True)
    subprocess.run(['git', 'apply', str(FREEZE / 'existing-sdk-delta.patch')], cwd=root, check=True)
    verify(root, manifest)
    # SDK's build.rs consumes this separately frozen public network config.
    (root / 'frozen-build-config.json').write_bytes(config)
    (root / 'psy-genesis').mkdir(exist_ok=True)
    (root / 'psy-genesis' / genesis['file']).write_bytes(genesis_bytes)
    print(json.dumps({'output': str(root), 'verifiedSourceFiles': len(manifest['sourceFiles']),
        'config': str(root / 'frozen-build-config.json'), 'network': manifest['network'],
        'baseCommit': manifest['baseCommit'], 'upstreamReleaseVerified': False, 'broadcast': False}))

if __name__ == '__main__':
    main()
