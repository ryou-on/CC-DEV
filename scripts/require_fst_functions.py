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


def require_active(names, fetch):
    """ACTIVE かつ updateTime があることだけを合格にする。

    functions.get はデプロイ済み zip の Cloud Storage generation と updateTime を返す。
    generation はリポジトリのファイルハッシュではない。git の SHA と照合するには、
    デプロイ時にその SHA を関数の環境変数へ入れる必要がある。このゲートはそれをしない。
    """
    problems = []
    notes = []
    for name in names:
        status, body = fetch(name)
        if status == 403:
            problems.append(
                f'{name} status=403 missing cloudfunctions.functions.get on the hosting service account'
            )
            continue
        state = body.get('state') if isinstance(body, dict) else None
        update = body.get('updateTime') if isinstance(body, dict) else None
        source = {}
        if isinstance(body, dict):
            source = ((body.get('buildConfig') or {}).get('source') or {}).get('storageSource') or {}
        if status != 200 or state != 'ACTIVE' or not update:
            problems.append(f'{name} status={status} state={state} updateTime={update}')
            continue
        notes.append(f'{name} updateTime={update} sourceGeneration={source.get("generation")}')
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
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode('utf-8', errors='replace')
            try:
                body = json.loads(detail)
            except json.JSONDecodeError:
                body = {'error': detail[:200]}
            return error.code, body
    return fetch


def main():
    raw = os.environ.get('FIREBASE_SA')
    if not raw:
        path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        if not path:
            raise SystemExit('FIREBASE_SA is required')
        raw = open(path, encoding='utf-8').read()
    token = access_token(json.loads(raw))
    notes = require_active(REQUIRED, live_fetch(token))
    print('Flight Strip functions are ACTIVE')
    for note in notes:
        print(note)


if __name__ == '__main__':
    main()
