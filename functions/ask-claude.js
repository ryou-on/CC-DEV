// ===== askClaude: Claude API 呼び出し専用 Function（storyboard-maker 用） =====
// エンドポイント: https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/askClaude
// 認証: Firebase ID トークン必須 + サーバー側メール許可リスト
// シークレット: ANTHROPIC_API_KEY_PROMO（ロビー's Individual Org のキー）
//   登録: npx firebase functions:secrets:set ANTHROPIC_API_KEY_PROMO
// 詳細・コスト試算: functions/ASK_CLAUDE.md
//
// ※ functions/ 全体が CommonJS のため、このファイルも CommonJS で書いている。

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
// @anthropic-ai/sdk はデプロイ時のコード解析タイムアウト回避のため遅延読み込み

if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_API_KEY_PROMO = defineSecret('ANTHROPIC_API_KEY_PROMO');

// 呼び出しを許可するメールアドレス（クライアント側の制限とは別にサーバーでも検証）
const ALLOWED_EMAILS = ['junpei.omote@gmail.com'];
const ALLOWED_ORIGINS = ['https://cc-dev-ps7.web.app', 'https://cc-dev-ps7.firebaseapp.com'];

const MODELS = {
  sonnet: 'claude-sonnet-5-5', // 通常の生成
  haiku: 'claude-haiku-5-5',   // 軽量・大量処理
  opus: 'claude-opus-5-5',     // 高難度のみ（現状未使用）
};

// USD / 100万トークン（2026-10 時点の公開単価）。cacheWrite は 5分TTL（入力の1.25倍）
const PRICES = {
  [MODELS.sonnet]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  [MODELS.haiku]: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  [MODELS.opus]: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const BATCH_DISCOUNT = 0.5;
const MAX_BATCH_ITEMS = 50;
const ASPECTS = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16, '2.39:1': 2.39 };

// ===== 固定システムプロンプト（cache_control でキャッシュする部分） =====
const CONVERT_SYSTEM = `あなたはアニメ・CM・映像制作の絵コンテ担当です。与えられた脚本・シーン割り・メモを、カット単位の字コンテに分解してJSONで返します。

# 出力形式
- 出力はJSONのみ。前置き・説明文・コードフェンス（\`\`\`）は禁止
- 形式:
{"title":"作品タイトル","cuts":[{"scene":"シーン名","action":"画面内容","camera":"カメラワーク","dialogue":"セリフ","sound":"音","duration":3,"note":"補足"}]}

# 各フィールドの書き方
- scene: 場所と時間帯（例:「教室・放課後」「駅前・夜」）。同じシーンのカットには同じ文字列を入れる
- action: 画面に映る内容と芝居（ト書き）。構図（引き/寄り/俯瞰/あおり）、人物の位置と動き、表情を具体的に。1〜3文
- camera: PAN/TILT/TU（トラックアップ）/TB（トラックバック）/FIX/手持ち/ドリー/ズーム等。指定が無ければ空文字
- dialogue: 「話者「セリフ」」形式。ナレーションは「N「…」」。複数人のセリフは改行で区切る。無ければ空文字
- sound: SE・BGM・環境音。無ければ空文字
- duration: 秒数（数値）。日本語のセリフは1秒あたり約6文字で読む前提で、間（ま）や芝居の時間を足して見積もる。最低1.5秒
- note: テロップ指示や撮影上の補足。無ければ空文字

# カット割りのルール
- 1カット＝1つの画面構図。構図・アングル・被写体が変わる箇所でカットを分ける
- セリフが長い場合（目安15秒以上）や、話者の切り返しがある場合はカットを分ける
- 原文に書かれている情報（セリフ・ト書き・音・指示）を落とさない。創作で情報を足しすぎない
- 原文にカット番号や秒数が明記されていれば、それを優先して守る
- シーン割りだけで具体的なカットが無い場合は、各シーンを映像として成立する2〜5カットに分解する

# 例
入力: 「放課後の教室。ハヤトがスマホを見ている。サエコが近づき『こらハヤト』と声をかける。」
出力: {"title":"","cuts":[{"scene":"教室・放課後","action":"引きの絵で教室内。生徒は数人残っている。窓際の席でハヤトがスマホを見ている。","camera":"FIX","dialogue":"","sound":"放課後のざわめき","duration":3,"note":""},{"scene":"教室・放課後","action":"ハヤトの席を俯瞰。画面外からサエコが近づき、カット頭で立ち止まる。","camera":"","dialogue":"サエコ「こらハヤト」","sound":"","duration":2.5,"note":""}]}`;

const SVG_SYSTEM = `あなたはプロの絵コンテ作家です。指定されたカットの「ラフスケッチ」をSVGで描きます。

# 出力形式
- 出力は <svg> 要素のみ。前置き・説明文・コードフェンス（\`\`\`）は禁止
- ルート要素に xmlns="http://www.w3.org/2000/svg" と、指示された viewBox を必ず付ける
- 外部画像・フォント・スクリプト・<foreignObject> は使わない

# 画風
- 白背景（最初に画面全体を白で塗る rect を置く）
- 黒の線画が主体: stroke="#111" fill="none"、線幅は2〜4。輪郭はやや太く、内側の線は細く
- 影・面・空は薄い水色 #bfe3f5 で塗る（アニメ絵コンテの青鉛筆のイメージ）。塗りは線より先に描く
- 人物は頭・首・胴・腕・脚の輪郭がわかる簡易な人型で描く（棒人間は不可）。顔は目・眉・口の線で表情を示す
- 背景は消失点を意識したパースで、机・窓・壁・地平線などを少ない線で描く

# 構図の考え方
- 画面内容とカメラ指定から、アングル（アイレベル/俯瞰/あおり）とサイズ（ロング/ミドル/バスト/アップ）を決める
- 主役を三分割の交点付近に置き、手前・中景・奥の3層で奥行きを出す
- 直前のカットが与えられた場合は、イマジナリーラインを越えないよう人物の左右関係を保つ
- 文字は入れない。カメラワーク（PAN・TU・TB等）がある場合のみ、赤 #e11d48 の矢印や枠（OUT/INのフレーム）で示す

# 品質と分量
- 要素数は40〜120個程度。細部より、構図・配置・視線の流れが一目で伝わることを優先する
- path の座標は整数に丸め、冗長な属性を省いて短く書く`;

// ===== タスク定義（モデル・上限はサーバー側で固定。クライアントからは選べない） =====
const TASKS = {
  convert: { model: MODELS.sonnet, maxTokens: 6000, maxChars: 6000, dailyLimit: 20, system: CONVERT_SYSTEM },
  rough: { model: MODELS.sonnet, maxTokens: 3000, maxChars: 2000, dailyLimit: 60, system: SVG_SYSTEM },
  roughLite: { model: MODELS.haiku, maxTokens: 3000, maxChars: 2000, dailyLimit: 200, system: SVG_SYSTEM },
};

// ===== 純粋関数（テスト対象） =====
const dateJst = (now = Date.now()) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
const hashUid = uid => crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 16);
const str = v => (typeof v === 'string' ? v : '');

function canvasSize(aspect) {
  const r = ASPECTS[aspect] || ASPECTS['16:9'];
  return r >= 1 ? { w: 1280, h: Math.round(1280 / r) } : { w: Math.round(1280 * r), h: 1280 };
}

// 入力検証 → { ok, error, variable, user }
function validateInput(task, input) {
  const def = TASKS[task];
  if (!def) return { ok: false, error: '不明な処理です' };
  if (!input || typeof input !== 'object') return { ok: false, error: '入力がありません' };
  if (task === 'convert') {
    const text = str(input.text).trim();
    if (!text) return { ok: false, error: 'テキストが空です' };
    if (text.length > def.maxChars) return { ok: false, error: `テキストが長すぎます（${text.length}字 / 上限${def.maxChars}字）。シーンごとに分けて読み込んでください` };
    return { ok: true, variable: '', user: `次の脚本・シーン割りを字コンテJSONに変換してください。\n\n${text}` };
  }
  // rough / roughLite
  const f = { title: str(input.title), scene: str(input.scene), action: str(input.action), camera: str(input.camera), dialogue: str(input.dialogue), prevAction: str(input.prevAction) };
  const total = Object.values(f).reduce((a, v) => a + v.length, 0);
  if (total > def.maxChars) return { ok: false, error: `カットの文字数が多すぎます（${total}字 / 上限${def.maxChars}字）` };
  if (!f.action.trim() && !f.dialogue.trim()) return { ok: false, error: '画面内容かセリフを入力してください' };
  const { w, h } = canvasSize(input.aspect);
  return {
    ok: true,
    variable: `作品: ${f.title || '(無題)'}\n出力するSVGの viewBox: "0 0 ${w} ${h}"`,
    user: `次のカットのラフを描いてください。\nシーン: ${f.scene || '(未指定)'}\n画面内容: ${f.action || '(未指定)'}\nカメラ: ${f.camera || 'FIX'}\nセリフ: ${f.dialogue || 'なし'}${f.prevAction ? `\n直前のカット: ${f.prevAction}` : ''}`,
  };
}

// モデルごとの思考設定（単純な生成タスクなので思考はオフにしてコストを抑える）
function thinkingParams(model) {
  if (model === MODELS.sonnet) return { thinking: { type: 'between_tools' } };
  if (model === MODELS.haiku) return { thinking: { type: 'disabled' } };
  return { output_config: { effort: 'low' } }; // Opus 5.5 は思考を無効化できないため effort で抑える
}

// Messages API のリクエストパラメータを組み立てる
function buildParams(task, v) {
  const def = TASKS[task];
  const system = [{ type: 'text', text: def.system, cache_control: { type: 'ephemeral' } }];
  if (v.variable) system.push({ type: 'text', text: v.variable }); // 可変部分はキャッシュ境界の後ろ
  return { model: def.model, max_tokens: def.maxTokens, system, messages: [{ role: 'user', content: v.user }], ...thinkingParams(def.model) };
}

// usage から概算コスト（USD）を計算
function calcCost(model, usage, { batch = false } = {}) {
  const p = PRICES[model]; if (!p || !usage) return 0;
  const usd = ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output
    + (usage.cache_read_input_tokens || 0) * p.cacheRead + (usage.cache_creation_input_tokens || 0) * p.cacheWrite) / 1e6;
  return batch ? usd * BATCH_DISCOUNT : usd;
}

// ユーザー向け日本語エラーメッセージ（内部詳細は返さない）
function userMessage(err) {
  const s = err && err.status;
  const detail = String((err && err.error && err.error.error && err.error.error.message) || '');
  if (/credit balance/i.test(detail)) return 'AIの利用残高が不足しています。管理者に連絡してください。';
  if (s === 429) return '現在アクセスが集中しています。1分ほどおいて再度お試しください。';
  if (s === 529 || s === 503 || s === 502) return 'AIサーバーが混雑しています。少し時間をおいて再度お試しください。';
  if (s === 400 || s === 413) return 'リクエスト内容に問題があり処理できませんでした。入力を見直してください。';
  if (s === 401 || s === 403) return 'サーバー側のAI設定に問題があります。管理者に連絡してください。';
  return 'AI処理中にエラーが発生しました。時間をおいて再度お試しください。';
}

// ===== Firestore: レート制限・使用量記録 =====
const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// 日次回数を予約（上限超過なら ok:false）
async function reserveQuota(uidKey, task, n) {
  const date = dateJst();
  const ref = db().doc(`claude-usage/${uidKey}_${date}`);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const used = (snap.exists && snap.data().counts && snap.data().counts[task]) || 0;
    if (used + n > TASKS[task].dailyLimit) return { ok: false, used, limit: TASKS[task].dailyLimit };
    tx.set(ref, { date, uidKey, counts: { [task]: FieldValue.increment(n) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, used: used + n, limit: TASKS[task].dailyLimit };
  });
}
// 失敗時に予約を戻す
async function refundQuota(uidKey, task, n) {
  try { await db().doc(`claude-usage/${uidKey}_${dateJst()}`).set({ counts: { [task]: FieldValue.increment(-n) } }, { merge: true }); }
  catch (e) { console.error(JSON.stringify({ event: 'claude_refund_failed', task })); }
}

// usage をログと Firestore（ユーザー別・全体の日次集計）に記録
async function recordUsage(uidKey, task, model, usage, { batch = false, requests = 1 } = {}) {
  const costUsd = calcCost(model, usage, { batch });
  const tokens = {
    input: usage.input_tokens || 0, output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0, cacheWrite: usage.cache_creation_input_tokens || 0,
  };
  // APIキー・メール・入力本文はログに出さない
  console.log(JSON.stringify({ event: 'claude_usage', task, model, batch, requests, user: uidKey, ...tokens, costUsd: +costUsd.toFixed(6) }));
  const inc = {
    tokens: { input: FieldValue.increment(tokens.input), output: FieldValue.increment(tokens.output), cacheRead: FieldValue.increment(tokens.cacheRead), cacheWrite: FieldValue.increment(tokens.cacheWrite) },
    costUsd: FieldValue.increment(costUsd), requests: FieldValue.increment(requests), updatedAt: FieldValue.serverTimestamp(),
  };
  const date = dateJst();
  try {
    await Promise.all([
      db().doc(`claude-usage/${uidKey}_${date}`).set({ date, uidKey, ...inc }, { merge: true }),
      db().doc(`claude-usage-daily/${date}`).set({ date, ...inc, byModel: { [model.replace(/[^a-z0-9]/g, '_')]: { costUsd: FieldValue.increment(costUsd), requests: FieldValue.increment(requests) } } }, { merge: true }),
    ]);
  } catch (e) { console.error(JSON.stringify({ event: 'claude_usage_write_failed', task })); }
  return costUsd;
}

function logError(task, err) {
  console.error(JSON.stringify({ event: 'claude_error', task, status: err && err.status, type: err && err.error && err.error.error && err.error.error.type, name: err && err.name, requestId: err && (err.requestID || err.request_id) }));
}

// ===== HTTP ハンドラ =====
exports.askClaude = onRequest({
  region: 'asia-northeast1',
  timeoutSeconds: 300,
  memory: '512MiB',
  maxInstances: 5,
  secrets: [ANTHROPIC_API_KEY_PROMO],
}, async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST のみ対応しています' }); return; }

  // --- 認証（Firebase ID トークン + 許可リスト） ---
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) { res.status(401).json({ error: 'ログインが必要です' }); return; }
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(idToken); }
  catch { res.status(401).json({ error: 'ログインの有効期限が切れました。再読み込みしてください' }); return; }
  if (!decoded.email_verified || !ALLOWED_EMAILS.includes(decoded.email)) { res.status(403).json({ error: 'このアプリの利用が許可されていません' }); return; }
  const uidKey = hashUid(decoded.uid);

  const body = req.body || {};
  const action = body.action || 'stream';

  // --- 本日の利用状況 ---
  if (action === 'usage') {
    const snap = await db().doc(`claude-usage/${uidKey}_${dateJst()}`).get();
    const d = snap.exists ? snap.data() : {};
    const limits = Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, v.dailyLimit]));
    res.status(200).json({ date: dateJst(), counts: d.counts || {}, limits, costUsd: d.costUsd || 0 });
    return;
  }

  const Anthropic = require('@anthropic-ai/sdk');
  // maxRetries: 3 → 429 / 529 / 5xx / 接続エラーを SDK がジッタ付き指数バックオフで最大3回リトライ
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY_PROMO.value(), maxRetries: 3 });

  // --- バッチ作成（AIラフ一括・半額） ---
  if (action === 'batchCreate') {
    const task = body.task;
    if (task !== 'rough' && task !== 'roughLite') { res.status(400).json({ error: 'バッチに対応していない処理です' }); return; }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > MAX_BATCH_ITEMS) { res.status(400).json({ error: `一度に処理できるのは1〜${MAX_BATCH_ITEMS}件です` }); return; }
    const requests = [];
    for (const it of items) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(it && it.id))) { res.status(400).json({ error: 'カットIDが不正です' }); return; }
      const v = validateInput(task, it.input);
      if (!v.ok) { res.status(400).json({ error: v.error }); return; }
      requests.push({ custom_id: it.id, params: buildParams(task, v) });
    }
    const q = await reserveQuota(uidKey, task, requests.length);
    if (!q.ok) { res.status(429).json({ error: `本日の上限に達します（${q.used}/${q.limit}回使用済み）。明日またお試しください` }); return; }
    try {
      const batch = await client.messages.batches.create({ requests });
      await db().doc(`claude-batches/${batch.id}`).set({ uidKey, task, count: requests.length, usageRecorded: false, createdAt: FieldValue.serverTimestamp() });
      console.log(JSON.stringify({ event: 'claude_batch_created', task, count: requests.length, user: uidKey }));
      res.status(200).json({ batchId: batch.id, count: requests.length, used: q.used, limit: q.limit });
    } catch (err) {
      logError(task, err); await refundQuota(uidKey, task, requests.length);
      res.status(502).json({ error: userMessage(err) });
    }
    return;
  }

  // --- バッチ状況確認・結果取得 ---
  if (action === 'batchStatus') {
    const batchId = String(body.batchId || '');
    if (!/^msgbatch_[A-Za-z0-9]+$/.test(batchId)) { res.status(400).json({ error: 'バッチIDが不正です' }); return; }
    const ref = db().doc(`claude-batches/${batchId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uidKey !== uidKey) { res.status(404).json({ error: 'バッチが見つかりません' }); return; }
    const meta = snap.data();
    try {
      const b = await client.messages.batches.retrieve(batchId);
      if (b.processing_status !== 'ended') { res.status(200).json({ status: b.processing_status, counts: b.request_counts }); return; }
      const results = []; const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      let succeeded = 0;
      for await (const r of await client.messages.batches.results(batchId)) {
        if (r.result.type === 'succeeded') {
          const m = r.result.message; succeeded++;
          for (const k of Object.keys(usage)) usage[k] += (m.usage && m.usage[k]) || 0;
          if (m.stop_reason === 'refusal') { results.push({ id: r.custom_id, error: 'この内容は生成できませんでした' }); continue; }
          results.push({ id: r.custom_id, text: m.content.filter(c => c.type === 'text').map(c => c.text).join('') });
        } else results.push({ id: r.custom_id, error: r.result.type === 'expired' ? '期限切れ' : '生成に失敗しました' });
      }
      // 使用量は1回だけ記録（何度ポーリングされても二重計上しない）
      const first = await db().runTransaction(async tx => { const s = await tx.get(ref); if (s.data().usageRecorded) return false; tx.update(ref, { usageRecorded: true }); return true; });
      if (first) {
        await recordUsage(uidKey, meta.task, TASKS[meta.task].model, usage, { batch: true, requests: succeeded });
        const failed = meta.count - succeeded; if (failed > 0) await refundQuota(uidKey, meta.task, failed);
      }
      res.status(200).json({ status: 'ended', results });
    } catch (err) { logError(meta.task, err); res.status(502).json({ error: userMessage(err) }); }
    return;
  }

  // --- 通常呼び出し（ストリーミング） ---
  const task = body.task;
  const v = validateInput(task, body.input);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  const q = await reserveQuota(uidKey, task, 1);
  if (!q.ok) { res.status(429).json({ error: `本日の利用上限（${q.limit}回）に達しました。明日またお試しください` }); return; }

  const def = TASKS[task];
  const params = buildParams(task, v);
  let started = false;
  const send = obj => { if (!started) { started = true; res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }); } res.write(JSON.stringify(obj) + '\n'); };
  try {
    // Sonnet 5.5 は拒否時にサーバー側フォールバック（cyber 等の一部カテゴリのみ再実行）
    const stream = def.model === MODELS.sonnet
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : client.messages.stream(params);
    stream.on('text', t => send({ type: 'text', text: t }));
    const msg = await stream.finalMessage();
    const costUsd = await recordUsage(uidKey, task, PRICES[msg.model] ? msg.model : def.model, msg.usage || {});
    if (msg.stop_reason === 'refusal') { send({ type: 'error', message: 'この内容はAIのポリシーにより生成できませんでした。表現を変えてお試しください' }); }
    else send({ type: 'done', stopReason: msg.stop_reason, used: q.used, limit: q.limit, costUsd: +costUsd.toFixed(5) });
    res.end();
  } catch (err) {
    logError(task, err);
    if (!started) { await refundQuota(uidKey, task, 1); res.status(502).json({ error: userMessage(err) }); }
    else { send({ type: 'error', message: userMessage(err) }); res.end(); }
  }
});

exports.__test__ = { TASKS, MODELS, PRICES, validateInput, buildParams, calcCost, userMessage, dateJst, hashUid, canvasSize };
