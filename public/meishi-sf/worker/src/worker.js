/**
 * meishi-sf-proxy — Cloudflare Worker
 *
 * エンドポイント:
 *   POST /analyze              → Anthropic Vision API プロキシ
 *   POST /sf/contact           → Salesforce Contact 作成
 *   POST /sf/account           → Salesforce Account 作成
 *   GET  /sf/search/contact    → Contact 重複チェック（SOQL）
 *   GET  /sf/search/account    → Account 名前検索（SOQL）
 *
 * wrangler secret:
 *   ANTHROPIC_API_KEY, SHARED_TOKEN
 *   SF_CLIENT_ID, SF_CLIENT_SECRET
 *   SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN
 *   SF_INSTANCE_URL  (例: https://yourorg.my.salesforce.com)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Salesforceアクセストークンをリクエスト間でキャッシュ（同一Isolate内のみ有効）
let sfTokenCache = null;
let sfTokenExpiry = 0;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // 共有トークン認証
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token || token !== env.SHARED_TOKEN) {
      return jsonError('認証エラー: トークンが無効です', 401);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/analyze' && request.method === 'POST') {
        return await handleAnalyze(request, env);
      }
      if (path === '/sf/contact' && request.method === 'POST') {
        return await handleSfCreate(request, env, 'Contact');
      }
      if (path === '/sf/account' && request.method === 'POST') {
        return await handleSfCreate(request, env, 'Account');
      }
      if (path === '/sf/search/contact' && request.method === 'GET') {
        return await handleSearchContact(url, env);
      }
      if (path === '/sf/search/account' && request.method === 'GET') {
        return await handleSearchAccount(url, env);
      }
      return jsonError('Not Found', 404);
    } catch (err) {
      console.error(err);
      return jsonError(`Internal Error: ${err.message}`, 500);
    }
  }
};

// ── /analyze ──────────────────────────────────────────
async function handleAnalyze(request, env) {
  const { image, mediaType = 'image/jpeg' } = await request.json();
  if (!image) return jsonError('image が必要です', 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          {
            type: 'text',
            text: `この名刺画像から情報を抽出してください。必ずJSONのみで返答してください。マークダウン不要。
{
  "lastName": "姓",
  "firstName": "名",
  "lastNameKana": "セイ（不明なら空文字）",
  "firstNameKana": "メイ（不明なら空文字）",
  "email": "メールアドレス",
  "phone": "電話番号",
  "mobile": "携帯番号",
  "department": "部署名",
  "title": "役職",
  "accountName": "会社名",
  "industry": "業種（推測でも可）",
  "website": "WebサイトURL",
  "address": "住所"
}`
          }
        ]
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    return jsonError(`Anthropic API error: ${res.status} ${errText}`, 502);
  }

  const data = await res.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    return jsonOk(parsed);
  } catch {
    return jsonError(`JSONパース失敗: ${clean.slice(0, 200)}`, 502);
  }
}

// ── /sf/contact, /sf/account ──────────────────────────
async function handleSfCreate(request, env, objectType) {
  const payload = await request.json();
  const accessToken = await getSfToken(env);
  const apiVersion = 'v59.0';

  const res = await fetch(
    `${env.SF_INSTANCE_URL}/services/data/${apiVersion}/sobjects/${objectType}/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const body = await res.json();
  if (!res.ok) {
    return jsonError(`SF ${objectType} 作成失敗: ${JSON.stringify(body)}`, 502);
  }
  return jsonOk(body);
}

// ── /sf/search/contact ────────────────────────────────
async function handleSearchContact(url, env) {
  const email = url.searchParams.get('email') || '';
  const lastName = url.searchParams.get('lastName') || '';
  const firstName = url.searchParams.get('firstName') || '';

  // Email一致 OR (姓名両方一致) で検索
  let conditions = [];
  if (email) conditions.push(`Email = '${escapeSoql(email)}'`);
  if (lastName && firstName) {
    conditions.push(`(LastName = '${escapeSoql(lastName)}' AND FirstName = '${escapeSoql(firstName)}')`);
  } else if (lastName) {
    conditions.push(`LastName = '${escapeSoql(lastName)}'`);
  }

  if (conditions.length === 0) return jsonOk({ records: [] });

  const soql = `SELECT Id, LastName, FirstName, Email, Account.Name FROM Contact WHERE ${conditions.join(' OR ')} LIMIT 5`;
  return await sfQuery(soql, env);
}

// ── /sf/search/account ────────────────────────────────
async function handleSearchAccount(url, env) {
  const q = url.searchParams.get('q') || '';
  if (!q) return jsonOk({ records: [] });

  const soql = `SELECT Id, Name FROM Account WHERE Name LIKE '%${escapeSoql(q)}%' ORDER BY Name LIMIT 10`;
  return await sfQuery(soql, env);
}

// ── Salesforce SOQL共通 ───────────────────────────────
async function sfQuery(soql, env) {
  const accessToken = await getSfToken(env);
  const apiVersion = 'v59.0';
  const encodedSoql = encodeURIComponent(soql);

  const res = await fetch(
    `${env.SF_INSTANCE_URL}/services/data/${apiVersion}/query/?q=${encodedSoql}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const errText = await res.text();
    return jsonError(`SF Query失敗: ${res.status} ${errText}`, 502);
  }

  const data = await res.json();
  return jsonOk(data);
}

// ── Salesforce OAuth (Username-Password Flow) ────────
async function getSfToken(env) {
  // キャッシュが有効なら再利用（5分の余裕を持つ）
  if (sfTokenCache && Date.now() < sfTokenExpiry - 300_000) {
    return sfTokenCache;
  }

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: env.SF_CLIENT_ID,
    client_secret: env.SF_CLIENT_SECRET,
    username: env.SF_USERNAME,
    password: env.SF_PASSWORD + (env.SF_SECURITY_TOKEN || ''),
  });

  const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`SF OAuth失敗: ${err.error_description || res.status}`);
  }

  const data = await res.json();
  sfTokenCache = data.access_token;
  // SF access tokenの有効期限は通常2時間。念のため1.5時間でリフレッシュ
  sfTokenExpiry = Date.now() + 90 * 60 * 1000;
  return sfTokenCache;
}

// ── ユーティリティ ────────────────────────────────────
function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// SOQLインジェクション防止（シングルクォートをエスケープ）
function escapeSoql(str) {
  return String(str).replace(/'/g, "\\'");
}
