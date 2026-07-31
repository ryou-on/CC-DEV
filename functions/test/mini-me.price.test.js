/**
 * priceOrder() の単体テスト（ちいさなじぶん）
 *
 * 実行:
 *   cd functions && node --test test/
 *
 * 依存パッケージなし（Node 20 標準の node:test / node:assert のみ）。
 * Cloud Functions としては読み込まれない（index.js が名前指定で結線しているため）。
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'cc-dev-ps7';

const { __test__ } = require('../mini-me');
const { priceOrder, PLANS, OPTIONS, MAX_TOTAL_QTY, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD } = __test__;

const BASE = OPTIONS.base.price;         // 1200
const WATER = OPTIONS.waterproof.price;  // 1500
const BOTH = BASE + WATER;               // 2700

/** クライアント（public/mini-me/index.html の calc()）と同じ式。両者が一致することを検証する。 */
function clientCalc(planKey, opts, qty) {
  const unitPlan = PLANS[planKey].price;
  const unitOpt = opts.reduce((s, o) => s + OPTIONS[o].price, 0);
  const discountPerFigure = unitPlan - Math.round(unitPlan * 0.8);
  const discount = qty > 1 ? discountPerFigure * (qty - 1) : 0;
  const subtotal = unitPlan * qty + unitOpt * qty - discount;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

test('単体・オプションなし（割引なし・送料あり）', () => {
  const r = priceOrder([{ plan: 'S', qty: 1 }]);
  assert.strictEqual(r.subtotal, 7800);
  assert.strictEqual(r.shipping, SHIPPING_FEE);
  assert.strictEqual(r.total, 8600);
});

test('単体・送料無料の境界（L=19800 >= 15000）', () => {
  const r = priceOrder([{ plan: 'L', qty: 1 }]);
  assert.strictEqual(r.subtotal, 19800);
  assert.strictEqual(r.shipping, 0);
  assert.strictEqual(r.total, 19800);
});

test('割引対象は本体のみ。オプション代は割引しない（S×2＋両オプション）', () => {
  const r = priceOrder([{ plan: 'S', options: ['base', 'waterproof'], qty: 2 }]);
  // 7800 + 2700（満額1体） + 6240 + 2700（割引1体）
  assert.strictEqual(r.subtotal, 7800 + BOTH + 6240 + BOTH);
  assert.strictEqual(r.subtotal, 19440);
  assert.strictEqual(r.breakdown.discountTotal, 1560);
  assert.strictEqual(r.breakdown.optionTotal, BOTH * 2);
});

test('★回帰: 画面表示（クライアント式）とサーバー確定額が一致する', () => {
  const cases = [
    ['S', [], 1], ['S', [], 2], ['S', [], 5],
    ['S', ['base'], 2], ['S', ['base', 'waterproof'], 2], ['S', ['base', 'waterproof'], 5],
    ['M', ['waterproof'], 3], ['M', ['base', 'waterproof'], 4],
    ['L', [], 2], ['L', ['base', 'waterproof'], 2], ['L', ['base'], 20],
  ];
  for (const [plan, opts, qty] of cases) {
    const server = priceOrder([{ plan, options: opts, qty }]);
    const client = clientCalc(plan, opts, qty);
    assert.deepStrictEqual(
      { subtotal: server.subtotal, shipping: server.shipping, total: server.total },
      client,
      `不一致: ${plan} x${qty} opts=[${opts}]`
    );
  }
});

test('★回帰: 合計額が items の並び順に依存しない（割引は最も高い1体を満額にする）', () => {
  const a = priceOrder([{ plan: 'S', qty: 1 }, { plan: 'L', qty: 1 }]);
  const b = priceOrder([{ plan: 'L', qty: 1 }, { plan: 'S', qty: 1 }]);
  assert.strictEqual(a.subtotal, b.subtotal);
  assert.strictEqual(a.total, b.total);
  // L(19800) が満額、S は 20%OFF で 6240
  assert.strictEqual(a.subtotal, 19800 + 6240);
});

test('★回帰: 巨大 qty は展開前に 400 で弾く（OOM 防止）', () => {
  for (const qty of [MAX_TOTAL_QTY + 1, 1000, 1e9, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => priceOrder([{ plan: 'S', qty }]), (e) => e.httpStatus === 400, `qty=${qty}`);
  }
  // 複数 items の累積でも上限を超えたら弾く
  assert.throws(
    () => priceOrder([{ plan: 'S', qty: 30 }, { plan: 'S', qty: 30 }]),
    (e) => e.httpStatus === 400
  );
  // items 配列自体が巨大な場合
  const many = Array.from({ length: MAX_TOTAL_QTY + 1 }, () => ({ plan: 'S', qty: 1 }));
  assert.throws(() => priceOrder(many), (e) => e.httpStatus === 400);
});

test('境界: qty がちょうど MAX_TOTAL_QTY なら通る', () => {
  const r = priceOrder([{ plan: 'S', qty: MAX_TOTAL_QTY }]);
  assert.strictEqual(r.breakdown.qty, MAX_TOTAL_QTY);
  assert.strictEqual(r.subtotal, 7800 + 6240 * (MAX_TOTAL_QTY - 1));
});

test('不正入力: Infinity / NaN / 0 / 負数 / 不明プラン / 不明オプション', () => {
  const bad = [
    [{ plan: 'S', qty: Infinity }],
    [{ plan: 'S', qty: NaN }],
    [{ plan: 'S', qty: 0 }],
    [{ plan: 'S', qty: -3 }],
    [{ plan: 'XL', qty: 1 }],
    [{ plan: 'S', qty: 1, options: ['gold'] }],
  ];
  for (const items of bad) {
    assert.throws(() => priceOrder(items), (e) => e.httpStatus === 400, JSON.stringify(items));
  }
  assert.throws(() => priceOrder([]), (e) => e.httpStatus === 400);
  assert.throws(() => priceOrder(null), (e) => e.httpStatus === 400);
});

test('廃止した保育園団体プラン(KINDER)は 400 で弾く', () => {
  assert.throws(() => priceOrder([{ plan: 'KINDER', qty: 20 }]), (e) => e.httpStatus === 400);
});

test('lineItems は JPY ゼロdecimal（×100 しない）', () => {
  const r = priceOrder([{ plan: 'M', options: ['base'], qty: 1 }]);
  assert.strictEqual(r.lineItems.length, 1);
  assert.strictEqual(r.lineItems[0].price_data.currency, 'jpy');
  assert.strictEqual(r.lineItems[0].price_data.unit_amount, 12800 + BASE);
  assert.strictEqual(r.lineItems[0].quantity, 1);
  // lineItems の合計が subtotal と一致すること
  const sum = r.lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
  assert.strictEqual(sum, r.subtotal);
});

test('breakdown の整合（bodyTotal + optionTotal - discountTotal === subtotal）', () => {
  for (const items of [
    [{ plan: 'S', options: ['base', 'waterproof'], qty: 5 }],
    [{ plan: 'L', qty: 2 }, { plan: 'M', options: ['waterproof'], qty: 3 }],
  ]) {
    const r = priceOrder(items);
    const b = r.breakdown;
    assert.strictEqual(b.bodyTotal + b.optionTotal - b.discountTotal, r.subtotal, JSON.stringify(items));
    const sum = r.lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
    assert.strictEqual(sum, r.subtotal);
  }
});
