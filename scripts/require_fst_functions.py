#!/usr/bin/env python3
"""Hosting と Rules の前に、Flight Strip の関数が本番で ACTIVE か確認する。"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'cc-dev-ps7'
REGION = 'asia-northeast1'
# 目安箱・統計に加え、開発版の告知とアンケートも同じ理由で先に出す。
# これらが無いと Rules は直書きを拒否し、画面の送信先が無い。
REQUIRED = (
    'fstFeedbackSubmit',
    'updateFstFeedback',
    'recordFstAnalytics',
    'recordFstDevAdmin',
    'recordFstSurvey',
    'submitFstSurveyAnswer',
)


def expected_rev():
    """チェックアウト中の関数ソースから、デプロイ時と同じ fst-rev を計算する。"""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    result = subprocess.run(
        ['node', 'functions/fst-rev.js'],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    rev = result.stdout.strip()
    if len(rev) != 32 or any(ch not in '0123456789abcdef' for ch in rev):
        raise SystemExit(f'fst-rev is not 32 hex chars: {rev!r}')
    return rev


def require_active(names, fetch, expected):
    """ACTIVE、updateTime、ラベル fst-rev がチェックアウトと一致することを要求する。

    fst-rev はデプロイ時に関数ソースの SHA-256 先頭32桁をラベルへ書く。
    古いデプロイはラベルが無い、または別の値なのでここで止まる。
    functions.get が返す zip の generation はリポジトリのファイルハッシュではない。
    zip 自体のダウンロードと比較は、このサービスアカウントの権限と成果物の形が
    ソースファイルと違うため行わない。コンソールでラベルだけを期待値に書き換えると、
    中身が古くてもこの確認は通る。
    """
    problems = []
    notes = []
    for name in names:
        try:
            status, body = fetch(name)
        except Exception as error:
            problems.append(f'{name} network-error {error.__class__.__name__}')
            continue
        if status == 403:
            problems.append(
                f'{name} status=403 missing cloudfunctions.functions.get on the hosting service account'
            )
            continue
        if not isinstance(body, dict) or not body:
            problems.append(f'{name} empty-response status={status}')
            continue
        state = body.get('state')
        update = body.get('updateTime')
        label = (body.get('labels') or {}).get('fst-rev')
        source = ((body.get('buildConfig') or {}).get('source') or {}).get('storageSource') or {}
        if status != 200 or state != 'ACTIVE' or not update or label != expected:
            problems.append(
                f'{name} status={status} state={state} updateTime={update} fst-rev={label} expected={expected}'
            )
            continue
        notes.append(f'{name} updateTime={update} fst-rev={label} sourceGeneration={source.get("generation")}')
    if problems:
        raise SystemExit(
            'Flight Strip functions are not active: ' + '; '.join(problems)
            + '. The hosting service account needs cloudfunctions.functions.get '
            + 'or every Hosting and Rules deploy stops with 403.'
        )
    return notes


def _b64(raw):
    import base64
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def access_token(sa):
    now = int(time.time())
    header = _b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    claim = _b64(json.dumps({
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/cloud-platform',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': now,
        'exp': now + 3600,
    }).encode())
    signing = f'{header}.{claim}'.encode()
    key_path = '/tmp/fst-fn-gate-key.pem'
    try:
        with open(key_path, 'w', encoding='utf-8') as handle:
            handle.write(sa['private_key'])
        signed = subprocess.run(
            ['openssl', 'dgst', '-sha256', '-sign', key_path],
            input=signing,
            capture_output=True,
            check=True,
        )
    finally:
        if os.path.exists(key_path):
            os.remove(key_path)
    assertion = f'{header}.{claim}.{_b64(signed.stdout)}'
    data = urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': assertion,
    }).encode()
    request = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)['access_token']


def live_fetch(token):
    def fetch(name):
        url = (
            'https://cloudfunctions.googleapis.com/v2/projects/'
            f'{PROJECT}/locations/{REGION}/functions/{name}'
        )
        request = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read()
                if not raw.strip():
                    return response.status, None
                return response.status, json.loads(raw)
        except urllib.error.HTTPError as error:
            detail = error.read().decode('utf-8', errors='replace')
            try:
                body = json.loads(detail)
            except json.JSONDecodeError:
                body = {'error': detail[:200]}
            return error.code, body
    return fetch


def reject_e2e_env(root=None):
    """functions/.env* に E2E 用の変数があれば、本番の関数確認より先に止める。"""
    if root is None:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    folder = os.path.join(root, 'functions')
    problems = []
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if not name.startswith('.env'):
                continue
            path = os.path.join(folder, name)
            if not os.path.isfile(path):
                continue
            with open(path, encoding='utf-8', errors='replace') as handle:
                text = handle.read()
            for token in ('FST_E2E_', 'FUNCTIONS_EMULATOR'):
                idx = text.find(token)
                if idx < 0:
                    continue
                problems.append(f'functions/{name}:{text[:idx].count(chr(10)) + 1} contains {token}')
    if problems:
        raise SystemExit('Flight Strip E2E env must not be deployed: ' + '; '.join(problems))


def main():
    reject_e2e_env()
    raw = os.environ.get('FIREBASE_SA')
    if not raw:
        path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        if not path:
            raise SystemExit('FIREBASE_SA is required')
        raw = open(path, encoding='utf-8').read()
    token = access_token(json.loads(raw))
    notes = require_active(REQUIRED, live_fetch(token), expected_rev())
    print('Flight Strip functions are ACTIVE')
    for note in notes:
        print(note)


if __name__ == '__main__':
    main()
