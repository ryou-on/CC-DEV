# 利用者向け案内

送付前に、対象アプリと日付だけ差し替えてください。メールアドレスや家族コードは、この文面には書かないでください。

---

件名: CC-DEV の一部アプリで Google ログインが必要になります

CC-DEV の一部アプリは、共有データの保護のため、Google アカウントでのログインと、管理者からの利用許可が必要になります。

許可のない状態では、アプリの一覧、家族で同期している音声や画像、チームのメモ、ランキングなどを開けなくなります。お使いの端末の中だけに保存されているデータは消えません。

次のアプリが対象です。

- アプリ一覧（app-dashboard）: https://cc-dev-ps7.web.app/app-dashboard/
- おうち巴寿司: https://cc-dev-ps7.web.app/ouchi-hamasushi/
- note 週次記録: https://cc-dev-ps7.web.app/note-analytics/
- 巴ホーム: https://cc-dev-ps7.web.app/tomoe-home/
- 巴プレーヤー: https://cc-dev-ps7.web.app/tomoe-player/
- 爆撃湾ランキング: https://cc-dev-ps7.web.app/bombing-bay/
- 会議ナレッジ: https://cc-dev-ps7.web.app/meet-knowledge/
- アウトリーチ CRM: https://cc-dev-ps7.web.app/outreach-crm/

お願いしたいことは次の2つです。

1. ふだん使う Google アカウントで、対象のアプリを開けるか確認する。
2. 開けない場合は、そのアカウントを管理者へ連絡する。こちらで利用許可を追加します。

動画の再生や、ログイン不要と案内している公開ページの見方は変わりません。

切り替えの日時は、許可の準備が終わってから別途連絡します。それより前に、今の使い方が急に止まることはありません。

---

計画コマンド `node scripts/access-grants-migration.cjs` も、scope ごとの短い文を標準出力へ出します。そちらの文面を、アプリごとの個別連絡に使ってください。
