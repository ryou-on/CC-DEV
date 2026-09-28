# 作業メモ（コンテキスト圧縮対策）
- Higgsfield MCP 未接続 → Seedance不可。Canva generate-image でルック画像6枚生成済み。
- Canva ダウンロードURL(export-download/media.canva.com)は egress 403。→ edit-design のサムネ(最大600px)を 3x2 タイル(600x600ページ, 画像1800x1013配置)で取得し合成。
- design DAHWYcjenDM / transaction 9145076233634068140 (最後に cancel する)
- media: keyvisual MAHWYReXt9k, s1 MAHWYROGQJ4, s2 MAHWYUwF6lw, s3 MAHWYdQ6DfA, s4 MAHWYVilZr0, s5 MAHWYUvGirk
- tile t: col=t%3,row=t//3 → left=-600col, top=-600row ; page index = 9 + img*6 + t
- page ids 9..44:
 PBx37vDXRfdvnFK7 PBcjdY2JN8YdPkvJ PB3K7TjqV3b9QJRh PBKPDk4qGyd06mfS PBtgWDsmpZghrFft PBphsn5Wm4qsKBBx
 PBs60hhQ6pPJC5vJ PBds8bJh9lplz2Qt PBQQHk4JxJRdrttj PBKDs4Tp2DJ7p0Q5 PBx4r4YCmWln73SG PBVDDtvmjCqh89J8
 PB47BCDLt4Scj4JD PBSTwdsmc053KBMS PBs3sCBy2fSb3L6D PBtxLFlDgn7tP1FB PBvMT8nFLmKCcL4s PBfWkpMjk54HpDd1
 PBL04BML7HfQ9fdv PBMgRTJ1wP3g7WTQ PBJ5ctQMbHvXbkG4 PBJy5JzsmccZSthJ PB83BZB2y5kCC3Cm PB2b3pKD8Cq2WzJ0
 PBXcM34lzvbXYDq0 PB509HzKJ2lW8WFq PBK4d2V92bksQmJ1 PBKHYpW0NnKSJQ5R PByJnlnrgf3SBk8b PBw4W5rWwPL3s5H4
 PB4TXshZC9G680tN PBPKgkls83XWLrdH PBR7QCbrRdk1FgPp PBQ1WVJL4vZHFgpF PB66WVy8L5SWKfhZ PBXSdlVM2Z7QHND0
- tile画像: /root/.claude/projects/-home-user-CC-DEV/1b2e0f21-7293-5775-8aa9-f9edd7644e27/tool-results/mcp-Canva-blob-<id>.png （map.txt）
- 構成案: 30s/900f 1920x1080。S1導入0-4s, S2美4-8s, S3武8-12.5s(slash+bow), S4対比12.5-15s, S5 3Dアセット15-21s, S6キーワード21-25.5s, S7納刀25.5-27.5s, S8エンドカード27.5-30s
- Remotion: tomoe-demo-src/ (remotion 4.0.529, three 0.180, r3f 9) 。src/theme.ts, src/Logo.tsx 作成済
- [更新] transaction 9145076233634068140 は期限切れ(未コミットなのでタイルページ消失)。新transactionで26ページ(600x600)再追加→ s1 t4,t5 + s2..s5 各6タイル。並列6本ずつ投げると速い。
- 新transaction 506046251929032455。p7=s1t4 p8=s1t5, s2=p9-14, s3=p15-20, s4=p21-26, s5=p27-32
 ids p7..32: PBPqDpvgwt46kJTt PBQMLl1tlnBBz6XZ | PB51zZGTV8kkWk01 PBf5xGvt9w93B0LQ PBpmVLwRLgDsmT2L PBYK3rqxwl2L9lPj PBmMsFnLrhGcsVcc PB3RDH6h5KS74HSy | PBGTlWb28qjSgMsJ PBVGG6HYyjKjJHYV PBq7v8DSsxxGfTQW PB7LpYgDTfDf8S4T PBhQfMf5SLT5tKhQ PBQ0bVgfk2CycLWt | PB4fM3FgbQQy9LCj PB5FzmhGBF73kYBV PBZLZ9BLHHm1kK98 PBTw4sV1vC5WGBN0 PBFrfkNP1RY34TwN PBGqXqr8TZQ8MwdL | PBhmFLL6JpqZcVwX PBl38QlfdmNCZN6j PB5tqKlyPlnRqdK8 PBX6J0DZkDTsmHSH PB2CY7XKWzwJ5YG7 PB54Kj8lSWDGX9mZ
- プラン承認済: /root/.claude/plans/clever-munching-bunny.md（Higgsfieldは次セッション）
- transaction 506046251929032455 も期限切れ。s3 t4,t5 + s4,s5 各6 = 14ページ残
- Canvaタイル取得は打切り（transaction即失効）。s3欠損t4,t5とs4,s5はフルサムネ(600x338)拡大で補完。full thumbs: key 1790500491299-wdzor0 s1 1790500504637-9s63ym s2 1790500509462-phq1q0 s3 1790500513368-81k8ki s4 1790500517185-4eqsys s5 1790500520926-gk5lh4
