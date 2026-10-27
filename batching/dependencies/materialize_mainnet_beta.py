"""Reconstruct the selected mainnet-beta SDK/client sources without source patches.

Only writes a fresh output directory. Never changes Node, SDK working trees,
existing evidence, wallet state, package versions, runtime or contract state.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

FREEZE = Path(__file__).resolve().parent / 'mainnet-beta-20261027'


def read_archive(data, destination):
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive.getmembers():
            name = Path(member.name)
            if (name.is_absolute() or '..' in name.parts
                    or not (member.isfile() or member.isdir())):
                raise ValueError('unsupported archive member: ' + member.name)
        archive.extractall(destination)


def verify(root, pin):
    for name, expected in pin['sourceFiles'].items():
        path = root / name
        if (path.is_symlink() or not path.is_file()
                or hashlib.sha256(path.read_bytes()).hexdigest() != expected):
            raise ValueError('upstream source differs: ' + pin['path'] + '/' + name)


def materialize(manifest, repositories, output):
    output = output.absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('output must not exist; preserve original artifacts')
    for repository in repositories.values():
        if output.resolve().is_relative_to(repository.resolve()):
            raise ValueError('output must be outside original source repositories')
    # Resolve every exact object before creating output; never fetch or follow a branch.
    archives = []
    for pin in manifest['sourcePins']:
        repository = repositories[pin['path']]
        archives.append((pin, subprocess.check_output(
            ['git', '-C', str(repository), 'archive', pin['commit']])))
    output.mkdir(parents=True)
    for pin, archive in archives:
        root = output / pin['path']
        root.mkdir(parents=True, exist_ok=True)
        read_archive(archive, root)
        verify(root, pin)
    return {'sdkCommit': manifest['sdkCommit'], 'clientCommit': manifest['clientCommit'],
            'verifiedSourceFiles': sum(len(pin['sourceFiles']) for pin in manifest['sourcePins']),
            'upstreamSourcePatches': [], 'financialReady': False, 'networkRequests': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-objects', required=True, type=Path)
    parser.add_argument('--client-objects', required=True, type=Path)
    parser.add_argument('--genesis-objects', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads((FREEZE / 'manifest.json').read_text())
    repositories = {'psy-sdk': args.sdk_objects, 'psy-node': args.client_objects,
                    'psy-sdk/psy-genesis': args.genesis_objects,
                    'psy-node/psy-genesis': args.genesis_objects}
    print(json.dumps(materialize(manifest, repositories, args.out)))


if __name__ == '__main__':
    main()
