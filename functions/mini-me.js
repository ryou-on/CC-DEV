/**
 * ちいさなじぶん— Cloud Functions
 * 株式会社企画7課
 *
 * 写真 → 3Dモデル生成（Meshy / Tripo）→ Stripe決済 までのサーバー側実装。
 *
 * エクスポート:
 *   - miniMeGenerate : 3D生成プロバイダのプロキシ（APIキーはサーバー側に隠蔽）
 *   - miniMeCheckout : Stripe Checkout Session 作成（価格は必ずサーバー側で計算）
 *   - miniMeWebhook  : Stripe webhook（checkout.session.completed → Firestoreに注文保存）
 *
 * ※ index.js は編集しない。index.js 側で
 *      const miniMe = require('./mini-me');
 *      exports.miniMeGenerate = miniMe.miniMeGenerate;
 *      exports.miniMeCheckout = miniMe.miniMeCheckout;
 *      exports.miniMeWebhook  = miniMe.miniMeWebhook;
 *   のように結線する（region は index.js の setGlobalOptions で asia-northeast1 済み）。
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

// index.js 側で初期化済みの場合があるので二重初期化を避ける
if (!admin.apps.length) admin.initializeApp();

// ---------------------------------------------------------------------------
// Secrets（Firebase Functions v2）
// ---------------------------------------------------------------------------
// 設定方法は public/mini-me/README.md を参照。
// defineSecret でバインドすると実行時に process.env にも同名で入る。
const MESHY_API_KEY = defineSecret('MESHY_API_KEY');
const TRIPO_API_KEY = defineSecret('TRIPO_API_KEY');
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

/** secret.value() は未設定時に例外を投げうるので必ずこれ経由で読む。値は絶対に外へ返さない。 */
function readSecret(param, envName) {
  try {
    const v = param.value();
    if (v) return v;
  } catch (_) { /* 未バインド / エミュレータ時 */ }
  return process.env[envName] || '';
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const SITE_ORIGIN = 'https://cc-dev-ps7.web.app';
const APP_URL = `${SITE_ORIGIN}/mini-me/`;

/** CORS は必要最小限（ワイルドカードを使わない） */
const ALLOWED_ORIGINS = new Set([
  'https://cc-dev-ps7.web.app',
  'https://cc-dev-ps7.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5173',
  'http://127.0.0.1:5000',
]);

/**
 * Firestore は「ドキュメントパスが偶数セグメント」でなければならないため、
 * 仕様上の `mini-me/tasks/{taskId}` は `mini-me/tasks/items/{taskId}` として格納する。
 * （mini-me = collection, tasks = doc, items = collection, {taskId} = doc）
 */
const TASKS_COL = 'mini-me/tasks/items';
const ORDERS_COL = 'mini-me/orders/items';
const RATE_COL = 'mini-me/ratelimit/items';

/**
 * 画像の上限（デコード後6MB相当）。base64 は約 4/3 に膨らむ。
 *
 * ※ 10MB にしないこと。functions-framework の JSONボディパーサ上限は 10MB（既定）なので、
 *    デコード後10MBの画像は base64 で約13.3MB＋JSONラッパとなり、
 *    このハンドラに到達する前にフレームワークが HTML の 413 を返してしまう
 *    （クライアントは JSON でないレスポンスを受けてエラー本文を出せない）。
 *    6MB なら base64 で約8MB＋ラッパに収まり、必ずここまで到達して JSON で 413 を返せる。
 *    クライアント（public/mini-me/index.html）側は送信前に長辺1600px/JPEG品質0.85へ縮小するため、
 *    通常のスマホ写真がこの上限に当たることはない。
 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 1024;

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const PING_TASK_ID = '__ping__';
const TASK_ID_RE = /^[A-Za-z0-9_:-]{6,128}$/;

// --- 生成API（実費が発生する）の濫用防止 -----------------------------------
// miniMeGenerate の POST は 1回＝Meshy実費（推定 ¥90〜¥250/体）。認証を持たないため、
// (a) Origin必須 (b) IP単位の日次上限 (c) サービス全体の日次上限 の3段で守る。
// 恒久対策としては Firebase App Check（Recaptcha Enterprise）の必須化を推奨（README §8）。
function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
const RATE_LIMIT_PER_IP_PER_DAY = envInt('MINI_ME_RATE_PER_IP', 10);
const RATE_LIMIT_GLOBAL_PER_DAY = envInt('MINI_ME_RATE_GLOBAL', 200);
/** Origin ヘッダ無しの POST を許すデバッグ用の逃げ道（既定 off）。本番では絶対に立てないこと。 */
const ALLOW_NO_ORIGIN_POST = process.env.MINI_ME_ALLOW_NO_ORIGIN === '1';

// ---------------------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------------------
function applyCors(req, res) {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

/**
 * origin ヘッダがある場合のみ検査する（GET＝状態取得のような無コストな経路向け）。
 * ブラウザは GET/HEAD に Origin を付けないため、GET でこれ以上厳しくはできない。
 */
function originAllowed(req) {
  const origin = req.get('origin');
  return !origin || ALLOWED_ORIGINS.has(origin);
}

/**
 * 実費が発生する POST 用の厳格版。Origin を必須にする。
 * Fetch仕様上、GET/HEAD 以外のリクエストには同一オリジンでも Origin が付与されるため、
 * 正規のブラウザクライアントは必ずこれを通過する（curl等は通らない＝踏み台にされない）。
 */
function originAllowedStrict(req) {
  const origin = req.get('origin');
  if (!origin) return ALLOW_NO_ORIGIN_POST;
  return ALLOWED_ORIGINS.has(origin);
}

function db() {
  return admin.firestore();
}

/** クライアントIP（Firebase Hosting 経由なので X-Forwarded-For の先頭が実クライアント） */
function clientIp(req) {
  const xff = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return xff || req.ip || 'unknown';
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 生成リクエストの日次レート制限。IP単位とサービス全体の2本を同一トランザクションで加算する。
 * 超過時は httpStatus 429 の例外を投げる。Firestore が使えない場合は「止めない」側に倒す
 * （課金保護は上位の Cloud Billing 予算アラートにも二重で用意すること／README §8）。
 */
async function consumeGenerateQuota(req) {
  const day = utcDayKey();
  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  const col = db().collection(RATE_COL);
  const ipRef = col.doc(`${day}_ip_${ipHash}`);
  const globalRef = col.doc(`${day}_global`);

  try {
    await db().runTransaction(async (tx) => {
      const [ipSnap, gSnap] = await tx.getAll(ipRef, globalRef);
      const ipCount = Number((ipSnap.data() || {}).count || 0);
      const gCount = Number((gSnap.data() || {}).count || 0);

      if (gCount >= RATE_LIMIT_GLOBAL_PER_DAY) {
        throw Object.assign(new Error('本日の生成上限に達しました。時間をおいてお試しください。'), { httpStatus: 429 });
      }
      if (ipCount >= RATE_LIMIT_PER_IP_PER_DAY) {
        throw Object.assign(new Error('生成のご利用が集中しています。しばらくしてからお試しください。'), { httpStatus: 429 });
      }

      const stamp = admin.firestore.FieldValue.serverTimestamp();
      tx.set(ipRef, { count: ipCount + 1, day, updatedAt: stamp }, { merge: true });
      tx.set(globalRef, { count: gCount + 1, day, updatedAt: stamp }, { merge: true });
    });
  } catch (e) {
    if (e && e.httpStatus === 429) throw e;
    // レート制限の記録自体に失敗しただけならリクエストは通す（可用性優先）
    console.error('[mini-me] rate limit bookkeeping failed', e);
  }
}

/** ログ/レスポンスに秘匿値が混ざらないよう、外部エラー文字列を短く丸める */
function safeErrorMessage(raw, fallback = '生成に失敗しました') {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  return raw.replace(/[A-Za-z0-9_-]{24,}/g, '***').slice(0, 200);
}

// ---------------------------------------------------------------------------
// 3D生成プロバイダ抽象化
//   共通インターフェース:
//     id            : string
//     isConfigured(): boolean
//     createTask({ dataUri, mimeType }) -> { providerTaskId }
//     getTask(providerTaskId)           -> { status, progress, modelUrl, error }
//   status は 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' に正規化する
//   （プロバイダ固有のステータス名はクライアントへ漏らさない）
// ---------------------------------------------------------------------------

const NORMALIZED = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
};

/* ------------------------------- Meshy ---------------------------------- */
// 要検証（2026-07時点）— 実レスポンスでの確認はまだ取れていない。以下はドキュメント要約に基づく実装。
//   POST https://api.meshy.ai/openapi/v1/image-to-3d      → { "result": "<task_id>" }
//   GET  https://api.meshy.ai/openapi/v1/image-to-3d/:id  → { id, status, progress, model_urls:{glb,...}, task_error:{message} }
//   認証: Authorization: Bearer <API_KEY>
//   status: PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELED
//   image_url は公開URL または base64 データURI（data:image/jpeg;base64,....）を受け付ける
//
// ★公開前の必須作業（README §8）:
//   実キーで下記を1回叩き、レスポンス実物をこのコメントに「確認日つきで」貼ること。
//     curl -s -X POST https://api.meshy.ai/openapi/v1/image-to-3d \
//       -H "Authorization: Bearer $MESHY_API_KEY" -H 'Content-Type: application/json' \
//       -d '{"image_url":"data:image/jpeg;base64,..."}'
//   確認が取れるまで、値が未確定のリクエストフィールドは送らない方針とする（下記 createTask 参照）。
const MESHY_BASE = 'https://api.meshy.ai/openapi/v1';

const meshyProvider = {
  id: 'meshy',

  isConfigured() {
    return !!readSecret(MESHY_API_KEY, 'MESHY_API_KEY');
  },

  async createTask({ dataUri }) {
    const key = readSecret(MESHY_API_KEY, 'MESHY_API_KEY');
    // 値が未確定のフィールドは「送らない」。未知フィールド1つで 400 になり全生成が死ぬため、
    // 実レスポンスで受理を確認できたものだけを足していく方針（下の「保留中」参照）。
    const body = {
      image_url: dataUri,
      // フィギュア用途なので「テクスチャあり・3Dプリント向けの控えめなポリゴン数」で固定
      topology: 'triangle',
      target_polycount: 30000,
      should_remesh: true,
      should_texture: true,
      enable_pbr: false,        // Web プレビュー(three.js)用途では PBR マップは必須ではない
      moderation: true,         // 不適切画像の自動ブロック
    };
    // 保留中（受理を確認できるまで送らない。送ると 400 で全生成が停止するリスクがある）:
    //   ai_model: 'latest'        … enum の実値が未確認。未指定なら API 既定モデルが使われる
    //   texture_resolution: '2k'  … テクスチャ生成タスク側のパラメータの疑い
    //   pose_mode: ''             … 空文字を enum 値として送るのは確実に不正。明示値が判明するまで送らない
    //   target_formats: ['glb','stl'] … image-to-3d での受理が未確認。
    //                                   未指定時に model_urls.stl が返るかも要確認（返らない場合は
    //                                   printUrl が null になるだけでプレビュー(glb)は動く）
    //   auto_size / origin_at     … プリントサイズ確定フローを実装する際に見直す

    const r = await fetch(`${MESHY_BASE}/image-to-3d`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500 && r.status !== 402 && r.status !== 429) {
        // 4xx はリトライ不能な設定ミス（未知フィールド / 値不正 / キー不正）。
        // 原因特定できるよう、送ったフィールド「名」だけを出す（画像本体・APIキーは出さない）。
        console.error(
          '[mini-me] meshy create rejected (config error)',
          r.status,
          'sent fields:', Object.keys(body).join(','),
          'response:', text.slice(0, 500)
        );
      } else {
        console.error('[mini-me] meshy create failed', r.status, text.slice(0, 500));
      }
      const err = new Error(safeErrorMessage(text, '3D生成タスクの作成に失敗しました'));
      err.httpStatus = r.status === 402 ? 503 : 502;
      throw err;
    }

    let json = {};
    try { json = JSON.parse(text); } catch (_) { /* noop */ }
    const providerTaskId = json.result || json.id;
    if (!providerTaskId) {
      throw Object.assign(new Error('3D生成タスクIDを取得できませんでした'), { httpStatus: 502 });
    }
    return { providerTaskId: String(providerTaskId) };
  },

  async getTask(providerTaskId) {
    const key = readSecret(MESHY_API_KEY, 'MESHY_API_KEY');
    const r = await fetch(`${MESHY_BASE}/image-to-3d/${encodeURIComponent(providerTaskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    const text = await r.text();
    if (!r.ok) {
      console.error('[mini-me] meshy get failed', r.status, text.slice(0, 500));
      const err = new Error(safeErrorMessage(text, 'タスク状態の取得に失敗しました'));
      err.httpStatus = r.status === 404 ? 404 : 502;
      throw err;
    }

    let t = {};
    try { t = JSON.parse(text); } catch (_) { /* noop */ }

    const raw = String(t.status || '').toUpperCase();
    let status;
    if (raw === 'SUCCEEDED') status = NORMALIZED.SUCCEEDED;
    else if (raw === 'FAILED' || raw === 'CANCELED' || raw === 'CANCELLED') status = NORMALIZED.FAILED;
    else if (raw === 'IN_PROGRESS') status = NORMALIZED.IN_PROGRESS;
    else status = NORMALIZED.PENDING;

    const urls = t.model_urls || {};
    return {
      status,
      progress: Number.isFinite(t.progress) ? t.progress : 0,
      modelUrl: status === NORMALIZED.SUCCEEDED ? (urls.glb || null) : null,
      printUrl: status === NORMALIZED.SUCCEEDED ? (urls.stl || null) : null,
      thumbnailUrl: t.thumbnail_url || null,
      error: status === NORMALIZED.FAILED
        ? safeErrorMessage(t.task_error && t.task_error.message)
        : null,
    };
  },
};

/* ------------------------------- Tripo ---------------------------------- */
// 要確認: 以下は公式ドキュメント（platform.tripo3d.ai / docs.tripo3d.ai）の要約に基づくスタブ。
//   実運用前に必ず実物のレスポンスで検証すること。
//   - ベースURL : https://api.tripo3d.ai/v2/openapi   （確認済み）
//   - 認証      : Authorization: Bearer <API_KEY>      （確認済み）
//   - タスク作成: POST /task   body { type: 'image_to_model', file: {...} }（確認済み）
//   - 画像入力  : 要確認。multipart で POST /upload → file_token を得て
//                 file:{ type:'jpg', file_token } を渡す方式が基本。
//                 file:{ type:'jpg', url:'https://...' } の公開URL指定可否は要確認。
//                 base64 直接指定は未確認（Meshy と違い非対応の可能性が高い）。
//   - 取得      : GET /task/{task_id} → { code:0, data:{ status, progress, output:{ pbr_model | model } } }（要確認）
//   - status    : queued / running / success / failed / cancelled / banned / expired（要確認）
const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const tripoProvider = {
  id: 'tripo',

  isConfigured() {
    return !!readSecret(TRIPO_API_KEY, 'TRIPO_API_KEY');
  },

  async createTask({ dataUri, mimeType }) {
    const key = readSecret(TRIPO_API_KEY, 'TRIPO_API_KEY');

    // 1) 画像アップロード（要確認: エンドポイント名・フィールド名・レスポンス形状）
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpeg');
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const bin = Buffer.from(base64, 'base64');

    const form = new FormData();
    form.set('file', new Blob([bin], { type: mimeType }), `upload.${ext}`);

    const up = await fetch(`${TRIPO_BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const upText = await up.text();
    if (!up.ok) {
      console.error('[mini-me] tripo upload failed', up.status, upText.slice(0, 500));
      throw Object.assign(new Error('画像アップロードに失敗しました'), { httpStatus: 502 });
    }
    let upJson = {};
    try { upJson = JSON.parse(upText); } catch (_) { /* noop */ }
    const fileToken = (upJson.data && (upJson.data.image_token || upJson.data.file_token)) || null;
    if (!fileToken) {
      throw Object.assign(new Error('画像トークンを取得できませんでした（Tripo連携は要確認）'), { httpStatus: 502 });
    }

    // 2) タスク作成
    const r = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'image_to_model',
        file: { type: ext === 'jpeg' ? 'jpg' : ext, file_token: fileToken },
        // 要確認: model_version は固定せず既定に任せる。texture / pbr の指定名も要確認。
        texture: true,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error('[mini-me] tripo create failed', r.status, text.slice(0, 500));
      throw Object.assign(new Error('3D生成タスクの作成に失敗しました'), { httpStatus: 502 });
    }
    let json = {};
    try { json = JSON.parse(text); } catch (_) { /* noop */ }
    const providerTaskId = json.data && json.data.task_id;
    if (!providerTaskId) {
      throw Object.assign(new Error('3D生成タスクIDを取得できませんでした'), { httpStatus: 502 });
    }
    return { providerTaskId: String(providerTaskId) };
  },

  async getTask(providerTaskId) {
    const key = readSecret(TRIPO_API_KEY, 'TRIPO_API_KEY');
    const r = await fetch(`${TRIPO_BASE}/task/${encodeURIComponent(providerTaskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await r.text();
    if (!r.ok) {
      console.error('[mini-me] tripo get failed', r.status, text.slice(0, 500));
      throw Object.assign(new Error('タスク状態の取得に失敗しました'), { httpStatus: 502 });
    }
    let json = {};
    try { json = JSON.parse(text); } catch (_) { /* noop */ }
    const d = json.data || {};

    // 要確認: ステータス文字列の実値
    const raw = String(d.status || '').toLowerCase();
    let status;
    if (raw === 'success') status = NORMALIZED.SUCCEEDED;
    else if (['failed', 'cancelled', 'canceled', 'banned', 'expired', 'unknown'].includes(raw)) status = NORMALIZED.FAILED;
    else if (raw === 'running') status = NORMALIZED.IN_PROGRESS;
    else status = NORMALIZED.PENDING;

    const out = d.output || {};
    return {
      status,
      progress: Number.isFinite(d.progress) ? d.progress : 0,
      modelUrl: status === NORMALIZED.SUCCEEDED ? (out.pbr_model || out.model || null) : null,
      printUrl: null, // 要確認: Tripo の STL 取得は別途 convert タスクが必要な可能性あり
      thumbnailUrl: out.rendered_image || null,
      error: status === NORMALIZED.FAILED ? '生成に失敗しました' : null,
    };
  },
};

const PROVIDERS = { meshy: meshyProvider, tripo: tripoProvider };

function activeProvider() {
  const name = (process.env.MODEL_PROVIDER || 'meshy').toLowerCase();
  return PROVIDERS[name] || PROVIDERS.meshy;
}

// ---------------------------------------------------------------------------
// 1) miniMeGenerate — 3D生成プロキシ
// ---------------------------------------------------------------------------
exports.miniMeGenerate = onRequest(
  {
    secrets: [MESHY_API_KEY, TRIPO_API_KEY],
    cors: false,            // CORS は自前で最小限に制御する
    timeoutSeconds: 120,
    memory: '512MiB',
    invoker: 'public',
  },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (!originAllowed(req)) { res.status(403).json({ error: 'origin not allowed' }); return; }

    const provider = activeProvider();

    // ---- GET: 状態取得 / 疎通確認 ----
    if (req.method === 'GET') {
      const taskId = String(req.query.taskId || '');

      if (taskId === PING_TASK_ID) {
        if (!provider.isConfigured()) {
          res.status(503).json({ error: 'model provider not configured', demo: true });
          return;
        }
        res.status(200).json({ status: NORMALIZED.PENDING, progress: 0 });
        return;
      }

      if (!TASK_ID_RE.test(taskId)) {
        res.status(400).json({ error: 'taskId が不正です' });
        return;
      }
      if (!provider.isConfigured()) {
        res.status(503).json({ error: 'model provider not configured', demo: true });
        return;
      }

      try {
        const snap = await db().collection(TASKS_COL).doc(taskId).get();
        if (!snap.exists) { res.status(404).json({ error: 'タスクが見つかりません' }); return; }

        const rec = snap.data() || {};
        const p = PROVIDERS[rec.provider] || provider;
        const result = await p.getTask(rec.meshyTaskId);

        // Firestore を最新状態に更新（失敗しても応答は返す）。
        // ★ await 必須: Cloud Run(2nd gen) はレスポンス送出後に CPU 割当が絞られるため、
        //   await しないとこの書き込みはほぼ完走せず、modelUrl / printUrl が永続化されない
        //   （＝決済後に成果物URLをサーバー側から辿れなくなる）。
        await snap.ref.set({
          status: result.status,
          progress: result.progress,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(result.modelUrl ? { modelUrl: result.modelUrl } : {}),
          ...(result.printUrl ? { printUrl: result.printUrl } : {}),
        }, { merge: true }).catch((e) => console.error('[mini-me] task update failed', e));

        res.set('Cache-Control', 'no-store');
        res.status(200).json({
          status: result.status,
          progress: result.progress,
          modelUrl: result.modelUrl,
          thumbnailUrl: result.thumbnailUrl,
          error: result.error,
        });
      } catch (e) {
        console.error('[mini-me] generate GET error', e);
        res.status(e.httpStatus || 500).json({ error: safeErrorMessage(e.message, 'サーバーエラー') });
      }
      return;
    }

    // ---- POST: タスク作成（1回＝実費が発生するので厳しめに絞る）----
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'GET または POST のみ' });
      return;
    }

    // Origin 必須。GET/HEAD 以外には同一オリジンでも Origin が付くのでブラウザからは必ず通る。
    if (!originAllowedStrict(req)) {
      res.status(403).json({ error: 'origin not allowed' });
      return;
    }

    if (!provider.isConfigured()) {
      res.status(503).json({ error: 'model provider not configured', demo: true });
      return;
    }

    const body = req.body || {};
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const mimeType = String(body.mimeType || 'image/jpeg').toLowerCase();

    if (!imageBase64) { res.status(400).json({ error: 'imageBase64 が必要です' }); return; }
    if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
      res.status(400).json({ error: '対応形式は PNG / JPEG / WebP です' });
      return;
    }

    // data URI プレフィックス付きで送られてきた場合は剥がす
    const pure = imageBase64.startsWith('data:')
      ? imageBase64.slice(imageBase64.indexOf(',') + 1)
      : imageBase64;

    if (pure.length > MAX_BASE64_CHARS) {
      res.status(413).json({
        error: `画像サイズが大きすぎます（${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MBまで）`,
      });
      return;
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(pure.slice(0, 4096))) {
      res.status(400).json({ error: 'imageBase64 の形式が不正です' });
      return;
    }

    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const dataUri = `data:${normalizedMime};base64,${pure.replace(/\s/g, '')}`;

    try {
      // 実費を伴う外部API呼び出しの直前でクォータを消費する
      await consumeGenerateQuota(req);

      const { providerTaskId } = await provider.createTask({ dataUri, mimeType: normalizedMime });

      // クライアントへ返す ID は自前で発行し、プロバイダのIDは内部に留める
      const taskId = `mm_${crypto.randomUUID().replace(/-/g, '')}`;

      await db().collection(TASKS_COL).doc(taskId).set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: NORMALIZED.PENDING,
        meshyTaskId: providerTaskId,   // 仕様どおりのフィールド名（プロバイダ問わずこの名前で保持）
        provider: provider.id,
        progress: 0,
      });

      res.status(200).json({ taskId });
    } catch (e) {
      console.error('[mini-me] generate POST error', e);
      res.status(e.httpStatus || 500).json({ error: safeErrorMessage(e.message, 'サーバーエラー') });
    }
  }
);

// ---------------------------------------------------------------------------
// 2) miniMeCheckout — Stripe Checkout Session 作成
// ---------------------------------------------------------------------------

/**
 * 価格表（税込・円）— サーバー側の唯一の正。
 * クライアントから送られてきた金額は一切信用しない。
 */
const PLANS = {
  S: { label: 'ちいさなじぶん S（40mm）',  sizeMm: 40,  price: 7800 },
  M: { label: 'ちいさなじぶん M（65mm）',  sizeMm: 65,  price: 12800 },
  L: { label: 'ちいさなじぶん L（100mm）', sizeMm: 100, price: 19800 },
};

const OPTIONS = {
  base:       { label: '台座（アクリル/流木風）', price: 1200 },
  waterproof: { label: '防水コーティング（水中設置対応）', price: 1500 },
};

const SHIPPING_FEE = 800;                 // 全国一律
const FREE_SHIPPING_THRESHOLD = 15000;    // 小計がこの額以上で送料無料
const MULTI_FIGURE_DISCOUNT = 0.20;       // 追加ポーズ2体目以降 20%OFF（本体価格のみ、オプションは対象外）
const MAX_TOTAL_QTY = 50;

/**
 * サーバー側で受注内容と金額を確定する。金額の唯一の正。
 * 単体テスト: functions/test/mini-me.price.test.js（`cd functions && npm test`）
 * @returns {{ lineItems: Array, subtotal: number, shipping: number, total: number, summary: string,
 *            breakdown: { qty:number, bodyTotal:number, optionTotal:number, discountTotal:number } }}
 */
function priceOrder(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('items が空です'), { httpStatus: 400 });
  }

  const overQty = () => Object.assign(
    new Error(`一度に注文できるのは${MAX_TOTAL_QTY}体までです`),
    { httpStatus: 400 }
  );

  // ★ 上限チェックは「1体ずつ展開する前」に行う。
  //   展開後にチェックすると qty:1e9 のような入力で figures.push が10億回走り、
  //   到達する前にヒープを食い潰してインスタンスが OOM で落ちる（無認証の公開エンドポイント）。
  if (items.length > MAX_TOTAL_QTY) throw overQty();

  // 1体ずつに展開（2体目以降割引を正確に適用するため）
  const figures = [];
  let totalQty = 0;
  for (const raw of items) {
    const planKey = String((raw && raw.plan) || '').toUpperCase();
    const plan = PLANS[planKey];
    if (!plan) throw Object.assign(new Error(`不明なプラン: ${planKey}`), { httpStatus: 400 });

    const qty = Math.floor(Number((raw && raw.qty) || 0));
    // Number.isFinite は Infinity / NaN を弾くが巨大な有限値は素通りするので上限も併せて見る
    if (!Number.isFinite(qty) || qty < 1) {
      throw Object.assign(new Error('qty は1以上の整数です'), { httpStatus: 400 });
    }
    if (qty > MAX_TOTAL_QTY) throw overQty();
    totalQty += qty;
    if (totalQty > MAX_TOTAL_QTY) throw overQty();

    const optKeys = Array.isArray(raw.options) ? raw.options : [];
    if (optKeys.length > 16) {
      throw Object.assign(new Error('オプションの指定が不正です'), { httpStatus: 400 });
    }
    for (const o of optKeys) {
      if (!OPTIONS[o]) throw Object.assign(new Error(`不明なオプション: ${o}`), { httpStatus: 400 });
    }
    const uniqueOpts = [...new Set(optKeys)];
    const optTotal = uniqueOpts.reduce((s, o) => s + OPTIONS[o].price, 0);

    for (let i = 0; i < qty; i++) {
      figures.push({ planKey, plan, opts: uniqueOpts, optTotal });
    }
  }

  // ★ 割引の割当をクライアント入力順に依存させない。
  //   本体価格の降順に並べ替えてから「先頭の1体だけ満額」とすることで、
  //   items の並び順を変えても合計額が変わらないようにする（同額はキーで安定化）。
  //   例: [S,L] と [L,S] で小計が変わってしまう問題への対処。
  figures.sort((a, b) =>
    (b.plan.price - a.plan.price) ||
    a.planKey.localeCompare(b.planKey) ||
    a.opts.join(',').localeCompare(b.opts.join(','))
  );

  // 2体目以降20%OFF。割引対象は「本体価格のみ」で、オプション代（台座・防水）は割引しない。
  // クライアント（public/mini-me/index.html の calc()）も同じ仕様に揃えてあること。
  let normalIndex = 0;
  const grouped = new Map();
  let subtotal = 0;
  let bodyTotal = 0;      // 本体の定価合計（割引前）
  let optionTotal = 0;    // オプション合計（割引対象外）
  let discountTotal = 0;  // 2体目以降割引の合計

  for (const f of figures) {
    let unitBody = f.plan.price;
    let discounted = false;
    if (normalIndex > 0) {
      unitBody = Math.round(f.plan.price * (1 - MULTI_FIGURE_DISCOUNT));
      discounted = true;
    }
    normalIndex++;

    const unit = unitBody + f.optTotal;   // JPY はゼロ decimal 通貨。100倍しないこと。
    subtotal += unit;
    bodyTotal += f.plan.price;
    optionTotal += f.optTotal;
    discountTotal += f.plan.price - unitBody;

    const optLabel = f.opts.length ? ` + ${f.opts.map((o) => OPTIONS[o].label).join(' / ')}` : '';
    const name = `${f.plan.label}${optLabel}${discounted ? '（2体目以降 20%OFF）' : ''}`;
    const key = `${f.planKey}|${f.opts.join(',')}|${unit}`;

    if (grouped.has(key)) {
      grouped.get(key).quantity += 1;
    } else {
      grouped.set(key, { name, unit, quantity: 1, planKey: f.planKey });
    }
  }

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

  const lineItems = [...grouped.values()].map((g) => ({
    quantity: g.quantity,
    price_data: {
      currency: 'jpy',
      // JPY はゼロ decimal 通貨なので unit_amount はそのままの円額（×100 しない）
      unit_amount: g.unit,
      product_data: { name: g.name },
    },
  }));

  const summary = [...grouped.values()]
    .map((g) => `${g.planKey}x${g.quantity}`)
    .join(',')
    .slice(0, 480);

  return {
    lineItems,
    subtotal,
    shipping,
    total: subtotal + shipping,
    summary,
    // クライアント表示用の内訳（この値をそのまま画面に出せば表示と請求が必ず一致する）
    breakdown: { qty: figures.length, bodyTotal, optionTotal, discountTotal },
  };
}

exports.miniMeCheckout = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY],
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (!originAllowed(req)) { res.status(403).json({ error: 'origin not allowed' }); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POSTのみ' }); return; }

    // ---- 見積のみ（{ quote: true }）----
    // 価格ロジックをクライアントに二重実装させないための経路。
    // Stripe セッションは作らず、priceOrder() が確定した金額だけを返す。
    // クライアントはこの値をそのまま表示するので「表示額 ≠ 請求額」が構造的に起きない。
    // （新しい export を増やすと index.js の結線を変える必要があるため、同一エンドポイントに同居させる）
    if (req.body && req.body.quote === true) {
      try {
        const q = priceOrder(req.body.items);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({
          subtotal: q.subtotal,
          shipping: q.shipping,
          total: q.total,
          ...q.breakdown,
        });
      } catch (e) {
        res.status(e.httpStatus || 400).json({ error: safeErrorMessage(e.message, '金額を計算できませんでした') });
      }
      return;
    }

    const secret = readSecret(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY');
    if (!secret) {
      res.status(503).json({ error: 'stripe not configured', demo: true });
      return;
    }

    let Stripe;
    try {
      Stripe = require('stripe');
    } catch (e) {
      console.error('[mini-me] stripe パッケージ未インストール', e);
      res.status(503).json({ error: 'stripe not configured', demo: true });
      return;
    }

    try {
      const body = req.body || {};
      const customer = body.customer || {};
      const shopCode = String(body.shopCode || '').trim().slice(0, 40);
      const taskId = String(body.taskId || '').trim().slice(0, 128);

      if (shopCode && !/^[A-Za-z0-9_-]{1,40}$/.test(shopCode)) {
        res.status(400).json({ error: 'shopCode が不正です' });
        return;
      }
      if (taskId && !TASK_ID_RE.test(taskId)) {
        res.status(400).json({ error: 'taskId が不正です' });
        return;
      }

      // ★ 金額はここで確定する。クライアント送信の金額は一切参照しない。
      const { lineItems, subtotal, shipping, total, summary } = priceOrder(body.items);

      const email = typeof customer.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)
        ? customer.email.slice(0, 254)
        : undefined;

      const stripe = Stripe(secret, { apiVersion: '2024-06-20' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        // ★ 明示必須。未指定だと Stripe ダッシュボードで有効な決済手段（JPだとコンビニ払い・
        //   銀行振込などの後払い系）が使われ、checkout.session.completed が payment_status:'unpaid'
        //   で発火して未入金の注文が発送フローに流れ込む。カード即時決済のみに限定する。
        payment_method_types: ['card'],
        line_items: lineItems,
        // 通貨は line_items[].price_data.currency / shipping_rate_data で 'jpy' を指定済み。
        // トップレベル currency との二重指定は Stripe 側で衝突しうるので付けない。
        locale: 'ja',
        customer_email: email,
        shipping_address_collection: { allowed_countries: ['JP'] },
        phone_number_collection: { enabled: true },
        shipping_options: [{
          shipping_rate_data: {
            type: 'fixed_amount',
            // JPY ゼロ decimal。送料800円は amount: 800
            fixed_amount: { amount: shipping, currency: 'jpy' },
            display_name: shipping === 0 ? '送料無料（¥15,000以上）' : '全国一律送料',
          },
        }],
        metadata: {
          taskId: taskId || '',
          shopCode: shopCode || '',   // 実店舗バック（税抜売上の15%）集計用
          items: summary,
          subtotal: String(subtotal),
          shipping: String(shipping),
          total: String(total),
          service: 'tiny-me',
        },
        success_url: `${APP_URL}?checkout=success`,
        cancel_url: `${APP_URL}?checkout=cancel`,
      });

      res.status(200).json({ url: session.url });
    } catch (e) {
      console.error('[mini-me] checkout error', e);
      const status = e.httpStatus || (e.type && String(e.type).startsWith('Stripe') ? 502 : 500);
      res.status(status).json({ error: safeErrorMessage(e.message, '決済セッションの作成に失敗しました') });
    }
  }
);

// ---------------------------------------------------------------------------
// 3) miniMeWebhook — Stripe webhook
// ---------------------------------------------------------------------------
/**
 * Stripe 側で購読するイベント（README §6 のwebhook設定と一致させること）。
 * async_* は後払い系が有効化された場合の保険。payment_method_types:['card'] を
 * 明示しているので通常は発火しないが、設定変更で後払いを解禁したときに取りこぼさない。
 */
const HANDLED_SESSION_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

exports.miniMeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }

    const secret = readSecret(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY');
    const whSecret = readSecret(STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET');
    if (!secret || !whSecret) { res.status(503).send('stripe not configured'); return; }

    let Stripe;
    try {
      Stripe = require('stripe');
    } catch (e) {
      console.error('[mini-me] stripe パッケージ未インストール', e);
      res.status(503).send('stripe not configured');
      return;
    }

    const stripe = Stripe(secret, { apiVersion: '2024-06-20' });

    let event;
    try {
      const sig = req.get('stripe-signature');
      // 署名検証には生ボディが必須（req.body ではなく req.rawBody）
      event = stripe.webhooks.constructEvent(req.rawBody, sig, whSecret);
    } catch (e) {
      console.error('[mini-me] webhook signature verification failed:', e.message);
      res.status(400).send(`Webhook Error: signature verification failed`);
      return;
    }

    try {
      if (HANDLED_SESSION_EVENTS.has(event.type)) {
        const s = event.data.object;
        const md = s.metadata || {};
        const subtotalIncTax = Number(md.subtotal || 0);

        // ★ 入金済みかを必ず確認する。後払い系（コンビニ払い等）が有効な場合、
        //   checkout.session.completed は payment_status:'unpaid' でも発火するため、
        //   これを見ずに fulfillment:'pending' を立てると未入金の注文が印刷/発送へ流れる。
        const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
        const failed = event.type === 'checkout.session.async_payment_failed';
        const nextFulfillment = failed ? 'payment_failed' : (paid ? 'pending' : 'awaiting_payment');

        // 実店舗バック = 税抜売上の15%（税込価格から10%の消費税を除いて算出／推定）
        // 未入金・失敗の時点では計上しない。
        const netExTax = Math.round(subtotalIncTax / 1.1);
        const shopKickback = (paid && !failed && md.shopCode) ? Math.round(netExTax * 0.15) : 0;

        const orderRef = db().collection(ORDERS_COL).doc(s.id);
        const prevSnap = await orderRef.get();
        const prev = prevSnap.data() || {};
        // 既に printing / shipped まで進んでいる注文の状態を後着イベントで巻き戻さない
        const prevFulfillment = prev.fulfillment;
        const overwriteFulfillment =
          !prevFulfillment || ['awaiting_payment', 'payment_failed', 'pending'].includes(prevFulfillment);

        await orderRef.set({
          sessionId: s.id,
          // 同一セッションで complete → async_payment_succeeded と複数イベントが届くので、
          // 初回だけ createdAt を打ち、以降は updatedAt を更新する
          ...(prevSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentStatus: s.payment_status || null,
          amountTotal: s.amount_total ?? null,   // JPY はゼロ decimal（円そのまま）
          currency: s.currency || 'jpy',
          customer: {
            email: s.customer_details?.email || null,
            name: s.customer_details?.name || null,
            phone: s.customer_details?.phone || null,
            address: s.customer_details?.address || s.shipping_details?.address || null,
          },
          taskId: md.taskId || null,
          shopCode: md.shopCode || null,
          shopKickback,          // 送客手数料（税抜売上の15%・推定）
          items: md.items || null,
          subtotal: subtotalIncTax || null,
          shipping: Number(md.shipping || 0),
          paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : null,
          paid,
          // awaiting_payment / payment_failed → pending → printing → shipped
          ...(overwriteFulfillment ? { fulfillment: nextFulfillment } : {}),
          raw: { eventId: event.id, eventType: event.type },
        }, { merge: true });

        // 生成タスク側にも注文済みフラグを立てる（入金確定分のみ）
        if (paid && !failed && md.taskId && TASK_ID_RE.test(md.taskId)) {
          await db().collection(TASKS_COL).doc(md.taskId).set({
            orderedSessionId: s.id,
            orderedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true }).catch((e) => console.error('[mini-me] task order flag failed', e));
        }

        console.log('[mini-me] order saved', s.id, event.type, 'paid=', paid);
      }

      res.status(200).json({ received: true });
    } catch (e) {
      console.error('[mini-me] webhook handling error', e);
      // 5xx を返すと Stripe がリトライする
      res.status(500).send('handler error');
    }
  }
);

// 注意: index.js は `exports.miniMeGenerate = miniMe.miniMeGenerate;` のように
// 名前を指定して結線しているので（spread ではない）、下記のテスト用エクスポートが
// そのまま Cloud Function として登録されることはない。
// firebase deploy 時に誤検出されないよう、関数以外の1オブジェクトにまとめてぶら下げる。
exports.__test__ = { priceOrder, PLANS, OPTIONS, MAX_TOTAL_QTY, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD };
