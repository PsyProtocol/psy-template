"""Prepare application-owned private context lowering against the frozen SDK.

No compiler/SDK source patch, checkout, dependency update, proof or network call.
Outputs are new and external; Cargo is an explicit separate step.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(APP / 'batching/dependencies'))
from prepare_selected_application import selection
from prepare_mainnet_beta_application import prepare


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stage(source, output):
    selected, freeze, selected_hash = selection()
    record = prepare(source, output, test_only=True, freeze=freeze, selected_branch=selected['sdkBranch'])
    output = output.resolve()
    files = {
        'src/private_context.rs': APP / 'token/compiler/private_context.rs',
        'src/private_source_fixture.psy.rs': APP / 'token/wide/private/src/main.psy.rs',
        'src/bin/compile_private.rs': APP / 'token/wide/private/vm-tests/src/bin/compile_private.rs',
        'src/bin/private_fingerprint.rs': APP / 'token/wide/private/vm-tests/src/bin/fingerprint.rs',
        'tests/private_context_privacy.rs': APP / 'token/wide/private/vm-tests/tests/privacy.rs',
        'tests/support/private_full_ups.rs': APP / 'token/wide/private/vm-tests/tests/support/private_full_ups.rs',
        'tests/support/private_stack.rs': APP / 'token/wide/private/vm-tests/tests/support/private_stack.rs',
        'tests/support/private_notes.rs': APP / 'market-client/wallet/native/src/private_notes.rs',
        'tests/support/private_packet.rs': APP / 'token/wide/private/vm-tests/tests/support/private_packet.rs',
    }
    additions = {}
    for name, original in files.items():
        data = original.read_bytes()
        original_hash = sha(data)
        if name == 'src/private_context.rs':
            data = data.replace(b'include_str!("../wide/private/src/main.psy.rs")',
                                b'include_str!("private_source_fixture.psy.rs")')
        if name == 'src/bin/compile_private.rs':
            data = data.replace(b'../../../../../compiler/private_context.rs', b'../private_context.rs')
        if name == 'tests/support/private_packet.rs':
            data = data.replace(b'../../../../../../market-client/wallet/native/src/private_notes.rs', b'private_notes.rs')
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as f:
            f.write(data)
        additions[name] = {'source': str(original.relative_to(APP)),
                           'sourceSha256': original_hash, 'stagedSha256': sha(data)}
    with (output / 'Cargo.toml').open('a') as f:
        f.write('\n[[bin]]\nname = "compile_private"\npath = "src/bin/compile_private.rs"\n')
        f.write('\n[[bin]]\nname = "private_fingerprint"\npath = "src/bin/private_fingerprint.rs"\n')
    record = {'schema': 1, 'profile': 'private-context-dpn-v2', 'selection': selected,
              'selectionSha256': selected_hash, 'application': record,
              'applicationAdditions': additions, 'sdkSourcePatches': [],
              'financialOperations': 0, 'proofs': 0}
    with (output / 'PRIVATE-COMPILER-SOURCE.json').open('x') as f:
        json.dump(record, f, indent=2)
        f.write('\n')
    return record


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(stage(a.source, a.out)))
