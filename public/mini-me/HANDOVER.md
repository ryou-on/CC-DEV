# HANDOVER.md - ちいさなじぶん

写真1枚からミニチュアフィギュアを3Dプリントして届けるD2Cサービス。

## 基本情報
- バージョン: **v0.2.0**
- フェーズ: **Phase 1（MVP・フロントエンドモック）**
- 最終更新: 2026-07-31
- サービス名: **ちいさなじぶん**（2026-07-29 確定）。商標調査は未実施（後述の「既知の問題」参照）

## 技術スタック
- Frontend: 単一HTML（素のJS / ES module）＋ Three.js r169（importmap・unpkg CDN）
- Backend: Firebase Cloud Functions v2（asia-northeast1）／ Meshy API（3D生成）／ Stripe Checkout（決済）
- Hosting: Firebase Hosting（cc-dev-ps7）

## ファイル構成

```
public/mini-me/              ← 公開（Firebase Hosting）
├── index.html               本体（LP＋4ステップUI＋3Dビューア＋見積＋決済導線）
├── privacy.html             プライバシーポリシー
├── terms.html               利用規約
├── README.md                環境変数・Stripe/Meshy セットアップ手順
└── HANDOVER.md              このファイル

functions/
├── mini-me.js               Meshy/Tripoプロキシ・Stripe Checkout・webhook
├── index.js                 ↑を再エクスポート（末尾に追記）
└── test/mini-me.price.test.js   価格ロジックの単体テスト（11件）

mini-me/                     ← 非公開（社内資料。public配下ではない）
├── business-plan.md         事業計画
├── cost-model.md            原価積み上げ
├── pl-simulation.html       収支シミュレータ（インタラクティブ）
├── docs/                    service-overview / partner-shop-proposal /
│                            price-list / faq
├── legal/                   privacy-policy / terms / consent-flow
├── creative/                flyer-a4 / poster-a2 / sns-posts / image-prompts
└── _archive-hoikuen/        保育園ルート（凍結・2026-07-31）
```

## API 契約

| エンドポイント | メソッド | 用途 |
|---|---|---|
| `/api/mini-me-generate` | POST | `{imageBase64, mimeType}` → `{taskId}` |
| `/api/mini-me-generate?taskId=` | GET | 生成状況のポーリング（`__ping__` で疎通確認・キー未設定なら503） |
| `/api/mini-me-checkout` | POST | 金額確定＋Stripe Checkout Session 作成 |
| `/api/mini-me-webhook` | POST | `checkout.session.completed` を Firestore へ記録 |

`firebase.json` に上記3関数の rewrite を設定済み。

**金額はサーバー（`priceOrder()`）が唯一の正**。クライアントから送られた金額は一切読まない。

## デモモード
バックエンド未接続でも STEP1→4 が最後まで通る。

- `?demo=1` で強制、または起動時の疎通確認失敗で自動
- 3Dモデルは Three.js プリミティブでその場生成（外部ファイル依存なし）
- 決済は Stripe に飛ばさず完了モーダルを表示

## デプロイ先
- GitHub Actions: https://github.com/ryou-on/CC-DEV/actions
- 本番URL: https://cc-dev-ps7.web.app/mini-me/

## 進捗チェックリスト
- [x] LP・4ステップUI・3Dビューア（回転/ズーム/パン・タッチ対応）
- [x] 同意チェック2つのゲート（未チェックで生成ボタン無効）
- [x] 見積のリアルタイム計算（クライアント表示＝サーバー確定額）
- [x] Cloud Functions（Meshy プロキシ / Stripe / webhook）
- [x] 価格ロジック単体テスト 11件 pass（`cd functions && npm test`）
- [x] プライバシーポリシー・利用規約
- [x] 事業計画・原価モデル・収支シミュレータ
- [x] 営業資料5点・販促物3点・SNS投稿案
- [x] **Meshy API キー設定・miniMeGenerate デプロイ済み**（2026-07-31。本番はライブモード）
- [ ] **Stripe キー・webhook 設定**（テストモードから）→  の `STRIPE_ENABLED` を true にする
- [ ] 実写での GLB 表示品質の確認と修正工数の実測
- [ ] Stripe 遷移の実地検証（未検証）
- [ ] 法務レビュー（規約・ポリシーは雛形）
- [ ] 商標調査（第28類・第40類）

## 既知の問題・注意事項
- **商標調査が未実施**: サービス名は「ちいさなじぶん」に確定（旧称 TINY ME は同カテゴリの既存ブランド Tinyme と衝突するため不採用）。第28類（おもちゃ・人形）・第40類（受託加工・3Dプリント）で J-PlatPat を確認すること
- **保育園団体プランは凍結**（2026-07-31）。粗利が実質ゼロだったため。経緯と成果物は `mini-me/_archive-hoikuen/README.md`
- **運転資金**: 保守的シナリオで月次営業利益 ▲約91万円（年間 ▲約1,087万円）。初期投資250万円では足りない
- 3Dモデル生成の**人手修正工数が事業の律速**。Phase 0 で実測してから Phase 1 に進むこと
- 表示価格・原価・市場規模はすべて**推定値**。出典は各ドキュメント内に記載
- **標準シナリオでも赤字**: 月150体で営業利益 ▲¥613,040、BEP は月367体（3名体制・稼働率93.4%）。修正工数55分を圧縮できるかが分岐点

## 次のステップ
1. Meshy と Stripe のキーを設定してライブモードを実地検証（`public/mini-me/README.md` の手順）
2. 実際の写真1枚で生成 → 3Dプリント外注まで通し、**修正工数と歩留まりを実測**
3. 実測値を `mini-me/cost-model.md` に反映し、収支シミュレータを再計算
4. 商標調査（第28類・第40類）
5. 規約・プライバシーポリシーの法務レビュー
