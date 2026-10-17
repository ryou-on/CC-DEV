# render.py — index.html の seek(t) を全フレーム撮影し、BGM・効果音（audio.py）と合わせて MP4 化する
# 事前準備: pip install playwright numpy && playwright install chromium / ffmpeg を導入
# 実行: python3 render.py [fps] [plain|stars]   例) python3 render.py 30 plain
#   plain … 最後の場面の下側を空ける（hihaho の「評価」インタラクションを重ねる用）
#   stars … 星を選ぶ動き入りの確認用
import subprocess, pathlib, shutil, sys, os, json
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
FPS = int(args[0]) if len(args) > 0 else 30
VARIANT = args[1] if len(args) > 1 else "plain"
W, H = 1920, 1080
HERE = pathlib.Path(__file__).parent
OUT = HERE / f"frames_{VARIANT}"
shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir()
events_path = HERE / f"events_{VARIANT}.json"
wav_path = HERE / f"audio_{VARIANT}.wav"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto((HERE / "index.html").resolve().as_uri() + ("?end=stars" if VARIANT == "stars" else ""))
    page.evaluate("window.READY")
    events_path.write_text(json.dumps(page.evaluate("window.SFX()")), encoding="utf-8")
    total = int(page.evaluate("window.DURATION") * FPS)
    for i in range(total):
        page.evaluate(f"window.seek({i / FPS})")
        page.locator("canvas").screenshot(path=str(OUT / f"{i:05d}.png"))
    browser.close()

out = HERE / ("hihaho-rating-10s.mp4" if VARIANT == "plain" else "hihaho-rating-10s-stars.mp4")
subprocess.run([sys.executable, str(HERE / "audio.py"), str(events_path), str(wav_path)], check=True)
subprocess.run(["ffmpeg", "-y", "-framerate", str(FPS), "-i", str(OUT / "%05d.png"), "-i", str(wav_path),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
                "-af", "loudnorm=I=-17:TP=-3:LRA=11,volume=-2dB", "-c:a", "aac", "-b:a", "160k", "-shortest", str(out)], check=True)
shutil.rmtree(OUT)
for f in (events_path, wav_path):
    f.unlink(missing_ok=True)
print("書き出し完了:", out.name)
