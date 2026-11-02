"""Materialize the user-selected exact audit release; never update a checkout."""
import argparse
import json
from pathlib import Path
from materialize_mainnet_beta import materialize
FREEZE = Path(__file__).resolve().parent / 'audit-20261102'
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['sdk-objects', 'client-objects', 'genesis-objects', 'out']:
        parser.add_argument('--' + name, type=Path, required=True)
    a = parser.parse_args()
    manifest = json.loads((FREEZE / 'manifest.json').read_text())
    assert manifest['sdkCommit'] == '01b8f2b0a077367a7b9879baba1a72aea8ab5510'
    repositories = {'psy-sdk':a.sdk_objects, 'psy-node':a.client_objects,
                    'psy-sdk/psy-genesis':a.genesis_objects, 'psy-node/psy-genesis':a.genesis_objects}
    print(json.dumps(materialize(manifest, repositories, a.out)))
