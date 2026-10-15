"""Decide whether a budget alert would stop CC-DEV. No network and no cloud writes."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BUDGET_JPY = 1000
STOP_JPY = 800
BILLING_ACCOUNT = "018CD7-29C438-31FEC4"
BUDGET_ID = "5629c6af-5042-4d68-926e-e76a5b0b4a26"
TOPIC = "//pubsub.googleapis.com/projects/cc-dev-ps7/topics/cc-dev-budget-alerts"
LA = ZoneInfo("America/Los_Angeles")
SITES = ["cc-dev-ps7", "lobby-personal", "ps7-corporate", "yt-log-ps7"]
RUN = [
    "hondokondl", "hondokocover", "hondokoamazon", "hondokoanalyze", "minimegenerate",
    "assetserve", "interpretercall", "anthropicproxy", "realtimetoken",
]


def _la_day(value):
    if isinstance(value, datetime):
        moment = value
    else:
        moment = datetime.fromisoformat(str(value))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=LA)
    return moment.astimezone(LA).strftime("%Y-%m-%d")


def decide(event, now):
    """Return would_stop or ignored. Mirrors the predicates emitted by generate.py."""
    try:
        if now.tzinfo is None:
            return "ignored"
        if event.get("type") != "google.cloud.pubsub.topic.v1.messagePublished":
            return "ignored"
        if event.get("source") != TOPIC:
            return "ignored"
        message = event["data"]["message"]
        attrs = message["attributes"]
        payload = message["payload"]
        publish = datetime.fromisoformat(message["publishTime"])
        if publish.tzinfo is None:
            return "ignored"
        if attrs.get("billingAccountId") != BILLING_ACCOUNT:
            return "ignored"
        if attrs.get("budgetId") != BUDGET_ID:
            return "ignored"
        if attrs.get("schemaVersion") != "1.0":
            return "ignored"
        if payload.get("currencyCode") != "JPY":
            return "ignored"
        if payload.get("budgetAmount") != BUDGET_JPY:
            return "ignored"
        if payload.get("budgetAmountType") != "SPECIFIED_AMOUNT":
            return "ignored"
        cost = payload.get("costAmount")
        if isinstance(cost, bool) or not isinstance(cost, (int, float)):
            return "ignored"
        if cost < STOP_JPY:
            return "ignored"
        if publish > now + timedelta(seconds=300) or publish < now - timedelta(seconds=86400):
            return "ignored"
        if _la_day(payload.get("costIntervalStart")) != _la_day(now)[:7] + "-01":
            return "ignored"
        return "would_stop"
    except (KeyError, TypeError, ValueError):
        return "ignored"


def stop_effect():
    """What a would_stop alert is built to change. This does not call Google APIs."""
    return {
        "status": "would_stop",
        "budgetJPY": BUDGET_JPY,
        "thresholdJPY": STOP_JPY,
        "latch": {"path": "costControls/global", "enabled": False, "reason": f"budget-{STOP_JPY}JPY"},
        "hostingSiteDisable": list(SITES),
        "cloudRunPublicInvokersRemoved": list(RUN),
        "rulesReplacedWithDeny": ["firestore", "storage"],
        "spendingContinues": False,
    }
