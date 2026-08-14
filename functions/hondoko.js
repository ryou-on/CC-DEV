// ===== hondoko (本ドコ？): 蔵書管理 — 棚写真をClaude Visionで解析 =====
// エンドポイント: /api/hondoko-analyze → hondokoAnalyze (直接URL推奨: Hosting rewriteは60秒制限)
// 認証: Firebase ID トークン必須 + hondoko-config/members の許可リスト
// シークレット: ANTHROPIC_API_KEY (firebase functions:secrets:set ANTHROPIC_API_KEY)
//
// v2: 1枚の写真に複数段が写っている場合に段ごとにグループ化して返す。
//     マップ写真+領域一覧を渡すと、各段がマップのどの領域かを照合して region に返す。

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

const BOOK_SCHEMA = {
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
};

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      description: '写真に写っている物理的な棚の段。上の段から順に',
      items: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            description: 'マップ領域一覧が与えられた場合、この段に対応する領域ラベル(例: 1-3)。判断できない/一覧が無い場合は空文字'
          },
          books: { type: 'array', items: BOOK_SCHEMA }
        },
        required: ['region', 'books'],
        additionalProperties: false
      }
    },
    note: { type: 'string', description: '読み取り全体に関する補足(逆さの本、判読不能領域など)。なければ空文字' }
  },
  required: ['rows', 'note'],
  additionalProperties: false
};

const ANALYZE_SYSTEM = `あなたは日本の蔵書管理アシスタントです。本棚や本を写した写真から、背表紙・表紙を読み取って書誌情報を抽出します。

ルール:
- 写真に本棚の段(横板で区切られた棚)が複数写っている場合は、段ごとに分けて rows に入れる。順序は上の段から。1段だけなら rows は1要素。
- 棚ではなく数冊の本だけ(机の上の本、手に持った本、表紙が見える本など)が写っている場合は、rows を1要素とし、写っている本をすべて含める。表紙からの読み取りでもよい。
- 段が部分的にしか写っていない(上下が見切れている)段は、本のタイトルが読み取れる場合のみ含める。
- 各段の中では本を「左から右」の順に列挙する。平積み・横置きは縦置きの後に上から順に。
- 背表紙の文字を注意深く読む。シリーズ物(同じ装丁が連続)は1冊ずつ巻数付きで列挙する。
- 判読できない本はタイトルを読める範囲で記載し confidence を low にする。完全に判読不能な本は含めない。
- ファイルボックス、雑貨、家電など本以外の物は含めない。バインダーや書類ファイルも含めない。
- 雑誌は kind を magazine、漫画は comic とする。
- tags は本の内容ジャンルを表す日本語タグ。表記ゆれを避け、一般的な短い語を使う(例: ビジネス, 経営, AI, プログラミング, デザイン, 写真, 料理, 小説, SF小説, ミステリー, 漫画, 自己啓発, 歴史, 科学, アート, 旅行, 教育, 健康, マーケティング, 起業)。
- 出版社は背表紙下部のロゴ・文字から読み取れた場合のみ。推測で書かない(知識で補完してよいのは確実な有名書籍のみ)。

マップ照合(2枚目の画像と領域一覧が与えられた場合):
- 2枚目は本棚全体を写したマップ写真。領域一覧は「ラベル: x,y,w,h」(画像に対する0〜1の正規化座標)。
- 1枚目のクローズアップ写真がマップ写真のどの段に対応するかを、本の並び・色・特徴的な背表紙・棚の構造から照合する。
- 対応すると判断できた段は region にそのラベルを入れる。自信がなければ空文字にする(推測で埋めない)。`;

// ===== Amazon PA-API v5: 書影・価格の取得(アソシエイトアカウント利用) =====
// シークレット: AMAZON_PAAPI_ACCESS_KEY / AMAZON_PAAPI_SECRET_KEY / AMAZON_PAAPI_PARTNER_TAG
const paapiAccessKey = defineSecret('AMAZON_PAAPI_ACCESS_KEY');
const paapiSecretKey = defineSecret('AMAZON_PAAPI_SECRET_KEY');
const paapiPartnerTag = defineSecret('AMAZON_PAAPI_PARTNER_TAG');

function hmac(key, msg) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function sha256hex(msg) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

// PA-API v5 リクエスト(AWS SigV4署名)
async function paapiRequest(operation, payload, creds) {
  const host = 'webservices.amazon.co.jp';
  const region = 'us-west-2';
  const service = 'ProductAdvertisingAPI';
  const target = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`;
  const path = `/paapi5/${operation.toLowerCase()}`;
  const body = JSON.stringify(payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders =
    'content-encoding:amz-1.0\n' +
    'content-type:application/json; charset=utf-8\n' +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256hex(body)}`;
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonicalRequest)}`;
  let k = hmac('AWS4' + creds.secretKey, dateStamp);
  k = hmac(k, region);
  k = hmac(k, service);
  k = hmac(k, 'aws4_request');
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', k).update(stringToSign, 'utf8').digest('hex');
  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'content-encoding': 'amz-1.0',
      'content-type': 'application/json; charset=utf-8',
      'x-amz-date': amzDate,
      'x-amz-target': target,
      Authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function pickPaapiItem(item) {
  if (!item) return null;
  const image = item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || null;
  const priceRaw = item.ItemInfo?.ProductInfo == null ? null : null; // 定価はListPrice系が安定しないためOffers優先
  const offer = item.Offers?.Listings?.[0]?.Price?.Amount;
  const price = typeof offer === 'number' && offer > 0 ? Math.round(offer) : priceRaw;
  return { coverUrl: image, price };
}

exports.hondokoAmazon = onRequest({
  cors: true,
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [paapiAccessKey, paapiSecretKey, paapiPartnerTag],
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  try {
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

    const { isbn, title, author } = req.body || {};
    const creds = { accessKey: paapiAccessKey.value(), secretKey: paapiSecretKey.value() };
    const partnerTag = paapiPartnerTag.value();
    const common = {
      PartnerTag: partnerTag,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.co.jp',
      Resources: ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price'],
    };

    // ISBN-10があればASINとしてGetItems、なければタイトルでSearchItems
    let result = null;
    const isbn10 = typeof isbn === 'string' && /^[0-9]{9}[0-9Xx]$/.test(isbn) ? isbn.toUpperCase() : null;
    if (isbn10) {
      const r = await paapiRequest('GetItems', { ...common, ItemIds: [isbn10] }, creds);
      if (r.status === 429) { res.status(429).json({ error: 'PA-APIのレート制限です。時間を置いてください' }); return; }
      result = pickPaapiItem(r.data?.ItemsResult?.Items?.[0]);
    }
    if ((!result || !result.coverUrl) && title) {
      const r = await paapiRequest('SearchItems', {
        ...common,
        Keywords: `${title} ${author || ''}`.trim(),
        SearchIndex: 'Books',
        ItemCount: 1,
      }, creds);
      if (r.status === 429) { res.status(429).json({ error: 'PA-APIのレート制限です。時間を置いてください' }); return; }
      result = pickPaapiItem(r.data?.SearchResult?.Items?.[0]) || result;
    }

    res.status(200).json(result || { coverUrl: null, price: null });
  } catch (err) {
    console.error('hondokoAmazon error:', err);
    res.status(500).json({ error: 'Amazon検索中にエラーが発生しました' });
  }
});

// NDLサーチの書影サムネイルプロキシ。
// ndlsearch.ndl.go.jp/thumbnail/ はRefererチェックがありブラウザから直接参照できないため、
// サーバー側で取得してbase64で返す(クライアントがStorageへ保存して永続化する)
exports.hondokoCover = onRequest({
  cors: true,
  timeoutSeconds: 20,
  memory: '256MiB',
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  try {
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

    const isbn = String((req.body || {}).isbn || '').replace(/[^0-9]/g, '');
    if (isbn.length !== 13) { res.status(400).json({ error: 'ISBN-13が必要です' }); return; }

    const r = await fetch(`https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`, {
      headers: {
        Referer: 'https://ndlsearch.ndl.go.jp/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    });
    if (!r.ok) { res.status(404).json({ base64: null }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    // 1x1などのプレースホルダを除外
    if (buf.length < 500) { res.status(404).json({ base64: null }); return; }
    res.status(200).json({
      base64: buf.toString('base64'),
      contentType: r.headers.get('content-type') || 'image/jpeg',
    });
  } catch (err) {
    console.error('hondokoCover error:', err);
    res.status(500).json({ error: '書影取得中にエラーが発生しました' });
  }
});

exports.hondokoAnalyze = onRequest({
  cors: true,
  timeoutSeconds: 540,
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
    const { image, mediaType, map, mode } = req.body || {};
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'image (base64) が必要です' }); return;
    }
    if (image.length > 12_000_000) {
      res.status(413).json({ error: '画像が大きすぎます。クライアント側でリサイズしてください' }); return;
    }
    const mt = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';

    // --- モード: マップ写真から段の矩形を自動検出 ---
    if (mode === 'detect_regions') {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const t0 = Date.now();
      const response = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 8000,
        system: `本棚の写真から「段」(棚板で区切られた本を置く区画)を検出します。
- 各段のバウンディングボックスを、画像の幅・高さに対する 0〜1 の正規化座標 {x, y, w, h} で返す(x,yは左上)。
- 本棚ユニット(縦の列)ごとに左の列から右の列へ、各列内は上の段から下の段の順に並べる。
- 本が置かれていない空の段も含める。棚以外(壁、床、天井、家電)は含めない。
- 装飾品だけの段も棚の段として含める。
- ボックスは段の内側(本が並ぶ空間)にぴったり合わせる。`,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                boxes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' }, y: { type: 'number' },
                      w: { type: 'number' }, h: { type: 'number' },
                    },
                    required: ['x', 'y', 'w', 'h'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['boxes'],
              additionalProperties: false,
            },
          },
        },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mt, data: image } },
            { type: 'text', text: 'この本棚の写真からすべての段のバウンディングボックスを検出してください。' },
          ],
        }],
      });
      console.log(`hondokoAnalyze(detect): ${Math.round((Date.now() - t0) / 1000)}s, out=${response.usage.output_tokens}tok`);
      if (response.stop_reason === 'refusal') {
        res.status(422).json({ error: '解析が拒否されました' }); return;
      }
      const textBlock = response.content.find((b) => b.type === 'text');
      let parsedBoxes;
      try {
        parsedBoxes = JSON.parse(textBlock.text);
      } catch (e) {
        res.status(500).json({ error: '検出結果の形式が不正でした' }); return;
      }
      const boxes = (parsedBoxes.boxes || []).filter((b) =>
        [b.x, b.y, b.w, b.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && b.w > 0.01 && b.h > 0.01
      );
      res.status(200).json({ boxes });
      return;
    }

    // --- モード: 段写真から特定の本の背表紙位置を特定 ---
    if (mode === 'locate_book') {
      const { title, author, volume } = req.body || {};
      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'title が必要です' }); return;
      }
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const t0 = Date.now();
      const response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system: `本棚の段の写真から、指定された本の背表紙の位置を特定します。
- 見つかった場合は found=true とし、その背表紙のバウンディングボックスを画像の幅・高さに対する 0〜1 の正規化座標 {x, y, w, h} で返す(x,yは左上)。
- ボックスはその1冊の背表紙にぴったり合わせる(隣の本を含めない)。
- タイトルの表記ゆれ(OCR誤読・略記)がありうるので、近い表記の本も同一とみなしてよい。
- 確実に見つからない場合は found=false を返す(推測で別の本を囲まない)。`,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                found: { type: 'boolean' },
                box: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' }, y: { type: 'number' },
                    w: { type: 'number' }, h: { type: 'number' },
                  },
                  required: ['x', 'y', 'w', 'h'],
                  additionalProperties: false,
                },
              },
              required: ['found', 'box'],
              additionalProperties: false,
            },
          },
        },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mt, data: image } },
            {
              type: 'text',
              text: `この段の写真から次の本の背表紙を探してください。\nタイトル: ${title}${volume ? `\n巻数: ${volume}` : ''}${author ? `\n著者: ${author}` : ''}`,
            },
          ],
        }],
      });
      console.log(`hondokoAnalyze(locate): ${Math.round((Date.now() - t0) / 1000)}s, out=${response.usage.output_tokens}tok`);
      if (response.stop_reason === 'refusal') {
        res.status(422).json({ error: '解析が拒否されました' }); return;
      }
      const textBlock = response.content.find((b) => b.type === 'text');
      let parsed;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch (e) {
        res.status(500).json({ error: '結果の形式が不正でした' }); return;
      }
      const b = parsed.box || {};
      const valid = [b.x, b.y, b.w, b.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && b.w > 0.005 && b.h > 0.01;
      res.status(200).json(parsed.found && valid ? { found: true, box: b } : { found: false, box: null });
      return;
    }

    const content = [
      { type: 'image', source: { type: 'base64', media_type: mt, data: image } },
    ];
    if (map && typeof map.image === 'string' && Array.isArray(map.regions) && map.regions.length > 0) {
      const regionList = map.regions
        .slice(0, 200)
        .map((r) => `${r.label}: ${Number(r.x).toFixed(3)},${Number(r.y).toFixed(3)},${Number(r.w).toFixed(3)},${Number(r.h).toFixed(3)}`)
        .join('\n');
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: map.image } });
      content.push({
        type: 'text',
        text: `2枚目はマップ写真です。領域一覧:\n${regionList}\n\n1枚目の写真の各段がマップのどの領域に対応するか照合し、regionに入れてください。`,
      });
    }
    content.push({ type: 'text', text: 'この本棚の写真から本を抽出してください。' });

    // --- Claude Vision 解析 (長い出力に備えてストリーミングで受ける) ---
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const t0 = Date.now();
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 32000,
      system: ANALYZE_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    const response = await stream.finalMessage();
    console.log(`hondokoAnalyze: ${Math.round((Date.now() - t0) / 1000)}s, stop=${response.stop_reason}, out=${response.usage.output_tokens}tok, map=${!!map}`);

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: '解析が拒否されました。別の写真でお試しください' }); return;
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
      rows: parsed.rows || [],
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
