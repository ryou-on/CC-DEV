import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('gate', Path(__file__).with_name('require_fst_functions.py'))
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


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

    def test_active_functions_pass_and_record_update_time(self):
        def fetch(name):
            return 200, {
                'name': name,
                'state': 'ACTIVE',
                'updateTime': '2026-10-21T01:00:00Z',
                'buildConfig': {'source': {'storageSource': {'generation': '9'}}},
            }
        notes = gate.require_active(gate.REQUIRED, fetch)
        self.assertIn('fstFeedbackSubmit updateTime=2026-10-21T01:00:00Z sourceGeneration=9', notes)

    def test_missing_or_inactive_function_stops_deploy(self):
        def fetch(name):
            if name == 'recordFstAnalytics':
                return 404, {'error': {'status': 'NOT_FOUND'}}
            if name == 'submitFstSurveyAnswer':
                return 200, {'state': 'DEPLOYING', 'updateTime': '2026-10-21T01:00:00Z'}
            return 200, {'state': 'ACTIVE', 'updateTime': '2026-10-21T01:00:00Z'}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(gate.REQUIRED, fetch)
        message = str(caught.exception)
        self.assertIn('recordFstAnalytics', message)
        self.assertIn('submitFstSurveyAnswer', message)
        self.assertIn('status=404', message)
        self.assertIn('state=DEPLOYING', message)

    def test_missing_permission_names_the_required_role(self):
        def fetch(name):
            return 403, {'error': {'status': 'PERMISSION_DENIED'}}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(('fstFeedbackSubmit',), fetch)
        self.assertIn('cloudfunctions.functions.get', str(caught.exception))

    def test_active_without_update_time_is_not_enough(self):
        def fetch(name):
            return 200, {'state': 'ACTIVE'}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(('recordFstAnalytics',), fetch)
        self.assertIn('updateTime=None', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
