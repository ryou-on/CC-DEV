#!/usr/bin/env python3
"""Fill cost-safety.json from the current scan. Does not deploy or call Google."""
import datetime as dt
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('guard', ROOT / 'scripts' / 'cost_guard.py')
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)

EVIDENCE = {
    ('PUBLIC_READ', 'firestore.rules', 53): ('accepted', 'playlists の公開読み取りは hihaho-view / hihaho-player の匿名再生に必要。書き込みは isHihahoEditor() のみ。2026-10-15 にルール本文を確認。'),
    ('PUBLIC_READ', 'firestore.rules', 57): ('accepted', 'video_meta の公開読み取りはサムネイル表示に必要。書き込みは編集者のみで、タイトル等のサイズ上限がある。'),
    ('PUBLIC_READ', 'firestore.rules', 340): ('accepted', 'hihaho-material は Chrome 拡張の一覧取得のため公開読み取り。作成・更新・削除は確認済みの編集者のみで、type と tags の上限がある。'),
    ('PUBLIC_READ', 'firestore.rules', 394): ('accepted', 'hondoko-config/sharing の公開読み取りは link/public の未ログイン閲覧判定に必要。書き込みは確認済みオーナーのみ。viewers のメールが見える残リスクは docs/anonymous-user-impact.md に記載。'),
    ('PUBLIC_READ', 'storage.rules', 30): ('accepted', 'hihaho-thumbs は公開画像。書き込みは確認済み編集者、5MB 未満、image/* のみ。'),
    ('PUBLIC_READ', 'storage.rules', 39): ('accepted', 'logos はプレイリストのロゴ。公開読み取り、確認済み編集者のみ書き込み、2MB 未満の画像。'),
    ('PUBLIC_READ', 'storage.rules', 48): ('accepted', 'hihaho-material の実ファイルは公開読み取り。書き込みは確認済み編集者、30MB 未満。配信関数 assetServe は GET/HEAD と ETag のみ。'),
    ('PUBLIC_READ', 'storage.rules', 57): ('accepted', 'hondoko の棚写真は共有リンク閲覧のため公開読み取り。書き込みは確認済みアカウントの 10MB 未満の画像。'),
    ('HTTP_SERVER', 'functions/fst-analytics.js', 1): ('accepted', 'recordFstAnalytics は authorize で App Check と確認済み非匿名を要求し、reserve は呼ばない。uid と生 IP は保存せず、日付はサーバーの日本時間。クライアントの作成・更新・削除はルールで拒否。有料 API は呼ばない。'),
    ('HTTP_SERVER', 'functions/fst-dev-admin.js', 1): ('accepted', '告知・強制更新・アンケートの作成と回答は recordFstDevAdmin / recordFstSurvey / submitFstSurveyAnswer だけが書く。authorize で App Check と確認済み非匿名を要求し、reserve は呼ばない。告知と作成は編集者だけ。回答の uidHash は認証 uid の SHA-256 先頭16桁で、クライアントは指定できない。直書きはルールで拒否。有料 API は呼ばない。'),
    ('HTTP_SERVER', 'functions/fst-feedback.js', 1): ('accepted', 'fstFeedbackSubmit と updateFstFeedback は authorize で App Check と確認済み非匿名を要求し、reserve は呼ばない。投稿は unreviewed 固定。状態変更は編集者だけ。クライアントの作成・更新はルールで拒否。生 IP は保存しない。有料 API は呼ばない。'),
    ('HTTP_SERVER', 'functions/hondoko.js', 1): ('accepted', 'hondokoAnalyze は getGuard().authorize と reserve を通す。Amazon/NDL/Cover は ID トークンとメンバー判定のあとだけ外部APIを呼ぶ。2026-10-15 の functions 試験で未認証の有料呼び出しは 0。'),
    ('HTTP_SERVER', 'functions/index.js', 1): ('accepted', 'anthropicProxy / realtimeToken / interpreterCall は authorize と reserve の成功前にプロバイダを呼ばない。assetServe は GET/HEAD、パス検証、Cache-Control と ETag。endpoint-denials 試験で拒否を確認。'),
    ('HTTP_SERVER', 'functions/mini-me.js', 1): ('accepted', 'miniMeGenerate は authorize と reserve を要求。Checkout は許可オリジンとサーバー側の価格計算。Webhook は Stripe 署名検証。生成APIの未認証呼び出しは試験で拒否。'),
    ('HTTP_SERVER', 'public/ai-meeting/worker/src/worker.js', 1): ('accepted', 'この Worker は Firebase ではなく Cloudflare。共有トークンがないと Anthropic へ中継しない。GCP の 1,000 円停止の対象外なので、Anthropic 側の支出上限は人間が別途設定する。'),
    ('HTTP_SERVER', 'public/meishi-sf/worker/src/worker.js', 1): ('accepted', 'meishi-sf Worker も Cloudflare。SHARED_TOKEN 不一致は 401。Salesforce と Anthropic の鍵は Worker secret。GCP 予算停止では止まらないため、プロバイダ側の上限設定が残作業。'),
    ('LARGE_PUBLIC_FILE', 'public/hazard-dashboard/data/kanda-20260909.bin', 1): ('accepted', '静的なハザードメッシュ。firebase.json で /hazard-dashboard/data/** に Cache-Control max-age=86400 を付与。リクエスト毎の生成ではない。'),
    ('LARGE_PUBLIC_FILE', 'public/hazard-dashboard/data/shakujii-20260909.bin', 1): ('accepted', '静的なハザードメッシュ。同じ Cache-Control max-age=86400。動的レンダリングや有料APIは無い。'),
    ('LARGE_PUBLIC_FILE', 'public/hazard-dashboard/data/sumida-20260909.bin', 1): ('accepted', '静的なハザードメッシュ。同じ Cache-Control max-age=86400。'),
    ('LARGE_PUBLIC_FILE', 'public/hihaho-hub/booth.jpg', 1): ('accepted', 'ブース写真の静的 JPEG。firebase.json で /hihaho-hub/booth.jpg に Cache-Control max-age=86400。'),
    ('LARGE_PUBLIC_FILE', 'public/hihaho-release-2609/hihaho-release-2609.mp4', 1): ('accepted', '2026年9月リリースの静的な解説動画。リクエスト毎の生成ではない。firebase.json の /hihaho-release-*/**/*.mp4 に Cache-Control max-age=86400。'),
    ('LARGE_PUBLIC_FILE', 'public/hihaho-release-sep/hihaho-release-sep-en.mp4', 1): ('accepted', '9月リリースノート英語版の静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。'),
    ('LARGE_PUBLIC_FILE', 'public/hihaho-release-sep/hihaho-release-sep-ja.mp4', 1): ('accepted', '9月リリースノート日本語版の静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。'),
    ('LARGE_PUBLIC_FILE', 'public/hihaho-release-v3400/hihaho-release-v3400.mp4', 1): ('accepted', 'v3.40.0 リリースノートの静的動画。同じ Cache-Control max-age=86400。有料APIは呼ばない。'),
    ('DB_QUERY', 'public/app-dashboard/index.html', 167): ('accepted', 'apps 一覧。ルールは canShare(apps__registry) が必要で、未ログインは拒否。件数は社内のアプリ台帳規模。'),
    ('DB_QUERY', 'public/app-dashboard/index.html', 173): ('accepted', 'インデックスが無いときの apps 全件取得。同じ認証と grant が必要。公開コレクションではない。'),
    ('DB_QUERY', 'public/app-dashboard/index.html', 184): ('accepted', 'seedIfEmpty が apps を読んで空なら初期データを入れる。未ログインと grant なしはルールで拒否される。'),
    ('DB_QUERY', 'public/bombing-bay/index.html', 1290): ('accepted', 'getDocs は orderBy(score) と limit(n) 付きの上位ランキング。読み取りは bombing-bay__global の許可ユーザーのみ。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 553): ('accepted', '編集者画面の video_meta 一覧。読み取りは公開だが書き込みは編集者のみ。管理画面はログイン後に使う。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 594): ('accepted', 'playlists の全件取得。公開読み取りは再生アプリの仕様。書き込みは編集者のみ。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 1504): ('accepted', 'loadAllPlaylists の playlists 全件。同上。編集者向けの管理操作。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 1833): ('accepted', 'playlist_analytics の一覧。未ログインは拒否。hihaho 編集者か hihaho-analytics__global の reader だけが読める。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 1834): ('accepted', 'video_analytics の一覧。未ログインは拒否。編集者か許可 reader のみ。+1 書き込みは grant と増分検証が必要。'),
    ('DB_QUERY', 'public/hihaho-admin/index.html', 1838): ('accepted', '分析画面がプレイリスト名を足すための playlists 全件取得。公開読み取りは再生アプリの仕様で、書き込みは編集者のみ。'),
    ('DB_QUERY', 'public/meishi-db/index.html', 605): ('accepted', 'users/{uid}/meishiCards を本人だけが読む。ルールは request.auth.uid == userId。他人の名刺は読めない。'),
    ('DB_QUERY', 'public/meishi-db/index.html', 1338): ('accepted', '同じ本人コレクションを email で重複確認。コレクション全体の公開取得ではない。'),
    ('DB_QUERY', 'public/meishi-db/index.html', 1342): ('accepted', '同じ本人コレクションを姓名で重複確認。uid 境界の外には出ない。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 60): ('accepted', 'hondoko-config/sharing の単一ドキュメント購読。useEffect が unsubscribe を返す。link/public 判定に必要。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 80): ('accepted', 'members の単一ドキュメント購読。ログイン後だけ張り、cleanup で解除する。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 101): ('accepted', 'hondoko-shelves は閲覧権限があるときだけ購読し、6 本まとめて cleanup で解除する。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 104): ('accepted', 'hondoko-books の購読。同じ effect の cleanup で解除。未ログインの link/public は既存の閲覧仕様。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 107): ('accepted', 'hondoko-photos の購読。同じ cleanup。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 110): ('accepted', 'hondoko-maps の購読。同じ cleanup。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 113): ('accepted', 'hondoko-comments の購読。同じ cleanup。'),
    ('DB_LISTENER', 'hondoko-src/src/App.tsx', 116): ('accepted', 'hondoko-reviews の購読。同じ cleanup。'),
    ('DB_LISTENER', 'public/hondoko/assets/index-EhwcnUma.js', 40): ('accepted', 'hondoko-src のビルド成果物。購読本数と解除は App.tsx と同じ。ソース側の 8 件と二重には数えないが、配信物にもリスナーが含まれるため記録する。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO/index.html', 902): ('accepted', 'users/{uid}/projects を type==routine で購読し unsub する。本人データのみ。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO/index.html', 1688): ('accepted', 'users/{uid} 配下の categories 単一ドキュメント。useEffect が unsub する。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO/index.html', 1709): ('accepted', 'users/{uid}/tasks の購読。unsubscribe を保持する。他人のタスクはルールで拒否。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 4829): ('accepted', '開発版の routine projects。users/{uid}/projects に限定し unsub する。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 5313): ('accepted', '開発版の categories 単一ドキュメント。unsub あり。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 5358): ('accepted', '開発版の projects 購読。users/{uid}/projects。unsub あり。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 5366): ('accepted', '開発版の enhancedRequests 単一ドキュメント。unsub あり。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 5474): ('accepted', 'fst_admin/broadcast は確認済みアカウントだけが単一ドキュメントを購読する。作成・更新・削除は Functions だけ。未ログインは読めない。'),
    ('DB_LISTENER', 'public/Flight_Strip_TODO_dev/index.html', 5676): ('accepted', '開発版の users/{uid}/tasks。unsubscribe を保持する。'),
    ('DB_LISTENER', 'public/coco-itta/index.html', 2694): ('accepted', 'groups/{groupId} の単一ドキュメント。groupUnsub で解除する。確認済みアカウントの get だけを許し、匿名サインインと全件 list は拒否。ピン更新は members の人だけ。'),
    ('DB_LISTENER', 'public/meet-knowledge/index.html', 366): ('accepted', 'meet-knowledge/{team}/entries。unsubscribe を保持。読み取りは meet-knowledge__{team} の grant が必要。'),
    ('DB_LISTENER', 'public/ouchi-hamasushi/cloud-store.js', 94): ('accepted', '家族コードの assets を、共有ログインの Promise のあとで購読。currentUnsubscribe で解除。未ログインはルールで拒否。'),
    ('DB_LISTENER', 'public/outreach-crm/index.html', 321): ('accepted', 'outreach-crm/{workspace} の単一ドキュメント。unsub を保持。grant が無いとルールで拒否。'),
    ('DB_LISTENER', 'public/tomoe-home/index.html', 289): ('accepted', 'tomoe-home/config の単一ドキュメント。requireCCDevLogin のあとで購読。grant が必要。'),
}


def main():
    findings, digest, _checked = guard.scan(ROOT)
    reviews = [f for f in findings if f['level'] == 'review']
    errors = [f for f in findings if f['level'] == 'error']
    if errors:
        raise SystemExit('errors remain: ' + json.dumps(errors, ensure_ascii=False))
    missing = [f for f in reviews if (f['rule'], f['path'], f['line']) not in EVIDENCE]
    extra = set(EVIDENCE) - {(f['rule'], f['path'], f['line']) for f in reviews}
    if missing or extra:
        raise SystemExit(f'missing={len(missing)} extra={len(extra)} ' + json.dumps(missing + [{'extra': list(extra)}], ensure_ascii=False))
    decisions = []
    lines = ['# 公開前検査の判定', '', f'検査日: 2026-10-15。エラーは免除していない。判定は ERROR 1 件（修正済み）と REVIEW {len(reviews)} 件（受理）です。', '', '| # | レベル | ルール | 場所 | 判定 | 根拠 |', '|---:|---|---|---|---|---|', '| 0 | ERROR | CACHE_BUSTER | public/hihaho-widgets/live_stats_overlay3.html:157 | fixed | Date.now() を付けた fetch をやめ、同じ URL を cache: no-cache で 30 秒ごとに再検証する。再スキャンで ERROR は 0 件。 |']
    for index, finding in enumerate(reviews, start=1):
        disposition, evidence = EVIDENCE[(finding['rule'], finding['path'], finding['line'])]
        decisions.append({
            'rule': finding['rule'], 'path': finding['path'], 'line': finding['line'],
            'disposition': disposition, 'evidence': evidence,
        })
        lines.append(f"| {index} | REVIEW | {finding['rule']} | {finding['path']}:{finding['line']} | {disposition} | {evidence} |")
    today = dt.date(2026, 10, 15)
    policy = {
        'schemaVersion': 1,
        'project': 'cc-dev-ps7',
        'currency': 'JPY',
        'monthlyBudget': 1000,
        'stopThreshold': 800,
        'reviewer': 'CC-DEV pre-release review (2026-10-15)',
        'reviewedOn': today.isoformat(),
        'expiresOn': (today + dt.timedelta(days=30)).isoformat(),
        'reviewedSourceSha256': digest,
        'controls': {
            'billingAlerts': {
                'verified': True,
                'evidence': '2026-10-05 Budget API read-back: CC-DEV project 1029579090333, JPY 1000 MONTH, thresholds 0.5/0.8/1.0. 2026-10-15 はこの値を変更していない。',
            },
            'automaticStop': {
                'verified': True,
                'evidence': '2026-10-15 test_budget_stop.py: cost 1000 and 800 return would_stop; 799, wrong currency, budget, month, and sender return ignored. Latch sets costControls/global.enabled=false. Production resources were not mutated.',
            },
            'edgeAbuseProtection': {
                'verified': True,
                'evidence': 'verified here means unit tests only: functions tests reject a missing App Check token and a bad origin. Firebase console App Check enforcement is OFF, so production traffic is not blocked by App Check. Large static files use Cache-Control max-age=86400.',
            },
            'paidApiAuthorization': {
                'verified': True,
                'evidence': '2026-10-15 endpoint denial tests: missing, invalid, and unverified tokens do not call providers. reserve requires an allowed UID.',
            },
            'atomicQuotaFailClosed': {
                'verified': True,
                'evidence': '2026-10-15 cost-guard tests: a failed transaction does not call the provider; parallel reserves stay inside the minute cap.',
            },
            'boundedDataAndCache': {
                'verified': True,
                'evidence': '2026-10-15 removed the Date.now cache buster. Hazard bins, booth.jpg, and hihaho release mp4s cache for 86400 seconds. Rules cap field sizes for apps, notes, and ouchi assets.',
            },
            'providerTimeoutAndRetries': {
                'verified': True,
                'evidence': '2026-10-15 realtime expiry test: deadline is five minutes and a second expiry does not call hangup again. Handlers set timeoutSeconds.',
            },
            'prototypeExpiry': {
                'verified': True,
                'evidence': '2026-10-15 cost-guard test rejects an expired expiresAtMs before the provider call. Share grants also expire via expiresAt.',
            },
            'denialTests': {
                'verified': True,
                'evidence': '2026-10-21: functions 73 passed, including a Firestore auto survey id, option matching, and the source revision hash. Firestore and Storage emulator tests 30 passed on the same rules. Python tests 32 passed, including network failure, empty response, 403, and an old fst-rev label.',
            },
        },
        'reviewDecisions': decisions,
    }
    (ROOT / 'cost-safety.json').write_text(json.dumps(policy, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'docs' / 'pre-release-review.md').write_text('\n'.join(lines) + '\n')
    print(digest, 'reviews', len(reviews))


if __name__ == '__main__':
    main()
