# ちいさなじぶん画像生成プロンプト集

株式会社企画7課 ／ サービスURL: https://cc-dev-ps7.web.app/mini-me/

実写の作例写真が揃うまでの間、Webサイト・チラシ・SNS用のサービスイメージ画像を外部の画像生成AIで用意するためのプロンプト集です。
プロンプトはすべて英語。各項目に日本語で意図を併記しています。

---

## 0. 使う前に必ず読むこと

### 人物の扱い（最重要）

- **実在の人物に似た顔を生成させない。** 有名人名・実在人物名・特定の人物写真をプロンプトや参照画像に入れないこと。
- **子どもの顔は生成しない。** 人物が必要なカットは、フィギュア単体・後ろ姿・俯瞰・顔が小さい構図のいずれかで構成する。
- 大人が写るカットも、**後ろ姿・手だけ・顔が画面に対して小さい**構図を基本とする。共通ネガティブプロンプトに `face close-up`, `identifiable face`, `portrait of a real person` を含めている。
- フィギュア（人形）の顔は、**造形物として簡略化された顔**であることが伝わる程度に留める。プロンプト側で `simplified stylized face, painted miniature figure face, not photorealistic human face` と指定する。

### 表現の制約

- 「完全再現」「本人そっくり」を思わせるビジュアル（元写真と寸分違わぬフィギュア）は作らない。誇大表現になる。
- 水槽内カットで、生体（魚）とフィギュアが不自然に密着している構図は避ける。
- 生成画像を公開素材として使う場合は、**画面内またはキャプションに「イメージ」と明示**する。

### 共通スタイル（全プロンプトに含めてある文言）

```
soft natural light, shallow depth of field, photorealistic product photography,
muted teal and warm sand color palette, clean composition, high detail, 50mm lens look
```

配色はデザイントークン（`#0B2027` 深海ブルー / `#4ECDC4` ミント / `#FF7A6B` コーラル / `#F7F3E9` サンド）に寄せるため、`deep teal`, `mint green accent`, `warm sand beige`, `coral orange accent` を各プロンプトに散らしています。

### 共通ネガティブプロンプト（ベース）

```
text, watermark, logo, signature, extra limbs, deformed hands, mutated fingers,
identifiable face, face close-up, portrait of a real person, celebrity likeness,
children faces, uncanny valley human, plastic skin, oversaturated, HDR, cluttered background,
low resolution, jpeg artifacts, blurry, distorted proportions
```

各プロンプトでは、これに個別のネガティブ要素を追記しています。

### モデル別の指定方法

| モデル | アスペクト比 | ネガティブプロンプト |
|---|---|---|
| Midjourney | `--ar 16:9` などを末尾に付与 | `--no text, watermark, ...` |
| Stable Diffusion / SDXL | 解像度で指定（例 1344×768） | Negative prompt 欄に貼る |
| Imagen / Gemini 系 | `aspectRatio` パラメータ | ネガティブ非対応の場合はプロンプト末尾に "avoid: ..." と自然文で書く |
| DALL·E 系 | size パラメータ | ネガティブ非対応。プロンプト本文に「no text, no logos」を含める |

---

## 1. ヒーロー画像（Webサイト最上部）

**用途**: `/mini-me/` トップのファーストビュー背景。テキストを重ねるため、左側1/3に余白を作る。

**Prompt**
```
A wide cinematic shot of a beautifully aquascaped freshwater planted aquarium,
viewed straight through the front glass. In the middle-right of the tank, standing on a
smooth river stone, is a single 40mm hand-painted miniature human figurine seen from behind,
wearing a simple coral-orange shirt and dark trousers. Lush green aquatic plants, a piece of
driftwood, fine sand substrate. Two small tropical fish swimming softly out of focus in the
background. Deep teal water, a shaft of light from above hitting the figurine.
Left third of the frame is calm open water with negative space for text.
Soft natural light, shallow depth of field, photorealistic product photography,
muted teal and warm sand color palette, clean composition, high detail, 50mm lens look.
The figurine has a simplified stylized painted face, clearly a miniature object, not a real person.
```

**日本語の意図**: 「水槽の中に人が立っている」という一枚でサービスを説明するカット。人物は必ず後ろ姿。左1/3はキャッチコピーを載せるため空ける。光の筋でフィギュアに視線を集める。

**Negative（追記分）**: `common negatives + giant figurine, figurine larger than fish, dirty green water, algae covered glass, aquarium equipment visible, heater, air tube`

**Aspect ratio**: `16:9`（PC）／ `4:5` を別途生成してスマホ用に

---

## 2. 水槽内クローズアップ（水の質感を見せる）

**用途**: SNS（IG-05 水中設置）、チラシの補助カット。

**Prompt**
```
Extreme close-up macro shot of a 40mm painted miniature human figurine standing underwater
on fine light sand at the bottom of a planted aquarium, shot through the tank glass from the side
at the figurine's eye level. Tiny air bubbles rising past it, soft caustic light patterns rippling
across its shoulders, a blurred green aquatic plant leaf in the foreground.
Water is clear deep teal. The figurine wears a coral-orange shirt, seen at a three-quarter rear angle.
Soft natural light, shallow depth of field, photorealistic macro product photography,
muted teal and warm sand color palette, high detail.
Simplified stylized painted miniature face, clearly a small object.
```

**日本語の意図**: 水中に沈めたときの空気感と、水面から落ちる光の揺らぎ（コースティクス）を主役にする。防水コーティングの訴求カット。フィギュアはやや斜め後ろから。

**Negative（追記分）**: `common negatives + murky water, floating debris, dead fish, human scale person underwater, scuba diver, front facing face`

**Aspect ratio**: `4:5`

---

## 3. 手のひらのフィギュア（サイズ感）

**用途**: サイズ比較の訴求、Webの「サイズ」セクション、SNS（IG-04）。

**Prompt**
```
An adult's open palm holding a single 65mm full-color 3D printed miniature human figurine,
photographed from slightly above against a softly blurred warm interior background.
The figurine stands on a small clear acrylic base. Its clothing is a coral-orange shirt and
dark blue trousers, painted with visible fine detail and subtle matte finish.
Only the hand and forearm are visible, no face in frame.
Warm window light from the left, shallow depth of field, photorealistic product photography,
warm sand beige and mint green color palette, clean composition, high detail, 50mm lens look.
Simplified stylized painted miniature face on the figurine.
```

**日本語の意図**: 手のひらとの対比で実寸を直感的に伝える。人物は手のみ、顔は画面外。台座オプションも同時に見せる。

**Negative（追記分）**: `common negatives + face in frame, full body person, gloves, jewelry, nail art, harsh shadow, studio strobe reflection`

**Aspect ratio**: `1:1`

---

## 4. ビフォーアフター（写真 → フィギュア）

**用途**: SNSの主力ビジュアル（IG-02、X-04）、LPの説明セクション。

**Prompt**
```
A clean split composition on a warm sand-beige tabletop, shot from directly above.
On the left half, a printed 4x6 photograph of a person standing outdoors, seen from behind,
lying flat on the table. On the right half, a 65mm full-color 3D printed miniature figurine
standing upright on a small acrylic base, in exactly the same pose as the person in the photo,
wearing the same coral-orange shirt. A thin coral-orange arrow drawn on the table surface
pointing from the photo to the figurine.
Soft even natural light, subtle shadows, photorealistic product photography,
muted teal and warm sand color palette, clean minimal composition, high detail.
The person in the photograph is seen from behind with no visible face.
The figurine has a simplified stylized painted face.
```

**日本語の意図**: 「写真がそのまま立体になる」という一番伝えたい因果を1枚で示す。写真の人物は必ず後ろ姿にして、顔の同一性を問題にしない。矢印は現物ではなくグラフィックで後乗せしてもよい。

**Negative（追記分）**: `common negatives + visible face in photograph, portrait photo, text on photograph, torn photo, multiple figurines, mismatched pose`

**Aspect ratio**: `4:5` または `16:9`

---

## 5. 3Dモデル生成の工程カット（ワイヤーフレーム）

**用途**: 制作工程の説明（IG-03）、LPの「STEP 2」ビジュアル。

**Prompt**
```
A dark deep-teal studio scene showing a glowing 3D wireframe mesh of a standing human figure,
floating in space, rendered in bright mint-green polygon lines over a semi-transparent dark form.
The mesh is turned three-quarters away from the camera. On the right side of the mesh,
the surface gradually transitions into a fully textured and colored solid model,
showing the moment of texturing. Faint grid floor, soft volumetric glow, small coral-orange
node points at the mesh vertices.
Clean technical 3D render aesthetic, cinematic lighting, high detail, dark background with
negative space at the bottom for text.
Abstract geometric figure, not a recognizable person.
```

**日本語の意図**: AIが立体化する工程を抽象的に見せる。実写ではなく3Dレンダー調にして、「これは処理中の画面」だと分かるようにする。顔を作らないことで肖像の問題を回避。

**Negative（追記分）**: `common negatives + realistic human skin, facial features, photorealistic portrait, medical scan, x-ray, horror, skull`

**Aspect ratio**: `16:9`

---

## 6. 3Dプリント造形の工程カット

**用途**: 「ちゃんと作っている」感の担保。LP・チラシの工程セクション、IG-03のカルーセル2枚目。

**Prompt**
```
Close-up of a full-color 3D printer interior during printing, showing a small human figurine
being formed layer by layer on the build platform, powder-based full color printing.
Fine layer lines visible on the surface, mint-green machine LED light reflecting on the
matte print surface. Slightly out-of-focus machine mechanics in the background,
shallow depth of field, industrial but clean and warm workshop atmosphere.
Photorealistic macro product photography, muted teal and warm sand color palette, high detail.
The figurine is small, seen from behind, with a simplified unpainted face.
```

**日本語の意図**: 製造の実在感を出すカット。積層痕をあえて見せることで「3Dプリント製である」ことを正しく伝える（過度にツルツルにしない）。

**Negative（追記分）**: `common negatives + failed print, spaghetti filament, messy workshop, sparks, fire, dirty machine, human operator face`

**Aspect ratio**: `4:5`

---

## 8. 苔テラリウムの中の家族フィギュア

**用途**: 2体目以降20%OFFの訴求（IG-06）、テラリウム層への到達。

**Prompt**
```
A glass terrarium jar containing a lush green moss landscape with small ferns and a piece of
driftwood, photographed from the side at eye level. On a small moss-covered hill inside,
three painted miniature figurines stand together: two adults and one smaller child figure,
all seen from behind, at 40mm scale. Soft mist on the inner glass, warm side light
coming through the glass, dark blurred background.
Photorealistic macro product photography, deep green and warm sand color palette,
shallow depth of field, calm and intimate mood, high detail.
The figurines have simplified stylized painted faces, clearly small objects.
```

**日本語の意図**: 複数体を並べたときの「情景になる」感覚を見せる。テラリウム／苔界隈にも刺す。3体は後ろ姿で、視線の先に余白を作る。

**Negative（追記分）**: `common negatives + dead moss, brown plants, dirty glass, plastic looking fake moss, front facing figurines, children faces`

**Aspect ratio**: `4:5`

---

## 9. デスク・棚のライフスタイルカット（Mサイズ）

**用途**: 水槽を持っていない層への訴求。Webの「置き場所」セクション、IG-04の補助。

**Prompt**
```
A minimal Japanese home office desk in soft afternoon light. On the desk, a 65mm full-color
3D printed miniature figurine of a standing adult on a clear acrylic base, placed beside a
closed laptop, a ceramic mug, and a small potted plant. The figurine is seen from a
three-quarter rear angle, wearing a coral-orange shirt.
Warm neutral wall in the background, gentle long shadows, shallow depth of field,
photorealistic interior lifestyle photography, warm sand beige with mint and coral accents,
clean and uncluttered composition, high detail, 50mm lens look.
Simplified stylized painted miniature face. No people in the room.
```

**日本語の意図**: 水槽なしでも成立する用途を示す。生活感を出しすぎず、小物は3点まで。フィギュアが小さくても目に入るよう、コーラルの服で視線を誘導する。

**Negative（追記分）**: `common negatives + messy desk, cables everywhere, gaming setup RGB lights, people in frame, office building, cold blue tone`

**Aspect ratio**: `16:9`

---

## 10. 店頭のチラシ設置カット（実店舗チャネル用）

**用途**: 設置店募集の投稿（IG-09）、店舗向け提案資料。

**Prompt**
```
A tidy checkout counter in a Japanese aquarium shop, shot at a slight angle from above.
On the counter, a small acrylic flyer stand holds an A4 flyer with a deep teal and mint
colored design (details unreadable), next to a small display box containing one 40mm
miniature figurine standing on an acrylic base. Behind the counter, rows of softly glowing
planted aquariums are visible but out of focus. Warm shop lighting mixed with the blue-green
glow of the tanks. Photorealistic interior photography, deep teal and warm sand color palette,
shallow depth of field, clean composition, high detail.
No people in frame. No readable text on the flyer.
```

**日本語の意図**: 店頭に置かれている状態を店舗オーナーにイメージさせるカット。チラシの文字は生成させず（読める文字は必ず崩れるため）、後から実物のチラシデザインを合成する前提。

**Negative（追記分）**: `common negatives + readable text, garbled letters, fake japanese characters, crowded shelves, people, cash register close-up, price tags`

**Aspect ratio**: `16:9`

---

## 11. 生成後のチェックリスト

公開前に、生成した画像1点ごとに以下を確認する。

- [ ] 実在の人物に似た顔になっていないか（顔が写っている場合は差し替え）
- [ ] 子どもの顔が生成されていないか
- [ ] フィギュアの指・腕の本数が正しいか（3Dプリントの造形物として不自然でないか）
- [ ] 文字らしきものが写り込んでいないか（崩れた日本語・英字は必ず消す）
- [ ] 水槽カットで、機材（ヒーター・エアチューブ）や汚れが写っていないか
- [ ] フィギュアと周囲のスケールが破綻していないか（魚より大きい等）
- [ ] 誇大に見える表現になっていないか（元写真と完全一致に見える等）
- [ ] 公開時に「イメージ」の注記を入れたか
- [ ] 生成に使ったモデル名・プロンプト・生成日を記録したか（後日の差し替え・権利確認のため）
