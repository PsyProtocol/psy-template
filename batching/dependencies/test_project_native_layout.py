"""Projection regression tests; authentication requires the separate Rust check."""
import copy
import unittest
from project_native_layout import project


class NativeLayoutProjection(unittest.TestCase):
    def fixture(self):
        return {'contract': {'state_tree_height': 32, 'state': [
            {'name': 'balance', 'type': {'kind': 'primitive', 'name': 'Felt'},
             'offset': 0, 'felt_size': 1}]}, 'types': []}

    def test_layout_only_projection(self):
        source = self.fixture()
        source['contract']['methods'] = [{'name': 'untrusted_old_method'}]
        before = copy.deepcopy(source)
        result = project(source)
        self.assertEqual(source, before)
        self.assertNotIn('methods', result['contract'])
        self.assertEqual(result['contract']['state_layout']['fields'][0]['field_id'], 1)
        self.assertEqual(result['contract']['state_layout']['slot_count'], 1)

    def test_bad_offsets_sizes_identity_and_implicit_padding(self):
        for field, value in [('offset', 1), ('offset', 0.0), ('felt_size', 0),
                             ('felt_size', -1), ('felt_size', True), ('felt_size', 1.0)]:
            with self.subTest(field=field, value=value):
                source = self.fixture()
                source['contract']['state'][0][field] = value
                with self.assertRaises(ValueError):
                    project(source)
        for mutate in [lambda s: s['contract'].update(state_tree_height=31),
                       lambda s: s['contract'].update(state_tree_height=32.0),
                       lambda s: s['contract'].update(state=[]),
                       lambda s: s['contract'].update(state_layout={})]:
            source = self.fixture()
            mutate(source)
            with self.assertRaises(ValueError):
                project(source)
        source = self.fixture()
        source['contract']['state'].append({'name': 'map', 'offset': 1, 'felt_size': 4,
                                            'type': {'kind': 'map', 'alignment_felts': 4}})
        with self.assertRaisesRegex(ValueError, 'padding'):
            project(source)


if __name__ == '__main__':
    unittest.main()
