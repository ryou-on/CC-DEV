// ===== hondoko (本ドコ？): 蔵書管理 — 棚写真をClaude Visionで解析 =====
// エンドポイント: /api/hondoko-analyze → hondokoAnalyze (firebase.json rewrites)
// 認証: Firebase ID トークン必須 + hondoko-config/members の許可リスト
// シークレット: ANTHROPIC_API_KEY (firebase functions:secrets:set ANTHROPIC_API_KEY)

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
// @anthropic-ai/sdk はデプロイ時のコード解析タイムアウト回避のため遅延読み込み

if (!admin.apps.length) admin.initializeApp();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const OWNER_EMAIL = 'junpei.omote@gmail.com';

async function isMember(email) {
  if (!email) return false;
  if (email === OWNER_EMAIL) return true;
  try {
    const snap = await admin.firestore().doc('hondoko-config/members').get();
    const emails = (snap.exists && snap.data().emails) || [];
    return emails.includes(email);
  } catch (e) {
    console.error('hondoko member check failed:', e);
    return false;
  }
}

const BOOKS_SCHEMA = {
  type: 'object',
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '書名。副題は「: 」区切りで含めてよい' },
          author: { type: 'string', description: '著者名。不明なら空文字。複数は「、」区切り' },
          publisher: { type: 'string', description: '出版社/レーベル。不明なら空文字' },
          volume: { type: 'string', description: '巻数表記(例: 3, 上, II)。単巻なら空文字' },
          kind: { type: 'string', enum: ['book', 'comic', 'magazine', 'other'] },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '内容ジャンルのタグを日本語で2〜4個(例: ビジネス, AI, SF小説, デザイン, 料理)'
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['title', 'author', 'publisher', 'volume', 'kind', 'tags', 'confidence'],
        additionalProperties: false
      }
    },
    note: { type: 'string', description: '読み取り全体に関する補足(逆さの本、判読不能領域など)。なければ空文字' }
  },
  required: ['books', 'note'],
  additionalProperties: false
};

const ANALYZE_SYSTEM = `あなたは日本の蔵書管理アシスタントです。本棚の1段(または一部)を写した写真から、背表紙を読み取って書誌情報を抽出します。

ルール:
- 写真に写っている本を「左から右」の順に列挙する。平積み・横置きは縦置きの後に上から順に。
- 背表紙の文字を注意深く読む。シリーズ物(同じ装丁が連続)は1冊ずつ巻数付きで列挙する。
- 判読できない本はタイトルを読める範囲で記載し confidence を low にする。完全に判読不能な本は含めない。
- ファイルボックス、雑貨、家電など本以外の物は含めない。バインダーや書類ファイルも含めない。
- 雑誌は kind を magazine、漫画は comic とする。
- tags は本の内容ジャンルを表す日本語タグ。表記ゆれを避け、一般的な短い語を使う(例: ビジネス, 経営, AI, プログラミング, デザイン, 写真, 料理, 小説, SF小説, ミステリー, 漫画, 自己啓発, 歴史, 科学, アート, 旅行, 教育, 健康, マーケティング, 起業)。
- 出版社は背表紙下部のロゴ・文字から読み取れた場合のみ。推測で書かない(知識で補完してよいのは確実な有名書籍のみ)。`;

exports.hondokoAnalyze = onRequest({
  cors: true,
  timeoutSeconds: 300,
  memory: '1GiB',
  secrets: [anthropicApiKey],
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  try {
    // --- 認証 ---
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) { res.status(401).json({ error: '認証が必要です' }); return; }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: 'トークンが無効です' }); return;
    }
    if (!(await isMember(decoded.email))) {
      res.status(403).json({ error: 'このアプリの利用が許可されていません' }); return;
    }

    // --- 入力 ---
    const { image, mediaType } = req.body || {};
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'image (base64) が必要です' }); return;
    }
    if (image.length > 12_000_000) { // base64で約9MB実体まで
      res.status(413).json({ error: '画像が大きすぎます。クライアント側でリサイズしてください' }); return;
    }
    const mt = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';

    // --- Claude Vision 解析 ---
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: ANALYZE_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: BOOKS_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: image } },
          { type: 'text', text: 'この本棚の写真から本を抽出してください。' },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: '解析が拒否されました。別の写真でお試しください' }); return;
    }
    if (response.stop_reason === 'max_tokens') {
      console.warn('hondokoAnalyze: max_tokens reached');
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text) { res.status(500).json({ error: '解析結果が空でした' }); return; }

    let parsed;
    try {
      parsed = JSON.parse(text.text);
    } catch (e) {
      console.error('hondokoAnalyze JSON parse error:', text.text.slice(0, 500));
      res.status(500).json({ error: '解析結果の形式が不正でした。もう一度お試しください' }); return;
    }

    res.status(200).json({
      books: parsed.books || [],
      note: parsed.note || '',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error('hondokoAnalyze error:', err);
    const status = err.status === 429 ? 429 : 500;
    const msg = err.status === 429
      ? 'APIのレート制限に達しました。少し待ってからお試しください'
      : '解析中にエラーが発生しました';
    res.status(status).json({ error: msg });
  }
});
