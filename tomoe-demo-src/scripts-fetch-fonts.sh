#!/usr/bin/env bash
# Google Fonts の TTF をローカル取得（ヘッドレスChromeが外部フォントを読めない環境向け）
set -e
cd "$(dirname "$0")"
mkdir -p public/fonts
for spec in "Yuji+Syuku:YujiSyuku-Regular" "Shippori+Mincho+B1:wght@500:ShipporiMinchoB1-Medium" "Shippori+Mincho+B1:wght@800:ShipporiMinchoB1-ExtraBold" "Cinzel:wght@700:Cinzel-Bold" "Cinzel:wght@400:Cinzel-Regular"; do
  fam="${spec%:*}"; out="${spec##*:}"
  [ -f "public/fonts/$out.ttf" ] && continue
  url=$(curl -sS "https://fonts.googleapis.com/css2?family=$fam" | grep -o "https://fonts.gstatic.com[^)]*" | head -1)
  curl -sS -o "public/fonts/$out.ttf" "$url"
done
