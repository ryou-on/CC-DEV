

// ===== note-analytics: Anthropic API CORS プロキシ =====
// ブラウザからの直接呼び出しでは CORS ブロックされるため、
// このFunction を経由して api.anthropic.com に転送する
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'asia-northeast1' });

exports.anthropicProxy = onRequest({
  cors: true,   // Firebase Functions v2 の CORS 自動付与
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (req, res) => {

  // preflight
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) { res.status(400).json({ error: 'x-api-key header required' }); return; }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':        apiKey,
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
        'content-type':     'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ===== Meeting Interpreter: OpenAI Realtime API =====

const { defineSecret } = require('firebase-functions/params');

const openaiApiKey = defineSecret('OPENAI_API_KEY');

exports.realtimeToken = onRequest(
  {
    secrets: [openaiApiKey],
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('POSTのみ利用できます');
      return;
    }

    const contentType = req.get('content-type') || '';

    if (!contentType.includes('application/sdp')) {
      res
        .status(415)
        .send('Content-Typeはapplication/sdpにしてください');
      return;
    }

    try {
      const allowedVoices = new Set(['marin', 'cedar']);
      const requestedVoice = req.get('x-meeting-voice');

      const voice = allowedVoices.has(requestedVoice)
        ? requestedVoice
        : 'marin';

      let instructions =
        'あなたは英語から日本語への会議通訳者です。' +
        '入力された英語だけを自然な日本語へ即時通訳してください。' +
        '解説、相づち、質問、要約は不要です。';

      const encodedInstructions = req.get(
        'x-meeting-instructions'
      );

      if (encodedInstructions) {
        try {
          instructions = decodeURIComponent(
            encodedInstructions
          ).slice(0, 5000);
        } catch (error) {
          console.warn(
            '通訳指示のデコードに失敗しました',
            error
          );
        }
      }

      const session = {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions,
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-mini-transcribe',
              language: 'en',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.45,
              prefix_padding_ms: 250,
              silence_duration_ms: 350,
              create_response: true,
              interrupt_response: false,
            },
          },
          output: {
            voice,
          },
        },
      };

      const form = new FormData();

      form.set(
        'sdp',
        req.rawBody.toString('utf8')
      );

      form.set(
        'session',
        JSON.stringify(session)
      );

      const openaiResponse = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey.value()}`,
          },
          body: form,
        }
      );

      const responseBody = await openaiResponse.text();

      if (!openaiResponse.ok) {
        console.error(
          'OpenAI Realtime API error:',
          responseBody
        );

        res
          .status(openaiResponse.status)
          .send(responseBody);

        return;
      }

      res.set(
        'Content-Type',
        'application/sdp'
      );

      res
        .status(200)
        .send(responseBody);
    } catch (error) {
      console.error(
        'realtimeToken error:',
        error
      );

      res
        .status(500)
        .send(
          error.message || 'サーバーエラー'
        );
    }
  }
);

// ===== Meeting Interpreter Duo: 双方向対応 Realtime SDPプロキシ =====
// realtimeToken(EN→JA固定)と違い、direction/voice/model をJSONで受けて
// セッション設定をサーバ側で組み立てる。既存アプリとは独立。

const ALLOWED_ORIGINS = new Set([
  'https://cc-dev-ps7.web.app',
  'https://cc-dev-ps7.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5173',
]);

const DUO_MODELS = new Set(['gpt-realtime', 'gpt-realtime-mini']);
const DUO_VOICES = new Set(['marin', 'cedar', 'alloy', 'echo']);

const DUO_DEFAULT_INSTRUCTIONS = {
  en2ja:
    'あなたは会議のプロ同時通訳者です。入力される英語音声だけを自然な日本語に即時通訳してください。' +
    '一人称・語調は話者に合わせ、解説・相づち・質問・要約・翻訳以外の発話は一切禁止です。' +
    '聞き取れない場合は無音のままにしてください。',
  ja2en:
    'You are a professional simultaneous interpreter. Translate the incoming Japanese speech into natural, ' +
    'concise business English immediately. Speak only the translation — no commentary, no questions, ' +
    'no summaries. If the input is unintelligible, stay silent.',
};

exports.interpreterCall = onRequest(
  {
    secrets: [openaiApiKey],
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POSTのみ利用できます' });
      return;
    }

    // 同一オリジン(rewrite経由)以外からの利用を拒否
    const origin = req.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ error: 'origin not allowed' });
      return;
    }

    const body = req.body || {};
    const { sdp, direction } = body;

    if (typeof sdp !== 'string' || !sdp.startsWith('v=')) {
      res.status(400).json({ error: 'sdp(SDP offer文字列)が必要です' });
      return;
    }
    if (direction !== 'en2ja' && direction !== 'ja2en') {
      res.status(400).json({ error: 'directionはen2jaまたはja2en' });
      return;
    }

    const model = DUO_MODELS.has(body.model) ? body.model : 'gpt-realtime';
    const voice = DUO_VOICES.has(body.voice) ? body.voice : 'marin';

    let instructions = DUO_DEFAULT_INSTRUCTIONS[direction];
    if (typeof body.instructions === 'string' && body.instructions.trim()) {
      instructions = body.instructions.slice(0, 5000);
    }
    if (typeof body.glossary === 'string' && body.glossary.trim()) {
      instructions +=
        '\n\n【用語辞書 / Glossary — これらの固有名詞は訳さずそのまま使うこと】\n' +
        body.glossary.slice(0, 2000);
    }

    const session = {
      type: 'realtime',
      model,
      instructions,
      audio: {
        input: {
          transcription: {
            model: 'gpt-4o-mini-transcribe',
            language: direction === 'en2ja' ? 'en' : 'ja',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.45,
            prefix_padding_ms: 250,
            // JA→ENはプッシュ・トゥ・トークで話し終えてから離すため長めに待つ
            silence_duration_ms: direction === 'ja2en' ? 500 : 350,
            create_response: true,
            interrupt_response: false,
          },
        },
        output: { voice },
      },
    };

    try {
      const form = new FormData();
      form.set('sdp', sdp);
      form.set('session', JSON.stringify(session));

      const openaiResponse = await fetch(
        'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiApiKey.value()}`,
          },
          body: form,
        }
      );

      const responseBody = await openaiResponse.text();

      if (!openaiResponse.ok) {
        console.error('interpreterCall OpenAI error:', responseBody);
        res.status(openaiResponse.status).send(responseBody);
        return;
      }

      res.set('Content-Type', 'application/sdp');
      res.status(200).send(responseBody);
    } catch (error) {
      console.error('interpreterCall error:', error);
      res.status(500).json({ error: error.message || 'サーバーエラー' });
    }
  }
);


// ===== hihaho 素材ライブラリ: /e/{id}/... を Storage からプロキシ配信 =====
// Hosting rewrite で /e/** を受け、Cloud Storage の hihaho-material/{id}/... を返す。
// Storage 直リンクだと相対パス（./style.css 等）が解決できないためプロキシしている。
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// このプロジェクトのバケットは .firebasestorage.app 形式。
// admin.storage().bucket() は FIREBASE_CONFIG 次第で .appspot.com に解決されることがあるため明示する。
const ASSET_BUCKET = 'cc-dev-ps7.firebasestorage.app';

const SERVE_MIME = {
  html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8',
  css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript; charset=utf-8',
  json:'application/json', txt:'text/plain; charset=utf-8', csv:'text/csv; charset=utf-8',
  svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', avif:'image/avif', ico:'image/x-icon',
  mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg',
  woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf',
  glb:'model/gltf-binary', gltf:'model/gltf+json', bin:'application/octet-stream',
  usdz:'model/vnd.usdz+zip', hdr:'image/vnd.radiance', wasm:'application/wasm', xml:'application/xml',
};

exports.assetServe = onRequest({ timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  try {
    const m = /^\/e\/([a-z0-9]{4,40})(\/(.*))?$/.exec((req.path || '').split('?')[0]);
    if (!m) { res.status(404).send('Not Found'); return; }

    const id = m[1];
    // /e/{id} は相対パスが解決できないので必ずスラッシュ付きへ寄せる
    if (m[2] === undefined) { res.redirect(301, `/e/${id}/`); return; }

    let sub = decodeURIComponent(m[3] || '');
    if (sub === '' || sub.endsWith('/')) sub += 'index.html';
    if (sub.includes('..') || sub.startsWith('/')) { res.status(400).send('Bad Request'); return; }

    const file = admin.storage().bucket(ASSET_BUCKET).file(`hihaho-material/${id}/${sub}`);
    const [exists] = await file.exists();
    if (!exists) { res.status(404).send('Not Found'); return; }

    const [meta] = await file.getMetadata();
    const ext = (sub.match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toLowerCase();
    const type = SERVE_MIME[ext] || meta.contentType || 'application/octet-stream';

    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Content-Type-Options', 'nosniff');
    // iFrame 埋め込み前提なので X-Frame-Options / CSP frame-ancestors は付けない

    if (req.method === 'HEAD') { res.status(200).end(); return; }
    file.createReadStream()
      .on('error', (e) => { console.error('assetServe stream error:', e); res.status(500).end(); })
      .pipe(res);
  } catch (e) {
    console.error('assetServe error:', e);
    res.status(500).send('Internal Error');
  }
});


// ===== mini-me (TINY ME): 3Dミニチュア受注サービス =====
// 実装は functions/mini-me.js。ここでは再エクスポートのみ行う。
// エンドポイントは firebase.json の rewrites 経由:
//   /api/mini-me-generate → miniMeGenerate
//   /api/mini-me-checkout → miniMeCheckout
//   /api/mini-me-webhook  → miniMeWebhook
const miniMe = require('./mini-me');
exports.miniMeGenerate = miniMe.miniMeGenerate;
exports.miniMeCheckout = miniMe.miniMeCheckout;
exports.miniMeWebhook = miniMe.miniMeWebhook;

// ===== hondoko (本ドコ？): 蔵書管理 =====
// 実装は functions/hondoko.js。エンドポイント: /api/hondoko-analyze
const hondoko = require('./hondoko');
exports.hondokoAnalyze = hondoko.hondokoAnalyze;
exports.hondokoAmazon = hondoko.hondokoAmazon;
