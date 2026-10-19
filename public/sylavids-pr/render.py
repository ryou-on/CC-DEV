# render.py — index.html の seek(t) を全フレーム撮影して MP4 化する
# 事前準備: pip install playwright && playwright install chromium / ffmpeg を導入
# 実行例:
#   python3 render.py              → 30fps で sylavids-pr.mp4 を書き出し
#   python3 render.py --qa         → 各シーンの代表フレームと境界を qa/ に PNG 保存（MP4 は作らない）
# Chromium を指定したい場合は環境変数 CHROMIUM_PATH を設定
import subprocess, pathlib, shutil, sys, os
from playwright.sync_api import sync_playwright

FPS = 30                      # フレームレート（納品仕様 30fps）
W, H = 1920, 1080             # 解像度（納品仕様 1080p）
HERE = pathlib.Path(__file__).parent
QA = "--qa" in sys.argv
OUT = HERE / ("qa" if QA else "frames")
MP4 = HERE / "sylavids-pr.mp4"

# QA 用の確認時刻：各シーンの完成状態（4.3秒時点）と境界の前後
QA_TIMES = [s * 5 + 4.3 for s in range(6)] + [b + d for b in (5, 10, 15, 20, 25) for d in (-0.2, 0.2)] + [29.9]

shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto((HERE / "index.html").resolve().as_uri())
    page.evaluate("window.READY")                     # 画像・フォント読み込み待ち
    canvas = page.locator("canvas")
    if QA:
        for t in sorted(QA_TIMES):
            page.evaluate(f"window.seek({t})")
            canvas.screenshot(path=str(OUT / f"t{t:05.2f}.png"))
        browser.close()
        print(f"QA フレームを保存: {OUT}")
        sys.exit(0)
    total = round(page.evaluate("window.DURATION") * FPS)
    for i in range(total):
        page.evaluate(f"window.seek({i / FPS})")
        canvas.screenshot(path=str(OUT / f"{i:05d}.png"))
    browser.close()

# 連番画像 → H.264 MP4。yuv420p は互換性のため必須、faststart で Web 配信向けに先頭へ moov を配置
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(OUT / "%05d.png"),
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18",
    "-r", str(FPS), "-movflags", "+faststart", str(MP4),
], check=True)
shutil.rmtree(OUT)
print(f"書き出し完了: {MP4.name}")
