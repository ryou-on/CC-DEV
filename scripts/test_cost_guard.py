import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('cost_guard.py'))
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class CostGateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.put('public/index.html', '<h1>Static</h1>')

    def put(self, path, value):
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(value)

    def codes(self):
        return {f['rule'] for f in guard.scan(self.root)[0]}

    def policy(self):
        return dict(schemaVersion=1, reviewedSourceSha256=guard.scan(self.root)[1],
                    reviewer='test reviewer', reviewedOn='2026-10-05', expiresOn='2026-10-20',
                    currency='JPY', monthlyBudget=1000, stopThreshold=700,
                    controls={k: dict(verified=True, evidence='Test fixture only: recorded verification evidence') for k in guard.CONTROLS})

    def check(self, p):
        return guard.validate_policy(p, guard.scan(self.root)[1], dt.date(2026, 10, 5))

    def test_anonymous_write_multiline(self):
        self.put('firestore.rules', 'allow read,\n write: if true;')
        self.assertIn('PUBLIC_WRITE', self.codes())

    def test_comments_do_not_trigger(self):
        self.put('firestore.rules', '// allow write: if true;\n/* allow write: if true; */\nallow write: if false;')
        self.assertNotIn('PUBLIC_WRITE', self.codes())

    def test_fail_open_and_closed(self):
        self.put('functions/a.js', "try {} catch (e) {console.error('rate limit bookkeeping failed', e);}")
        self.assertIn('QUOTA_FAIL_OPEN', self.codes())
        self.put('functions/a.js', "try {} catch (e) {console.error('rate limit bookkeeping failed', e); throw e;}")
        self.assertNotIn('QUOTA_FAIL_OPEN', self.codes())

    def test_cache_buster(self):
        self.put('public/app.js', "fetch('data.json?v=' + Date.now())")
        self.assertIn('CACHE_BUSTER', self.codes())

    def test_public_large_file(self):
        self.put('public/huge.bin', 'x' * 1_000_001)
        self.assertIn('LARGE_PUBLIC_FILE', self.codes())

    def test_symlinks_fail_closed(self):
        (self.root / 'link').symlink_to(self.root / 'public', target_is_directory=True)
        with self.assertRaises(ValueError):
            guard.scan(self.root)

    def test_source_hash_changes_with_asset(self):
        before = guard.scan(self.root)[1]
        self.put('public/image.bin', 'changed')
        self.assertNotEqual(before, guard.scan(self.root)[1])

    def test_valid_review(self):
        self.assertEqual([], self.check(self.policy()))

    def test_source_change_blocks_previous_review(self):
        p = self.policy()
        self.put('functions/new-api.js', 'exports.newApi = onRequest(handler)')
        self.assertTrue(self.check(p))

    def test_missing_verification_blocks(self):
        p = self.policy()
        p['controls']['automaticStop']['verified'] = False
        self.assertTrue(self.check(p))

    def test_expired_or_future_or_long_review_blocks(self):
        for key, value in [('expiresOn', '2026-10-04'), ('reviewedOn', '2026-10-06'), ('expiresOn', '2027-01-01')]:
            p = self.policy(); p[key] = value
            self.assertTrue(self.check(p))

    def test_invalid_amounts_block(self):
        for value in [0, -1, True, '1000', None, float('inf'), float('nan')]:
            p = self.policy(); p['monthlyBudget'] = value
            self.assertTrue(self.check(p))
        p = self.policy(); p['stopThreshold'] = 1000
        self.assertTrue(self.check(p))

    def test_cli_blocks_missing_policy(self):
        r = subprocess.run([sys.executable, str(Path(guard.__file__)), '--root', str(self.root), '--check'], capture_output=True)
        self.assertEqual(1, r.returncode)

    def test_cli_blocks_malformed_policy(self):
        self.put('cost-safety.json', '[]')
        r = subprocess.run([sys.executable, str(Path(guard.__file__)), '--root', str(self.root), '--check'], capture_output=True)
        self.assertEqual(2, r.returncode)

    def test_errors_cannot_be_waived_by_review(self):
        self.put('firestore.rules', 'allow write: if true;')
        p = self.policy()
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
        p.update(reviewedOn=today.isoformat(), expiresOn=today.isoformat())
        self.put('cost-safety.json', json.dumps(p))
        r = subprocess.run([sys.executable, str(Path(guard.__file__)), '--root', str(self.root), '--check'], capture_output=True)
        self.assertEqual(1, r.returncode)


if __name__ == '__main__':
    unittest.main()
