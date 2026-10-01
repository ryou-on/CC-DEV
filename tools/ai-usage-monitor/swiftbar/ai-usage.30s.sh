#!/bin/bash
# <swiftbar.title>AI Usage</swiftbar.title>
# <swiftbar.refreshOnOpen>true</swiftbar.refreshOnOpen>
# SwiftBar / xbar 用プラグイン（30秒ごとに更新）。~/Library/Application Support/SwiftBar/Plugins にコピー
URL="http://127.0.0.1:7777"
J=$(curl -s --max-time 3 "$URL/api/usage")
if [ -z "$J" ]; then echo "AI ⚠️"; echo "---"; echo "サーバー未起動 | color=red"; exit 0; fi

/usr/bin/python3 - "$J" "$URL" <<'PY'
import json, sys, time
d = json.loads(sys.argv[1]); url = sys.argv[2]
ab = {"claude": "C", "codex": "X", "chatgpt": "G"}
def icon(p): return "🔴" if p >= 90 else "🟡" if p >= 70 else "🟢"
def bar(p): n = round(p / 10); return "█" * n + "░" * (10 - n)
def left(t):
    if not t: return ""
    m = max(0, int(t / 1000 - time.time()) // 60)
    return f" ⏱{m//60}h{m%60}m"
title = []
for s in d["services"]:
    w = s["windows"][0] if s["windows"] else None
    title.append(f'{ab[s["id"]]} {w["percent"]:.0f}%' if w else f'{ab[s["id"]]} -')
print(" ".join(title))
print("---")
for s in d["services"]:
    print(f'{s["name"]} | font=Menlo-Bold')
    for w in s["windows"]:
        print(f'{icon(w["percent"])} {w["label"]} {bar(w["percent"])} {w["percent"]:.0f}%{left(w.get("resetsAt"))} | font=Menlo size=12')
    if not s["windows"]: print("データなし | color=gray")
    print("---")
print(f"ダッシュボードを開く | href={url}")
print("更新 | refresh=true")
PY
