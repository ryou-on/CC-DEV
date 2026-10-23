# 明友社見積の共有アカウント（公開前）

詳しい確認手順、コンソール操作、Admin SDK の例、ルール例外を採らない理由は `docs/meiyusha-email-verification.md` にあります。ここにある短文は同じ依頼の要約です。エージェントは本番 Auth を見ておらず、変更もしていません。

`public/meiyusha-estimate/index.html` は `signInWithEmailAndPassword` でログインする。ルールは `meiyusha@meiyusha-estimate.app` を読む条件に `email_verified == true` を要求する。

本番の Authentication は変更していない。ルールを本番へ出す前に、Firebase Auth コンソールで共有アカウント `meiyusha@meiyusha-estimate.app` のメール確認（email verified）を true にする。未確認のまま公開すると、パスワードが合っていても単価ドキュメントは読めない。

確認済みのパスワードログインで読めること、未確認では読めないこと、同じアカウントでも書き込めないことは Firestore エミュレーターのルール試験で確認した。
