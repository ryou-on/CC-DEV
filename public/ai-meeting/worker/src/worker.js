/**
 * AI架空キャラ会議 - Cloudflare Worker プロキシ
 * 役割: APIキーをサーバー側に隠し、共有トークンで認証してClaudeにリレーする
 *
 * 環境変数（wrangler secret で設定）:
 *   CLAUDE_API_KEY  ... AnthropicのAPIキー
 *   SHARED_TOKEN    ... 友人・同僚に渡す共有パスワード（任意の文字列でOK）
 */

// CORSヘッダー（どのオリジンからでも呼べるよう設定）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {

    // ── プリフライトリクエスト（CORS）の処理 ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── POST以外は拒否 ──
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    // ── 共有トークンで認証 ──
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== env.SHARED_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'トークンが無効です。管理者に確認してください。' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ── リクエストボディを取得 ──
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'リクエストボディが不正です。' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // ── Claude APIにリレー ──
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,          // ← サーバー側のシークレット
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // ── レスポンス（ストリーミング含む）をそのまま返す ──
    return new Response(claudeRes.body, {
      status: claudeRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': claudeRes.headers.get('Content-Type') || 'application/json',
      },
    });
  },
};
