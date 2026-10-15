# render.py — brand.json から 15/30秒 × 横/縦 の MP4 を一括書き出し
# 使い方: python3 render.py brands/hihaho/brand.json [--durations 15,30] [--orients h,v] [--fps 30] [--out out]
# needs_review が true の間は書き出さない。確認後に brand.json を false にするか、--force を付ける。
import argparse, base64, json, mimetypes, os, pathlib, re, shutil, subprocess

MAX_LOGO_BYTES = 15_000_000
COPY_KEYS = ("l1a", "l1b", "l2a", "l2b", "tagline", "sub", "cta", "url")


def assert_render_allowed(brand, force):
    if brand.get("needs_review") and not force:
        raise SystemExit("needs_review が true です。コピー・権利・表示を確認して false にするか、--force を付けてください。")


def parse_durations(raw):
    out = []
    for part in str(raw).split(","):
        part = part.strip()
        if not part.isdigit():
            raise SystemExit(f"尺が不正です: {raw}")
        n = int(part)
        if not 1 <= n <= 120:
            raise SystemExit("尺は 1〜120 秒です")
        out.append(n)
    if not out:
        raise SystemExit("尺を1つ以上指定してください")
    return out


def parse_orients(raw):
    out = [p.strip() for p in str(raw).split(",") if p.strip()]
    if not out or any(o not in ("h", "v") for o in out):
        raise SystemExit("向きは h または v です")
    return out


def assert_brand_shape(brand, durations):
    copy = brand.get("copy")
    if not isinstance(copy, dict):
        raise SystemExit("copy がありません")
    for k in COPY_KEYS:
        if copy.get(k) in ("", None):
            raise SystemExit(f"copy.{k} が空です")
    if not isinstance(copy.get("words"), list) or not copy["words"]:
        raise SystemExit("copy.words が空です")
    if any(d >= 30 for d in durations):
        for k in ("words2", "points"):
            if not isinstance(copy.get(k), list) or not copy[k]:
                raise SystemExit(f"30秒版には copy.{k} が必要です")


def resolve_inside(base, rel):
    """brand ディレクトリの中のファイルだけを読む。絶対パスと `..` は拒否する。"""
    if not isinstance(rel, str) or not rel:
        raise SystemExit(f"ロゴパスがブランドディレクトリの外です: {rel}")
    normalized = rel.replace("\\", "/")
    if normalized.startswith("/") or ".." in pathlib.PurePosixPath(normalized).parts:
        raise SystemExit(f"ロゴパスがブランドディレクトリの外です: {rel}")
    base = pathlib.Path(base).resolve()
    path = (base / normalized).resolve()
    try:
        path.relative_to(base)
    except ValueError:
        raise SystemExit(f"ロゴパスがブランドディレクトリの外です: {rel}") from None
    return path


def output_stem(slug):
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(slug or "")).strip("-")
    if not s or ".." in s:
        return "cm"
    return s[:64]


def data_uri(path):
    if not path.is_file():
        raise SystemExit(f"ロゴファイルがありません: {path.name}")
    if path.stat().st_size > MAX_LOGO_BYTES:
        raise SystemExit(f"ロゴファイルが大きすぎます: {path.name}")
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return "data:%s;base64,%s" % (mime, base64.b64encode(path.read_bytes()).decode())


def main(argv=None):
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("brand")
    ap.add_argument("--durations", default="15,30")
    ap.add_argument("--orients", default="h,v")  # h=横1920x1080 / v=縦1080x1920
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--out", default="out")
    ap.add_argument("--force", action="store_true", help="needs_review が true でも書き出す")
    a = ap.parse_args(argv)

    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg が見つかりません")
    if not 1 <= a.fps <= 60:
        raise SystemExit("fps は 1〜60 です")
    durations = parse_durations(a.durations)
    orients = parse_orients(a.orients)

    here = pathlib.Path(__file__).parent
    bp = pathlib.Path(a.brand).resolve()
    brand = json.loads(bp.read_text(encoding="utf8"))
    assert_render_allowed(brand, a.force)
    assert_brand_shape(brand, durations)
    brand["logo"] = {
        k: data_uri(resolve_inside(bp.parent, v))
        for k, v in brand.get("logo", {}).items() if v
    }

    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = here / "_frames"
    stem = output_stem(brand.get("slug", "cm"))
    with sync_playwright() as p:
        launch = {}
        chrome = os.environ.get("CHROMIUM_PATH")
        if chrome:
            launch["executable_path"] = chrome
        browser = p.chromium.launch(**launch)
        try:
            for d in durations:
                for o in orients:
                    w, h = (1920, 1080) if o == "h" else (1080, 1920)
                    page = browser.new_page(viewport={"width": w, "height": h})
                    page.add_init_script(
                        "window.BRAND=%s;window.CFG=%s;" % (
                            json.dumps(brand, ensure_ascii=False),
                            json.dumps({"duration": d, "orient": o}),
                        )
                    )
                    page.goto((here / "template.html").resolve().as_uri())
                    page.evaluate("window.READY")
                    shutil.rmtree(tmp, ignore_errors=True)
                    tmp.mkdir()
                    for i in range(d * a.fps):
                        page.evaluate("window.seek(%s)" % (i / a.fps))
                        page.locator("canvas").screenshot(path=str(tmp / f"{i:05d}.png"))
                    page.close()
                    dst = out / f"{stem}-{d}s-{o}.mp4"
                    subprocess.run(
                        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(a.fps), "-i", str(tmp / "%05d.png"),
                         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(dst)],
                        check=True,
                    )
                    shutil.rmtree(tmp, ignore_errors=True)
                    print("書き出し完了:", dst)
        finally:
            browser.close()
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
