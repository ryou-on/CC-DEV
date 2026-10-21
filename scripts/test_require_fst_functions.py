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

    def test_active_functions_pass(self):
        def fetch(name):
            return 200, {'name': name, 'state': 'ACTIVE'}
        gate.require_active(gate.REQUIRED, fetch)

    def test_missing_or_inactive_function_stops_deploy(self):
        def fetch(name):
            if name == 'recordFstAnalytics':
                return 404, {'error': {'status': 'NOT_FOUND'}}
            if name == 'submitFstSurveyAnswer':
                return 200, {'state': 'DEPLOYING'}
            return 200, {'state': 'ACTIVE'}
        with self.assertRaises(SystemExit) as caught:
            gate.require_active(gate.REQUIRED, fetch)
        message = str(caught.exception)
        self.assertIn('recordFstAnalytics', message)
        self.assertIn('submitFstSurveyAnswer', message)
        self.assertIn('status=404', message)
        self.assertIn('state=DEPLOYING', message)


if __name__ == '__main__':
    unittest.main()
