/**
 * cost-guard.js — 従量課金の暴走を防ぐ共通ガード
 *
 * 背景: 「誰も見ていない公開サイトでも AI クローラーや第三者に叩かれ続け、
 *        1リクエストの重さ × 回数 で請求が跳ね上がる」事故を防ぐ。
 *        （参考: Vercel で約120万円請求された事例 / 2026-09）
 *
 * 提供する防御層（外側から順に）:
 *   1. isBotRequest       … AIクローラー/ボット/スクリプトの UA を即 403（Firestore も外部APIも触らない）
 *   2. isKillSwitchOn     … Firestore `cost-guard/config.killSwitch` が true なら全有料APIを 503
 *                           （予算アラート連動の budgetGuard が自動で立てる／手動でも立てられる）
 *   3. originAllowedStrict… 自サイト以外（curl・他サイト）からの POST を拒否
 *   4. consumeDailyQuota  … IP単位＋サービス全体の日次上限（Firestore トランザクション）
 *
 * 使い方（有料APIを呼ぶ onRequest の先頭で）:
 *   const costGuard = require('./cost-guard');
 *   if (!(await costGuard.guardPaidRequest(req, res, { scope: 'realtime', perIp: 30, global: 100 }))) return;
 *
 * ⚠ 新しく有料API（OpenAI / Anthropic / Meshy など）を呼ぶ関数を追加するときは、
 *   必ず guardPaidRequest か Firebase Auth の verifyIdToken を通すこと。
 *   scripts/cost-guard-check.js が CI でこれを検査する。
 */
const crypto = require('crypto');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// 自サイトとして許可する Origin
const ALLOWED_ORIGINS = new Set([
  'https://cc-dev-ps7.web.app',
  'https://cc-dev-ps7.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5173',
]);

// AIクローラー・大量巡回するSEOボット（robots.txt を無視する個体への保険）
// 公開GET（素材配信など）ではこちらだけを弾く。リンクプレビュー（Slackbot等）は通す。
const AI_CRAWLER_RE = /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-User|Claude-SearchBot|anthropic-ai|CCBot|Google-Extended|GoogleOther|Bytespider|PerplexityBot|Perplexity-User|Amazonbot|Applebot-Extended|meta-externalagent|meta-externalfetcher|FacebookBot|cohere-ai|Diffbot|ImagesiftBot|Omgilibot|YouBot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|Timpibot|AI2Bot/i;

// 有料APIの入口ではさらに広く、スクリプト・ヘッドレスブラウザ・汎用ボットも弾く
const SCRIPT_UA_RE = /Scrapy|python-requests|python-urllib|aiohttp|Go-http-client|curl\/|Wget|node-fetch|axios|HeadlessChrome|bot\b|crawler|spider/i;

const CONFIG_DOC = 'cost-guard/config';
const QUOTA_COL = 'cost-guard/quota/items';
const KILL_CACHE_MS = 60 * 1000;

let killCache = { value: false, at: 0 };

// テストでスタブに差し替えられるよう Firestore の取得を関数化
let dbFactory = () => admin.firestore();
function db() {
  return dbFactory();
}

/** 環境変数の正の整数を読む（未設定・不正値は fallback） */
function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function userAgent(req) {
  return String((req.get && req.get('user-agent')) || '');
}

/** AIクローラー/SEOボットか（公開GET向けの緩い判定） */
function isAiCrawler(req) {
  return AI_CRAWLER_RE.test(userAgent(req));
}

/** ボット・スクリプトか（有料API向けの厳しい判定。UA 無しも拒否） */
function isBotRequest(req) {
  const ua = userAgent(req);
  if (!ua) return true; // UA 無しは正規ブラウザではない
  return AI_CRAWLER_RE.test(ua) || SCRIPT_UA_RE.test(ua);
}

/** 有料API向けの厳格な Origin 検査（Origin 無し＝curl 等は拒否） */
function originAllowedStrict(req) {
  const origin = req.get && req.get('origin');
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

/** クライアントIP（Hosting 経由なので X-Forwarded-For の先頭が実クライアント） */
function clientIp(req) {
  const xff = String((req.get && req.get('x-forwarded-for')) || '').split(',')[0].trim();
  return xff || req.ip || 'unknown';
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * キルスイッチ（Firestore cost-guard/config.killSwitch）。60秒キャッシュ。
 * 読み取り失敗時は直前の値を使う（Firestore 障害で全停止させない）。
 */
async function isKillSwitchOn() {
  const now = Date.now();
  if (now - killCache.at < KILL_CACHE_MS) return killCache.value;
  try {
    const snap = await db().doc(CONFIG_DOC).get();
    killCache = { value: !!(snap.exists && snap.data().killSwitch), at: now };
  } catch (e) {
    console.error('[cost-guard] kill switch read failed', e);
    killCache.at = now;
  }
  return killCache.value;
}

/** キルスイッチを書き込む（budgetGuard / 管理用） */
async function setKillSwitch(on, reason) {
  await db().doc(CONFIG_DOC).set({
    killSwitch: !!on,
    reason: String(reason || '').slice(0, 500),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  killCache = { value: !!on, at: Date.now() };
}

/**
 * 日次レート制限。IP単位とサービス全体を同一トランザクションで加算する。
 * 超過時は httpStatus 429 の例外を投げる。
 * failOpen=false（既定）: 記録に失敗したら止める側に倒す（有料APIの保護を優先）。
 */
async function consumeDailyQuota(req, { scope, perIp, global, failOpen = false }) {
  const day = utcDayKey();
  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  const col = db().collection(QUOTA_COL);
  const ipRef = col.doc(`${day}_${scope}_ip_${ipHash}`);
  const globalRef = col.doc(`${day}_${scope}_global`);
  // TTL ポリシー用（Firestore コンソールで expireAt に TTL を設定すると自動削除される）
  const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 3 * 24 * 3600 * 1000);

  try {
    await db().runTransaction(async (tx) => {
      const [ipSnap, gSnap] = await tx.getAll(ipRef, globalRef);
      const ipCount = Number((ipSnap.data() || {}).count || 0);
      const gCount = Number((gSnap.data() || {}).count || 0);
      if (gCount >= global) {
        throw Object.assign(new Error('本日の利用上限に達しました（サービス全体）'), { httpStatus: 429 });
      }
      if (ipCount >= perIp) {
        throw Object.assign(new Error('本日の利用上限に達しました'), { httpStatus: 429 });
      }
      const stamp = admin.firestore.FieldValue.serverTimestamp();
      tx.set(ipRef, { count: ipCount + 1, day, scope, updatedAt: stamp, expireAt }, { merge: true });
      tx.set(globalRef, { count: gCount + 1, day, scope, updatedAt: stamp, expireAt }, { merge: true });
    });
  } catch (e) {
    if (e && e.httpStatus === 429) throw e;
    console.error('[cost-guard] quota bookkeeping failed', e);
    if (!failOpen) {
      throw Object.assign(new Error('一時的に利用できません'), { httpStatus: 503 });
    }
  }
}

/**
 * 有料APIを呼ぶリクエストの総合ガード。
 * 通過なら true。拒否した場合はレスポンスを送って false を返す。
 *
 * @param {object} opts
 * @param {string} opts.scope   クォータの名前空間（例: 'realtime'）
 * @param {number} [opts.perIp] IPごとの日次上限（省略時はクォータ判定なし）
 * @param {number} [opts.global] 全体の日次上限
 * @param {boolean} [opts.requireOrigin=true] Origin 必須にするか
 * @param {boolean} [opts.json=true] エラーを JSON で返すか
 */
async function guardPaidRequest(req, res, opts = {}) {
  const { scope = 'default', perIp, global, requireOrigin = true, json = true } = opts;
  const deny = (status, message) => {
    if (json) res.status(status).json({ error: message });
    else res.status(status).send(message);
    return false;
  };

  if (isBotRequest(req)) return deny(403, 'bots are not allowed');
  if (requireOrigin && !originAllowedStrict(req)) return deny(403, 'origin not allowed');
  if (await isKillSwitchOn()) return deny(503, '利用上限保護のため一時停止中です');

  if (perIp && global) {
    try {
      await consumeDailyQuota(req, { scope, perIp, global });
    } catch (e) {
      return deny(e.httpStatus || 503, e.message || '一時的に利用できません');
    }
  }
  return true;
}

module.exports = {
  ALLOWED_ORIGINS,
  AI_CRAWLER_RE,
  envInt,
  isAiCrawler,
  isBotRequest,
  originAllowedStrict,
  clientIp,
  isKillSwitchOn,
  setKillSwitch,
  consumeDailyQuota,
  guardPaidRequest,
  __resetCacheForTest: () => { killCache = { value: false, at: 0 }; },
  __setDbForTest: (fn) => { dbFactory = fn; },
};
