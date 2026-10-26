import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'public/beta-yaki-note/index.html').read_text()
CONFIG = json.loads((ROOT / 'firebase.beta-yaki.json').read_text())
POLICY = json.loads((ROOT / 'beta-yaki-cost-safety.json').read_text())
WORKFLOW = (ROOT / 'infra/beta-yaki-budget-stop.yaml').read_text()


class BetaYakiIsolationTest(unittest.TestCase):
    def test_hosting_deploys_only_beta_yaki_directory(self):
        self.assertEqual('beta-yaki-note', CONFIG['hosting']['site'])
        self.assertEqual('public/beta-yaki-note', CONFIG['hosting']['public'])
        self.assertNotIn('rewrites', CONFIG['hosting'])
        self.assertNotIn('functions', CONFIG)
        self.assertNotIn('firestore', CONFIG)
        self.assertNotIn('storage', CONFIG)

    def test_app_has_no_network_or_paid_api_entrypoint(self):
        forbidden = [r'\bfetch\s*\(', r'XMLHttpRequest', r'WebSocket\s*\(',
                     r'firebase(?:-app|\.initializeApp)', r'<script[^>]+src\s*=']
        for pattern in forbidden:
            self.assertIsNone(re.search(pattern, HTML, re.I), pattern)

    def test_required_ui_and_loupe_are_present(self):
        for text in ['ベタ焼きノートの使い方', 'ホームへ戻る', 'リリースノート',
                     "APP_VERSION = '0.6.1'", "event.key.toLowerCase() === 'q'"]:
            self.assertIn(text, HTML)

    def test_cost_policy_is_scoped_to_independent_project(self):
        self.assertEqual('beta-yaki-note', POLICY['project'])
        self.assertEqual(15, POLICY['monthlyBudget'])
        self.assertEqual(5, POLICY['stopThreshold'])

    def test_workflow_can_disable_only_beta_yaki_hosting(self):
        endpoints = re.findall(r'https://firebasehosting\.googleapis\.com/[^\s]+', WORKFLOW)
        self.assertEqual(['https://firebasehosting.googleapis.com/v1beta1/sites/beta-yaki-note/releases'], endpoints)
        self.assertNotIn('sites/cc-dev-ps7/releases', WORKFLOW)
        self.assertIn('budgetId == "a081406d-a275-4d4a-a5b6-cbbddd9babce"', WORKFLOW)
        self.assertIn('payload.costAmount >= 791', WORKFLOW)


if __name__ == '__main__':
    unittest.main()
