import importlib.util
import urllib.error
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('gate', Path(__file__).with_name('require_fst_functions.py'))
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)

REV = 'a' * 32


class RequireFstFunctionsTest(unittest.TestCase):
    def test_required_names_cover_feedback_analytics_and_dev_admin(self):
        self.assertEqual(gate.REQUIRED, (
            'fstFeedbackSubmit',
            'updateFstFeedback',
            'recordFstAnalytics',
            'recordFstDevAdmin',
            'recordFstSurvey',
            'submitFstSurveyAnswer',
        ))

    def _ok(self, name):
        return 200, {
            'name': name,
            'state': 'ACTIVE',
            'updateTime': '2026-10-21T01:00:00Z',
            'labels': {'fst-rev': REV},
            'buildConfig': {'source': {'storageSource': {'generation': '9'}}},
        }

    def test_expected_rev_matches_the_function_source_hash(self):
        rev = gate.expected_rev()
        self.assertEqual(len(rev), 32)
        self.assertTrue(all(ch in '0123456789abcdef' for ch in rev))

    def test_active_functions_pass_when_the_revision_matches(self):
        notes = gate.require_active(gate.REQUIRED, lambda name: self._ok(name), REV)
        self.assertIn(
            f'fstFeedbackSubmit updateTime=2026-10-21T01:00:00Z fst-rev={REV} sourceGeneration=9',
            notes,
        )

    def test_missing_or_inactive_function_stops_deploy(self):
        def fetch(name):
            if name == 'recordFstAnalytics':
                return 404, {'error': {'status': 'NOT_FOUND'}}
            if name == 'submitFstSurveyAnswer':
                return 200, {'state': 'DEPLOYING', 'updateTime': '2026-10-21T01:00:00Z', 'labels': {'fst-rev': REV}}
            return self._ok(name)
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(gate.REQUIRED, fetch, REV)
        message = str(caught.exception)
        self.assertIn('recordFstAnalytics', message)
        self.assertIn('submitFstSurveyAnswer', message)
        self.assertIn('status=404', message)
        self.assertIn('state=DEPLOYING', message)

    def test_missing_permission_names_the_required_role(self):
        def fetch(name):
            return 403, {'error': {'status': 'PERMISSION_DENIED'}}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(('fstFeedbackSubmit',), fetch, REV)
        self.assertIn('cloudfunctions.functions.get', str(caught.exception))
        self.assertIn('status=403', str(caught.exception))

    def test_empty_forbidden_body_still_names_the_required_role(self):
        for label, body in (('none', None), ('dict', {}), ('text', '')):
            with self.subTest(label):
                with self.assertRaises(SystemExit) as caught:
                    gate.require_active(('recordFstAnalytics',), lambda name: (403, body), REV)
                message = str(caught.exception)
                self.assertIn('cloudfunctions.functions.get', message)
                self.assertIn('status=403', message)
                self.assertNotIn('empty-response', message)

    def test_network_failure_empty_response_and_forbidden_all_stop(self):
        cases = [
            ('network', lambda name: (_ for _ in ()).throw(urllib.error.URLError('timed out'))),
            ('empty-none', lambda name: (200, None)),
            ('empty-dict', lambda name: (200, {})),
            ('empty-text', lambda name: (200, '')),
            ('forbidden', lambda name: (403, {'error': {'status': 'PERMISSION_DENIED'}})),
        ]
        for label, fetch in cases:
            with self.subTest(label):
                with self.assertRaises(SystemExit) as caught:
                    gate.require_active(('recordFstAnalytics',), fetch, REV)
                self.assertIn('recordFstAnalytics', str(caught.exception))

    def test_an_old_revision_label_does_not_pass(self):
        def fetch(name):
            status, body = self._ok(name)
            body['labels'] = {'fst-rev': 'b' * 32}
            return status, body
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(('fstFeedbackSubmit',), fetch, REV)
        message = str(caught.exception)
        self.assertIn('fst-rev=' + ('b' * 32), message)
        self.assertIn('expected=' + REV, message)

    def test_active_without_update_time_is_not_enough(self):
        def fetch(name):
            return 200, {'state': 'ACTIVE', 'labels': {'fst-rev': REV}}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(('recordFstAnalytics',), fetch, REV)
        self.assertIn('updateTime=None', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
