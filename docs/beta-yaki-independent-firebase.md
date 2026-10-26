# ベタ焼きノート 独立Firebase環境

- Firebase project / Hosting site: `beta-yaki-note`
- App version: `v0.6.1`
- Production URL: `https://beta-yaki-note.web.app/`
- Deploy config: `firebase.beta-yaki.json`
- Deploy command: `firebase deploy --config firebase.beta-yaki.json --project beta-yaki-note --only hosting`
- 公開対象: `public/beta-yaki-note/`のみ
- Functions / Firestore / Storage / Hosting rewrites: なし

## コスト管理

- 月額予算: USD 15相当（2,372円）
- 自動停止: USD 5相当（791円）
- Cloud Billing budget: `a081406d-a275-4d4a-a5b6-cbbddd9babce`
- 停止対象: Firebase Hosting site `beta-yaki-note`のみ
- 停止後の再開: 手動のみ
- Workflow source: `infra/beta-yaki-budget-stop.yaml`

予算通知と停止制御は既存の管理プロジェクト`cc-dev-ps7`上で集中管理するが、アプリ本体、Hosting、請求集計、停止対象は`beta-yaki-note`へ分離する。
