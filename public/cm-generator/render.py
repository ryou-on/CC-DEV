# render.py — brand.json から 15/30秒 × 横/縦 の MP4 を一括書き出し
# 使い方: python3 render.py brands/hihaho/brand.json [--durations 15,30] [--orients h,v] [--fps 30] [--out out]
import argparse, base64, json, mimetypes, os, pathlib, shutil, subprocess
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("brand")
ap.add_argument("--durations", default="15,30")
ap.add_argument("--orients", default="h,v")        # h=横1920x1080 / v=縦1080x1920
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--out", default="out")
a = ap.parse_args()

HERE = pathlib.Path(__file__).parent
bp = pathlib.Path(a.brand).resolve()
brand = json.loads(bp.read_text(encoding="utf8"))

def data_uri(p):                                    # ロゴ画像を data URI に埋め込む
    p = bp.parent / p
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
brand["logo"] = {k: data_uri(v) for k, v in brand.get("logo", {}).items() if v}

out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
tmp = HERE / "_frames"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
    for d in [int(x) for x in a.durations.split(",")]:
        for o in a.orients.split(","):
            W, H = (1920, 1080) if o == "h" else (1080, 1920)
            page = browser.new_page(viewport={"width": W, "height": H})
            page.add_init_script(f"window.BRAND={json.dumps(brand, ensure_ascii=False)};window.CFG={json.dumps({'duration': d, 'orient': o})};")
            page.goto((HERE / "template.html").resolve().as_uri())
            page.evaluate("window.READY")
            shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
            for i in range(d * a.fps):
                page.evaluate(f"window.seek({i / a.fps})")
                page.locator("canvas").screenshot(path=str(tmp / f"{i:05d}.png"))
            page.close()
            dst = out / f"{brand.get('slug', 'cm')}-{d}s-{o}.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(a.fps), "-i", str(tmp / "%05d.png"),
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(dst)], check=True)
            shutil.rmtree(tmp)
            print("書き出し完了:", dst)
    browser.close()
