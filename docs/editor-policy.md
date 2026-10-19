# 編集者メールの正本

`functions/editor-policy.json` が hihaho 編集者のドメインと個別メールの正本です。Cloud Functions の `isEditorEmail` はこれを読みます。

Firestore Rules と Storage Rules は JavaScript や JSON を import できません。`isHihahoEditor` は同じ条件をルール言語で書いてあります。`functions/test/editor-policy.test.js` が、両方の関数に正本と同じドメイン正規表現とメールだけが入っていることを照合します。正本を変えたらルールの関数も同じ内容に直し、試験が通るまで完了にしません。

Rules には小文字化がありません。トークンのメールが大文字だと Rules は拒否し、Functions は小文字化して許可します。この差は試験に固定しています。

明友社の共有アカウント、本ドコのオーナー、各 HTML の画面用 ALLOW は別の一覧です。編集者正本を増やしても、それらへは自動では広がりません。
