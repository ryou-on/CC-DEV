/**
 * AI活用スキル診断 - Cloudflare Worker（ai-skill-proxy）
 * デプロイ先: https://ai-skill-proxy.junpei-omote.workers.dev
 *
 * 役割:
 *   1) POST /                 ... Claude APIリレー（APIキーをサーバー側に隠す・SSEストリーミング対応）
 *   2) GET  /verify-session   ... Stripe Checkout セッションの決済検証
 *      ?session_id=cs_... を受け取り、Stripe APIで payment_status==='paid' と
 *      金額・通貨の一致を確認してから {paid:true} を返す
 *
 * シークレット（wrangler secret put で設定。このファイルには書かない）:
 *   CLAUDE_API_KEY    ... Anthropic APIキー
 *   STRIPE_SECRET_KEY ... Stripeキー（Checkout Sessions 読み取り権限のみの制限付きキー rk_live_... を推奨）
 *
 * 環境変数（wrangler.toml の [vars]）:
 *   EXPECTED_AMOUNT   ... 期待する決済金額（既定 "500"）
 *   EXPECTED_CURRENCY ... 期待する通貨（既定 "jpy"）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// JSONレスポンス共通（決済検証結果はキャッシュさせない）
const jsonRes = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── プリフライトリクエスト（CORS）の処理 ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Stripe決済検証 ──
    if (url.pathname === '/verify-session') {
      if (request.method !== 'GET') {
        return jsonRes(405, { paid: false, reason: 'method_not_allowed' });
      }
      return verifySession(url, env);
    }

    // ── Claude APIリレー（従来動作） ──
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }
    return relayClaude(request, env);
  },
};

/**
 * Stripe Checkout セッションを検証する
 * 返り値: 200 {paid:true} / 200 {paid:false, reason} = 確定判定
 *         502/503 {paid:false, reason} = 一時エラー（フロントは再試行を促す）
 */
async function verifySession(url, env) {
  const sid = url.searchParams.get('session_id') || '';

  // Checkout Session ID の形式チェック（cs_live_... / cs_test_...）
  if (!/^cs_(live|test)_[A-Za-z0-9]{8,200}$/.test(sid)) {
    return jsonRes(200, { paid: false, reason: 'invalid_session_id' });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return jsonRes(503, { paid: false, reason: 'not_configured' });
  }

  let res;
  try {
    res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}`, {
      headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
  } catch {
    return jsonRes(502, { paid: false, reason: 'stripe_unreachable' });
  }

  // 存在しないセッションID（偽造・別アカウントのID）は404で返る
  if (res.status === 404) {
    return jsonRes(200, { paid: false, reason: 'not_found' });
  }
  if (!res.ok) {
    return jsonRes(502, { paid: false, reason: 'stripe_error' });
  }

  let session;
  try {
    session = await res.json();
  } catch {
    return jsonRes(502, { paid: false, reason: 'stripe_error' });
  }

  // 支払い済みであること
  if (session.payment_status !== 'paid') {
    return jsonRes(200, { paid: false, reason: 'unpaid' });
  }

  // 同一Stripeアカウントの別商品セッションを弾く（金額・通貨の一致確認）
  const expectedAmount = Number(env.EXPECTED_AMOUNT || 500);
  const expectedCurrency = (env.EXPECTED_CURRENCY || 'jpy').toLowerCase();
  if (session.amount_total !== expectedAmount || (session.currency || '').toLowerCase() !== expectedCurrency) {
    return jsonRes(200, { paid: false, reason: 'wrong_product' });
  }

  return jsonRes(200, { paid: true });
}

/**
 * Claude APIへのリレー（ストリーミング対応）
 * 既存デプロイのシークレット名が異なる場合に備えて複数の環境変数名を許容する
 */
async function relayClaude(request, env) {
  const apiKey = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY || env.API_KEY;
  if (!apiKey) {
    return jsonRes(500, { error: 'CLAUDE_API_KEY が未設定です。npx wrangler secret put CLAUDE_API_KEY で設定してください。' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes(400, { error: 'リクエストボディが不正です。' });
  }

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  // レスポンス（ストリーミング含む）をそのまま返す
  return new Response(claudeRes.body, {
    status: claudeRes.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': claudeRes.headers.get('Content-Type') || 'application/json',
    },
  });
}
