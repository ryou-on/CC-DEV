# extract.py — URL からブランド情報(ロゴ・配色・文言)を取得して brands/<slug>/brand.json を作る
# 使い方: python3 extract.py https://example.com [slug]
# ANTHROPIC_API_KEY があれば Claude でコピーを自動生成。無ければ原文から仮コピーを作り、brand.json を手直しする前提
import sys, re, json, os, html, urllib.request, urllib.parse, pathlib, io
from collections import Counter
from PIL import Image

url = sys.argv[1]
slug = sys.argv[2] if len(sys.argv) > 2 else re.sub(r"[^a-z0-9]+", "-", urllib.parse.urlparse(url).netloc.lower()).strip("-")
OUT = pathlib.Path(__file__).parent / "brands" / slug
OUT.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (cm-generator)"}

def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r:
        return r.read(), r.headers.get_content_charset() or "utf-8"

raw, cs = get(url)
src = raw.decode(cs, "ignore")
def meta(*names):
    for n in names:
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{n}["\'][^>]+content=["\']([^"\']*)', src, re.I) or \
            re.search(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{n}["\']', src, re.I)
        if m: return html.unescape(m.group(1)).strip()
    return ""
def strip(t): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()

title = strip((re.search(r"<title[^>]*>([\s\S]*?)</title>", src, re.I) or [None, ""])[1])
site = meta("og:site_name") or title.split("|")[0].split("-")[0].strip()
desc = meta("og:description", "description")
heads = [strip(h) for h in re.findall(r"<h[12][^>]*>([\s\S]*?)</h[12]>", src, re.I)]
heads = [h for h in heads if 2 <= len(h) <= 40][:12]

# ---- ロゴ候補: <img> の src/alt/class に logo を含むもの → なければ og:image / apple-touch-icon / favicon ----
cands = []
for m in re.finditer(r"<img[^>]+>", src, re.I):
    tag = m.group(0); s = re.search(r'(?:data-src|src)=["\']([^"\']+)', tag, re.I)
    if s and re.search(r"logo", tag, re.I) and not s.group(1).startswith("data:"): cands.append(s.group(1))
for rel in re.findall(r'<link[^>]+rel=["\'](?:apple-touch-icon|icon|shortcut icon)["\'][^>]*>', src, re.I):
    h = re.search(r'href=["\']([^"\']+)', rel); h and cands.append(h.group(1))
og = meta("og:image"); og and cands.append(og)
logo_img, logo_url = None, None
for c in cands:
    u = urllib.parse.urljoin(url, c)
    if u.lower().split("?")[0].endswith(".svg"): continue          # SVGはPillowで読めないため除外
    try:
        b, _ = get(u); im = Image.open(io.BytesIO(b)).convert("RGBA")
        if im.width >= 64: logo_img, logo_url = im, u; break
    except Exception: pass
if logo_img: logo_img.save(OUT / "full.png")

# ---- 配色: theme-color → ロゴの主要な彩度の高い色 ----
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def hexc(c): return "#%02x%02x%02x" % tuple(int(v) for v in c)
def sat(c): mx, mn = max(c), min(c); return 0 if mx == 0 else (mx - mn) / mx
accent = None
if logo_img:
    px = [p[:3] for p in logo_img.resize((64, 64)).getdata() if p[3] > 200 and sat(p[:3]) > 0.35 and 40 < lum(p[:3]) < 220]
    px = [tuple(v // 16 * 16 + 8 for v in p) for p in px]
    if px: accent = Counter(px).most_common(1)[0][0]
tc = meta("theme-color")
if not accent and re.fullmatch(r"#[0-9a-fA-F]{6}", tc): accent = tuple(int(tc[i:i+2], 16) for i in (1, 3, 5))
accent = accent or (43, 110, 230)
bg = tuple(v * 0.22 for v in accent)                              # 背景はアクセント色を暗くしたもの
colors = {"bg": hexc(bg), "fg": "#f7fafb", "accent": hexc(accent), "accent2": hexc(tuple(min(255, v * 0.5 + 128) for v in accent)), "sub": "#8a9aa3"}

# ---- コピー ----
copy = None
key = os.environ.get("ANTHROPIC_API_KEY")
if key:
    import anthropic
    prompt = f"""次のWebサイト情報から、15〜30秒の日本語CM（文字中心モーショングラフィック）用コピーをJSONのみで返してください。
原文の言い回しを活かし、各項目は短く（l1a/l2aは8字以内、l1b/l2bは6字以内、words系は各9字以内、taglineは16字以内）。
キー: l1a,l1b(問いかけ),l2a,l2b(強いメッセージ),words(3件),words2(3件),points(3件),tagline,sub,cta,url
サイト名:{site} URL:{url}\nタイトル:{title}\n説明:{desc}\n見出し:{heads}"""
    r = anthropic.Anthropic(api_key=key).messages.create(model="claude-sonnet-4-6", max_tokens=1000, messages=[{"role": "user", "content": prompt}])
    copy = json.loads(re.search(r"\{[\s\S]*\}", r.content[0].text).group(0))
if not copy:                                                        # 仮コピー（要手直し）
    def cut(s, n):                                                  # 文の途中で切らず、読点・空白の位置で区切る
        s = s.strip()
        if len(s) <= n: return s
        i = max(s.rfind(c, 0, n) for c in "、。 　,")
        return s[:i].rstrip("、。 　,") if i >= max(3, n // 2) else s[:n]
    hs = [cut(h, 9) for h in heads] + [cut(desc, 9)] * 8
    copy = {"l1a": "それ、", "l1b": cut(heads[0] if heads else site, 6), "l2a": cut(site, 8) + "なら、", "l2b": cut(heads[1] if len(heads) > 1 else "変わる。", 6),
            "words": hs[2:5], "words2": hs[5:8], "points": [cut(h, 18) for h in (heads + [desc] * 8)[8:11]],
            "tagline": cut(desc or title, 16), "sub": cut((desc or title)[16:], 30), "cta": "詳しくは、こちら。", "url": urllib.parse.urlparse(url).netloc}
(OUT / "brand.json").write_text(json.dumps({"name": site, "slug": slug, "url": url, "colors": colors,
    "logo": {"full": "full.png"} if logo_img else {}, "logo_source": logo_url, "copy": copy,
    "needs_review": not key}, ensure_ascii=False, indent=2), encoding="utf8")
print(f"書き出し: {OUT/'brand.json'}  (ロゴ: {logo_url}, accent: {colors['accent']}, 自動コピー: {bool(key)})")
