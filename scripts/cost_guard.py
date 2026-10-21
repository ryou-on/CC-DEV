#!/usr/bin/env python3
"""KIKAKU7 cost gate v1.0.0. Offline heuristics + expiring, source-bound review.

No network requests, paid APIs, credentials, or cloud mutations. This is a
deployment gate, not a runtime firewall or proof that billing cannot increase.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import signal
import sys

VERSION = "1.0.0"
SKIP = {".git", "node_modules", ".venv", ".claude", ".agents", "__pycache__",
        ".next", ".firebase", "coverage"}
CODE = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".rules", ".json", ".toml", ".yml", ".yaml"}
CONTROLS = ("billingAlerts", "automaticStop", "edgeAbuseProtection",
            "paidApiAuthorization", "atomicQuotaFailClosed", "boundedDataAndCache",
            "providerTimeoutAndRetries", "prototypeExpiry", "denialTests")


def walk(root):
    # Scan build outputs too. Never follow symlinks out of the repository.
    for p in sorted(root.iterdir()):
        if p.name in SKIP or p.name.startswith('.env'):
            continue
        if p.is_symlink():
            raise ValueError(f"symlink requires explicit review: {p}")
        if p.is_dir():
            yield from walk(p)
        elif p.is_file():
            yield p


def scan(root):
    findings, fingerprint = [], hashlib.sha256()
    checked = 0
    def add(level, rule, path, line, message):
        findings.append(dict(level=level, rule=rule, path=path, line=line, message=message))

    for p in walk(root):
        rel = p.relative_to(root).as_posix()
        # Documentation/tests/tools aren't deployed; public/ assets always are.
        if not rel.startswith("public/") and (rel.split('/')[0] in {"docs", "tests", "test", "scripts", "work", "outputs"}
                or rel in {"cost-safety.json", "cost-audit.json"}):
            continue
        file_hash, size, chunks = hashlib.sha256(), 0, []
        with p.open('rb') as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                file_hash.update(chunk)
                size += len(chunk)
                if p.suffix.lower() in CODE and size <= 8 * 1024 * 1024:
                    chunks.append(chunk)
        fingerprint.update(rel.encode() + b'\0' + file_hash.digest())
        checked += 1
        if rel.startswith('public/') and size > 1_000_000:
            add('review', 'LARGE_PUBLIC_FILE', rel, 1, f'公開ファイル {size:,} bytes。転送量・遅延読込を確認')
        if p.suffix.lower() not in CODE:
            continue
        if size > 8 * 1024 * 1024:
            add('review', 'LARGE_SOURCE', rel, 1, '8MiB超のソースはハッシュのみ確認。内容は手動レビューが必要')
            continue
        text = b''.join(chunks).decode('utf-8', errors='replace')
        if p.suffix == '.rules':
            # Multiline allow clauses; strip comments first to avoid false positives.
            clean = re.sub(r'/\*.*?\*/', lambda m: '\n' * m[0].count('\n'), text, flags=re.S)
            clean = re.sub(r'//[^\n]*', '', clean)
            for m in re.finditer(r'allow\s+([\w\s,]+):\s*if\s+true\s*;', clean):
                ops = set(re.findall(r'\w+', m[1]))
                line = clean[:m.start()].count('\n') + 1
                if ops & {'write', 'create', 'update', 'delete'}:
                    add('error', 'PUBLIC_WRITE', rel, line, '未認証の無条件書き込み・削除を許可')
                elif ops & {'read', 'list'}:
                    add('review', 'PUBLIC_READ', rel, line, '公開読み取り。件数・転送量・濫用対策の確認が必要')
        patterns = [
            ('error', 'CACHE_BUSTER', r"fetch\([^\n;]{0,250}Date\.now\(\)", '毎回異なるURLでキャッシュ再利用を妨げるデータ取得'),
            ('review', 'DYNAMIC_RENDER', r"force-dynamic|getServerSideProps|revalidate\s*[:=]\s*0", '動的生成の呼出回数・自己URL取得・キャッシュを確認'),
            ('review', 'DB_LISTENER', r"\bonSnapshot\s*\(", 'リアルタイム購読の対象件数・解除・再接続時の読み取りを確認'),
            ('review', 'DB_QUERY', r"\bgetDocs\s*\(", '全件取得・ページネーション・Rulesのquery limitを確認'),
        ]
        for level, rule, pattern, msg in patterns:
            for m in re.finditer(pattern, text):
                add(level, rule, rel, text[:m.start()].count('\n') + 1, msg)
        server = rel.startswith(('functions/', 'api/')) or '/worker/' in rel or '/api/' in rel
        if server and re.search(r'\bonRequest\s*\(|async\s+fetch\s*\(', text):
            add('review', 'HTTP_SERVER', rel, 1, '認証・App Check・全体/利用者クォータ・停止経路・同時実行制限を実機検証')
        if server and "rate limit bookkeeping failed" in text:
            # Known CC-DEV fail-open implementation. A throw in the catch is mandatory.
            m = re.search(r"console\.error\([^;]*rate limit bookkeeping failed[^;]*;([^}]*?)\}", text, re.S)
            if m and not re.search(r'\bthrow\b', m[1]):
                add('error', 'QUOTA_FAIL_OPEN', rel, text[:m.start()].count('\n') + 1, 'クォータ記録失敗時にも有料処理を続行')
    if not checked:
        add('error', 'EMPTY_SCAN', '.', 1, '検査対象が空です')
    return findings, fingerprint.hexdigest(), checked


def positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def validate_policy(policy, digest, today):
    errors = []
    def require(ok, text):
        if not ok:
            errors.append(text)
    require(policy.get('schemaVersion') == 1, 'schemaVersionは1が必要')
    require(policy.get('reviewedSourceSha256') == digest, '監査対象のソースが未確認または変更済み')
    require(isinstance(policy.get('reviewer'), str) and bool(policy['reviewer'].strip()), 'レビュー担当者が未記録')
    try:
        reviewed = dt.date.fromisoformat(policy['reviewedOn'])
        expires = dt.date.fromisoformat(policy['expiresOn'])
        require(reviewed <= today <= expires and 0 <= (expires-reviewed).days <= 30,
                '確認日は過去・有効期限は30日以内が必要（期限切れ不可）')
    except (KeyError, TypeError, ValueError):
        errors.append('確認日・有効期限が未設定')
    require(policy.get('currency') in ('JPY', 'USD'), '予算通貨をJPY/USDで指定')
    require(positive(policy.get('monthlyBudget')), '月額予算が未設定')
    require(positive(policy.get('stopThreshold')), '停止閾値が未設定')
    if positive(policy.get('monthlyBudget')) and positive(policy.get('stopThreshold')):
        require(policy['stopThreshold'] < policy['monthlyBudget'], '停止閾値は月額予算より低く設定（遅延の余裕）')
    controls = policy.get('controls', {})
    if not isinstance(controls, dict):
        controls = {}
    for name in CONTROLS:
        c = controls.get(name, {})
        require(isinstance(c, dict) and c.get('verified') is True and
                isinstance(c.get('evidence'), str) and len(c['evidence'].strip()) >= 20,
                name + ': 実設定・検証結果の証跡が必要')
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    ap.add_argument('--check', action='store_true', help='危険・未確認があればexit 1。デプロイ用')
    ap.add_argument('--json', type=Path, help='監査結果の保存先（秘密情報・ソース本文を含めない）')
    args = ap.parse_args()
    if hasattr(signal, 'SIGALRM'):
        def timed_out(signum, frame):
            raise TimeoutError('検査は60秒で終了。iCloud未ダウンロード等を確認してください')
        signal.signal(signal.SIGALRM, timed_out)
        signal.alarm(60)
    try:
        root = args.root.resolve()
        findings, digest, checked = scan(root)
        policy_path = root / 'cost-safety.json'
        policy = json.loads(policy_path.read_text()) if policy_path.exists() else {}
        if not isinstance(policy, dict):
            raise ValueError('cost-safety.json must be an object')
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
        errors = validate_policy(policy, digest, today)
        blocked = bool(errors) or any(f['level'] == 'error' for f in findings)
        report = dict(version=VERSION, files=checked, sourceSha256=digest, blocked=blocked,
                      policyErrors=errors, findings=findings,
                      limitation='静的検査と手動証跡。クラウド設定の自動検証・稼働中サービスの停止はしません。')
        if args.json:
            args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f'Cost guard {VERSION}: {checked} files; source SHA256 {digest}')
        for f in findings:
            print(f"{f['level'].upper()} {f['rule']} {f['path']}:{f['line']} {f['message']}")
        for e in errors:
            print('BLOCK POLICY ' + e)
        print('BLOCKED — 公開不可' if blocked else 'PASS — 証跡の対象範囲で公開可（費用上限の保証ではありません）')
        return 1 if args.check and blocked else 0
    except (OSError, ValueError, TypeError) as e:
        print(f'BLOCK SCAN_FAILED {type(e).__name__}: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
