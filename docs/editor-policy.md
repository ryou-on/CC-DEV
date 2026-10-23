# 編集者メールの正本

`functions/editor-policy.json` が hihaho 編集者のドメインと個別メールの正本です。Cloud Functions の `isEditorEmail` はこれを読みます。

Firestore Rules と Storage Rules は JavaScript や JSON を import できません。両方の `isHihahoEditor` は、トークンのメールを `trim().lower()` してから同じドメインと個別メールを見ます。Functions の `isEditorEmail` も前後の空白を除いて小文字化します。

小文字化に寄せた理由は、メールのドメインは大文字小文字を区別せず、Google のトークンも登録時の表記とずれることがあるためです。Rules だけ区別すると、Functions では編集者なのにルールでは拒否されます。Rules 言語の `lower()` と `trim()` で同じ操作ができるため、Functions を大文字区別へ戻す必要はありません。

同じメールの一覧は `functions/editor-policy-cases.json` です。Functions の単体試験と、Firestore / Storage エミュレーターが、その一覧を両方に流して結果を比較します。サブドメイン（`user@sub.splineglobal.com`）はどちらも編集者にしません。

明友社の共有アカウント、本ドコのオーナー、各 HTML の画面用 ALLOW は別の一覧です。編集者正本を増やしても、それらへは自動では広がりません。
