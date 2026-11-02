"""Snapshot application sources against the exact audit source freeze."""
import argparse
import json
from pathlib import Path
from materialize_audit import FREEZE
from prepare_mainnet_beta_application import prepare
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--test-only', action='store_true')
    a = parser.parse_args()
    print(json.dumps(prepare(a.source, a.out, a.test_only, freeze=FREEZE)))
