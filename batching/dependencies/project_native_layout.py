"""Project historical compiler state fields to a canonical layout candidate.

This is not an authentication decision. The frozen SDK must reconstruct and
compare its layout root/counts with the captured native contract leaf. Historical
method ABI is deliberately omitted; actual bytecode supplies method descriptors.
The original ABI and evidence are never modified.
"""
import argparse
import hashlib
import json
from pathlib import Path


def project(source):
    contract = source['contract']
    if type(contract['state_tree_height']) is not int or contract['state_tree_height'] != 32 or 'state_layout' in contract:
        raise ValueError('historical native state ABI required')
    fields = []
    end = 0
    names = set()
    for i, state in enumerate(contract['state']):
        if type(state['offset']) is not int or state['offset'] != end or state['name'] in names:
            raise ValueError('non-contiguous or duplicate native state fields')
        names.add(state['name'])
        size = state['felt_size']
        if type(size) is not int or size <= 0:
            raise ValueError('positive exact field size required')
        ty = state['type']
        alignment = ty['alignment_felts'] if ty['kind'] == 'map' else 1
        if type(alignment) is not int or alignment <= 0 or alignment & (alignment - 1):
            raise ValueError('invalid field alignment')
        # The old compiler reports payload offsets; preserve any preceding
        # alignment padding as part of the canonical top-level field range.
        padding = (alignment - end % alignment) % alignment
        if padding:
            raise ValueError('unrepresented historical alignment padding')
        fields.append(dict(field_id=i + 1, name=state['name'], type=ty,
                           start_slot=end, payload_offset=0, slot_count=size))
        end += size
    if not fields:
        raise ValueError('native state fields required')
    return dict(contract=dict(state_tree_height=32, state_layout=dict(
        layout_version=1, encoding_version=1, field_count=len(fields),
        slot_count=end, fields=fields)), types=source['types'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('fresh_output', type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    candidate = project(json.loads(raw))
    with args.fresh_output.open('x') as stream:
        stream.write(json.dumps(candidate, indent=2) + '\n')
    print(json.dumps({'sourceSha256': hashlib.sha256(raw).hexdigest(),
                     'projectionSha256': hashlib.sha256(args.fresh_output.read_bytes()).hexdigest(),
                     'authenticated': False, 'financialOperations': 0}))
