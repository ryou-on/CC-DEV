# extract.py — URL からブランド情報(ロゴ・配色・文言)を取得して brands/<slug>/brand.json を作る
# 使い方: python3 extract.py https://example.com [slug]
# ANTHROPIC_API_KEY があれば Claude でコピーを下書きする。
# 自動生成でも仮コピーでも needs_review は true のまま。人間が確認してから false にする。
import ipaddress, json, os, re, socket, sys, html, urllib.request, urllib.parse, pathlib, io
from collections import Counter

GENERATOR_VERSION = "0.1.0"
MAX_RESPONSE_BYTES = 8_000_000
UA = {"User-Agent": "Mozilla/5.0 (cm-generator)"}
_BLOCKED_HOSTS = {"localhost", "metadata.google.internal", "metadata.google.com"}


def safe_slug(raw):
    """ディレクトリ名に使える slug だけを残す。`..` や区切り文字では外に出られない。"""
    s = re.sub(r"[^a-z0-9-]+", "-", (raw or "").lower()).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    if not s or len(s) > 64:
        raise SystemExit("slug は英小文字・数字・ハイフンの 1〜64 文字にしてください")
    return s


def _reject_ip(ip):
    if any((
        ip.is_private, ip.is_loopback, ip.is_link_local, ip.is_multicast,
        ip.is_reserved, ip.is_unspecified,
    )):
        raise SystemExit(f"内部向けアドレスには接続できません: {ip}")


def validate_public_http_url(url, *, resolve_dns=True):
    """http(s) の公開向け URL だけを通す。名前解決後の私設アドレスも拒否する。

    DNS 再バインドや、接続直前のアドレス変化までは見ていない。Web 化する前の追加対策は計画書を参照。
    """
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise SystemExit("URL は http または https だけ指定できます")
    if p.username or p.password:
        raise SystemExit("URL にユーザー情報は含められません")
    host = p.hostname.lower().rstrip(".")
    if host in _BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal") or host.isdigit():
        raise SystemExit(f"内部向けホストは指定できません: {host}")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        _reject_ip(ip)
        return p
    if resolve_dns:
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror as e:
            raise SystemExit(f"名前解決に失敗しました: {host}") from e
        for info in infos:
            _reject_ip(ipaddress.ip_address(info[4][0]))
    return p


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_http_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    validate_public_http_url(url)
    opener = urllib.request.build_opener(_SafeRedirect)
    req = urllib.request.Request(url, headers=UA)
    with opener.open(req, timeout=30) as r:
        validate_public_http_url(r.geturl())
        data = r.read(MAX_RESPONSE_BYTES + 1)
        if len(data) > MAX_RESPONSE_BYTES:
            raise SystemExit(f"応答が大きすぎます（上限 {MAX_RESPONSE_BYTES} バイト）")
        return data, r.headers.get_content_charset() or "utf-8"


def main(argv=None):
    from PIL import Image

    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) < 1:
        raise SystemExit("使い方: python3 extract.py https://example.com [slug]")
    url = argv[0]
    validate_public_http_url(url)
    if len(argv) > 1:
        slug = safe_slug(argv[1])
    else:
        slug = safe_slug(urllib.parse.urlparse(url).netloc)
    out = pathlib.Path(__file__).parent / "brands" / slug
    out.mkdir(parents=True, exist_ok=True)

    raw, cs = fetch(url)
    src = raw.decode(cs, "ignore")

    def meta(*names):
        for n in names:
            m = re.search(rf'<meta[^>]+(?:property|name)=["\']{n}["\'][^>]+content=["\']([^"\']*)', src, re.I) or \
                re.search(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{n}["\']', src, re.I)
            if m:
                return html.unescape(m.group(1)).strip()
        return ""

    def strip(t):
        return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()

    title = strip((re.search(r"<title[^>]*>([\s\S]*?)</title>", src, re.I) or [None, ""])[1])
    site = meta("og:site_name") or title.split("|")[0].split("-")[0].strip()
    desc = meta("og:description", "description")
    heads = [strip(h) for h in re.findall(r"<h[12][^>]*>([\s\S]*?)</h[12]>", src, re.I)]
    heads = [h for h in heads if 2 <= len(h) <= 40][:12]

    # ---- ロゴ候補: <img> の src/alt/class に logo を含むもの → なければ og:image / apple-touch-icon / favicon ----
    cands = []
    for m in re.finditer(r"<img[^>]+>", src, re.I):
        tag = m.group(0)
        s = re.search(r'(?:data-src|src)=["\']([^"\']+)', tag, re.I)
        if s and re.search(r"logo", tag, re.I) and not s.group(1).startswith("data:"):
            cands.append(s.group(1))
    for rel in re.findall(r'<link[^>]+rel=["\'](?:apple-touch-icon|icon|shortcut icon)["\'][^>]*>', src, re.I):
        h = re.search(r'href=["\']([^"\']+)', rel)
        if h:
            cands.append(h.group(1))
    og = meta("og:image")
    if og:
        cands.append(og)
    logo_img, logo_url = None, None
    for c in cands:
        u = urllib.parse.urljoin(url, c)
        if u.lower().split("?")[0].endswith(".svg"):
            continue  # SVGはPillowで読めないため除外
        try:
            validate_public_http_url(u)
            b, _ = fetch(u)
            im = Image.open(io.BytesIO(b)).convert("RGBA")
            if im.width >= 64:
                logo_img, logo_url = im, u
                break
        except (Exception, SystemExit):
            # 候補の失敗（私設アドレス、巨大応答、壊れた画像）は次の候補へ進む。
            # ページ本体の URL は main() の先頭で検証済みなので、ここでは落とさない。
            continue
    if logo_img:
        logo_img.save(out / "full.png")

    # ---- 配色: theme-color → ロゴの主要な彩度の高い色 ----
    def lum(c):
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    def hexc(c):
        return "#%02x%02x%02x" % tuple(int(v) for v in c)

    def sat(c):
        mx, mn = max(c), min(c)
        return 0 if mx == 0 else (mx - mn) / mx

    accent = None
    if logo_img:
        px = [p[:3] for p in logo_img.resize((64, 64)).getdata() if p[3] > 200 and sat(p[:3]) > 0.35 and 40 < lum(p[:3]) < 220]
        px = [tuple(v // 16 * 16 + 8 for v in p) for p in px]
        if px:
            accent = Counter(px).most_common(1)[0][0]
    tc = meta("theme-color")
    if not accent and re.fullmatch(r"#[0-9a-fA-F]{6}", tc):
        accent = tuple(int(tc[i:i + 2], 16) for i in (1, 3, 5))
    accent = accent or (43, 110, 230)
    bg = tuple(v * 0.22 for v in accent)  # 背景はアクセント色を暗くしたもの
    colors = {
        "bg": hexc(bg), "fg": "#f7fafb", "accent": hexc(accent),
        "accent2": hexc(tuple(min(255, v * 0.5 + 128) for v in accent)), "sub": "#8a9aa3",
    }

    # ---- コピー ----
    def cut(s, n):
        """n文字以内に収める。読点・空白で区切り、M&A のような英数字の語の途中では切らない"""
        s = (s or "").strip()
        if len(s) <= n:
            return s
        isw = lambda c: c.isascii() and (c.isalnum() or c in "&+-./")
        j = n
        if isw(s[n - 1]) and isw(s[n]):  # 語の途中 → 語の終わりまで伸ばす（+4文字まで）
            k = n
            while k < len(s) and isw(s[k]):
                k += 1
            if k - n <= 4:
                j = k
            else:  # 伸ばせないなら語の手前まで戻す
                while j > 0 and isw(s[j - 1]):
                    j -= 1
        i = max(s.rfind(c, 0, j) for c in "、。 　,・/")
        out_s = s[:j] if (j > n or i < max(3, n // 2)) else s[:i]
        return out_s.rstrip("、。 　,・/&+-")

    # README・プロンプトの字数と一致していない。視覚検査を足すまではこの上限を維持する。
    LIMITS = {"l1a": 8, "l1b": 8, "l2a": 10, "l2b": 8, "tagline": 18, "sub": 32}

    def sanitize(c):
        for k, n in LIMITS.items():
            if k in c:
                c[k] = cut(c[k], n)
        for k, n in (("words", 10), ("words2", 10), ("points", 18)):
            if k in c and isinstance(c[k], list):
                c[k] = [cut(x, n) for x in c[k]]
        return c

    copy = None
    copy_source = "fallback"
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        try:
            import anthropic
            prompt = f"""次のWebサイト情報から、15〜30秒の日本語CM（文字中心モーショングラフィック）用コピーをJSONのみで返してください。
原文の言い回しを活かし、「M&A」「SEO」のような英字略語は途中で切らず、各項目は短く（l1a/l2aは8字以内、l1b/l2bは6字以内、words系は各9字以内、taglineは16字以内）。
キー: l1a,l1b(問いかけ),l2a,l2b(強いメッセージ),words(3件),words2(3件),points(3件),tagline,sub,cta,url
サイト名:{site} URL:{url}\nタイトル:{title}\n説明:{desc}\n見出し:{heads}"""
            r = anthropic.Anthropic(api_key=key).messages.create(
                model="claude-sonnet-4-6", max_tokens=1000,
                messages=[{"role": "user", "content": prompt}],
            )
            copy = json.loads(re.search(r"\{[\s\S]*\}", r.content[0].text).group(0))
            copy_source = "claude"
        except Exception:
            # 例外メッセージにキーや応答本文が含まれることがあるため、型名だけ出す。
            print("Claude のコピー生成に失敗したため仮コピーを使います:", sys.exc_info()[0].__name__, file=sys.stderr)
            copy = None
            copy_source = "fallback"
    if not copy:  # 仮コピー（要手直し）
        hs = [cut(h, 9) for h in heads] + [cut(desc, 9)] * 8
        copy = {
            "l1a": "それ、", "l1b": cut(heads[0] if heads else site, 6),
            "l2a": cut(site, 8) + "なら、", "l2b": cut(heads[1] if len(heads) > 1 else "変わる。", 6),
            "words": hs[2:5], "words2": hs[5:8], "points": [cut(h, 18) for h in (heads + [desc] * 8)[8:11]],
            "tagline": cut(desc or title, 16), "sub": cut((desc or title)[16:], 30),
            "cta": "詳しくは、こちら。", "url": urllib.parse.urlparse(url).netloc,
        }
        copy_source = "fallback"
    copy = sanitize(copy)
    (out / "brand.json").write_text(json.dumps({
        "name": site, "slug": slug, "url": url, "generator": GENERATOR_VERSION,
        "colors": colors,
        "logo": {"full": "full.png"} if logo_img else {}, "logo_source": logo_url, "copy": copy,
        "copy_source": copy_source,
        # API の成否では下ろさない。受託では人間がコピーと権利を見てから false にする。
        "needs_review": True,
    }, ensure_ascii=False, indent=2), encoding="utf8")
    print(f"書き出し: {out / 'brand.json'}  (ロゴ: {logo_url}, accent: {colors['accent']}, コピー: {copy_source}, 要確認: true)")


if __name__ == "__main__":
    main()
