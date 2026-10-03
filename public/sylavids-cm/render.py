# render.py — index.html の seek(t) を全フレーム撮影して MP4 化する
# 事前準備: pip install playwright && playwright install chromium / ffmpeg を導入
# 実行: python3 render.py [fps]   例) python3 render.py 60
import subprocess, pathlib, shutil, sys, os
from playwright.sync_api import sync_playwright

FPS = int(sys.argv[1]) if len(sys.argv) > 1 else 30   # フレームレート
W, H = 1920, 1080                                     # 解像度
HERE = pathlib.Path(__file__).parent
OUT = HERE / "frames"
shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))  # 環境変数で Chromium を指定可
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto((HERE / "index.html").resolve().as_uri())
    page.wait_for_timeout(500)                        # フォント読み込み待ち
    total = int(page.evaluate("window.DURATION") * FPS)
    for i in range(total):
        # 指定時刻のフレームを描画させて canvas だけを PNG で取得
        page.evaluate(f"window.seek({i / FPS})")
        page.locator("canvas").screenshot(path=str(OUT / f"{i:05d}.png"))
    browser.close()

# 連番画像を MP4（H.264）に変換。yuv420p は QuickTime/SNS 互換のため必須
subprocess.run([
    "ffmpeg", "-y", "-framerate", str(FPS), "-i", str(OUT / "%05d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    str(HERE / "sylavids-cm.mp4"),
], check=True)
shutil.rmtree(OUT)
print("書き出し完了: sylavids-cm.mp4")
