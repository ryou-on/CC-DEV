"""Simulate CC-DEV budget alerts. No Google API calls and no billing changes."""
import datetime as dt
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'infrastructure' / 'cost-stop'
DECISION = importlib.util.spec_from_file_location('decision', ROOT / 'decision.py')
decision = importlib.util.module_from_spec(DECISION)
DECISION.loader.exec_module(decision)
GENERATE = importlib.util.spec_from_file_location('generate', ROOT / 'generate.py')
generate = importlib.util.module_from_spec(GENERATE)
GENERATE.loader.exec_module(generate)

NOW = dt.datetime(2026, 10, 15, 18, 0, tzinfo=dt.timezone.utc)
THIS_MONTH = '2026-10-01T15:00:00+00:00'
LAST_MONTH = '2026-09-01T15:00:00+00:00'


def alert(cost, **overrides):
    payload = {
        'currencyCode': 'JPY',
        'budgetAmount': decision.BUDGET_JPY,
        'budgetAmountType': 'SPECIFIED_AMOUNT',
        'costAmount': cost,
        'costIntervalStart': THIS_MONTH,
    }
    payload.update(overrides.pop('payload', {}))
    attributes = {
        'billingAccountId': decision.BILLING_ACCOUNT,
        'budgetId': decision.BUDGET_ID,
        'schemaVersion': '1.0',
    }
    attributes.update(overrides.pop('attributes', {}))
    event = {
        'type': 'google.cloud.pubsub.topic.v1.messagePublished',
        'source': decision.TOPIC,
        'data': {'message': {
            'publishTime': NOW.isoformat(),
            'attributes': attributes,
            'payload': payload,
        }},
    }
    event.update(overrides)
    return event


class BudgetStopTest(unittest.TestCase):
    def test_cap_is_1000_yen_and_alert_at_cap_stops(self):
        self.assertEqual(1000, decision.BUDGET_JPY)
        self.assertEqual('would_stop', decision.decide(alert(1000), NOW))
        self.assertEqual('would_stop', decision.decide(alert(1000.0), NOW))

    def test_threshold_stops_at_800_and_ignores_799(self):
        self.assertEqual('would_stop', decision.decide(alert(800), NOW))
        self.assertEqual('ignored', decision.decide(alert(799), NOW))
        self.assertEqual('ignored', decision.decide(alert(799.99), NOW))

    def test_wrong_budget_currency_month_and_sender_do_not_stop(self):
        cases = [
            alert(1000, payload={'budgetAmount': 5000}),
            alert(1000, payload={'currencyCode': 'USD'}),
            alert(1000, payload={'costIntervalStart': LAST_MONTH}),
            alert(1000, attributes={'budgetId': 'other-budget'}),
            alert(1000, source='//pubsub.googleapis.com/projects/other/topics/alerts'),
            alert(1000, type='google.cloud.pubsub.topic.v1.messageDropped'),
        ]
        for event in cases:
            self.assertEqual('ignored', decision.decide(event, NOW), event)

    def test_stale_or_future_alerts_do_not_stop(self):
        old = alert(1000)
        old['data']['message']['publishTime'] = (NOW - dt.timedelta(hours=25)).isoformat()
        future = alert(1000)
        future['data']['message']['publishTime'] = (NOW + dt.timedelta(minutes=10)).isoformat()
        self.assertEqual('ignored', decision.decide(old, NOW))
        self.assertEqual('ignored', decision.decide(future, NOW))

    def test_stop_effect_latches_spending_off_without_calling_google(self):
        effect = decision.stop_effect()
        self.assertEqual(False, effect['latch']['enabled'])
        self.assertEqual(False, effect['spendingContinues'])
        self.assertEqual(1000, effect['budgetJPY'])
        self.assertIn('cc-dev-ps7', effect['hostingSiteDisable'])
        self.assertIn('realtimetoken', effect['cloudRunPublicInvokersRemoved'])
        self.assertEqual(['firestore', 'storage'], effect['rulesReplacedWithDeny'])

    def test_generated_workflow_uses_the_same_cap_and_latch(self):
        workflow = json.dumps(generate.build({'firestore': 'projects/x/rulesets/deny-fs', 'storage': 'projects/x/rulesets/deny-st'}))
        self.assertIn('payload.budgetAmount == 1000', workflow)
        self.assertIn('payload.costAmount >= 800', workflow)
        self.assertIn('budget-800JPY', workflow)
        self.assertIn('"enabled": {"booleanValue": false}', workflow)
        self.assertNotIn('firebase deploy', workflow)


if __name__ == '__main__':
    unittest.main()
