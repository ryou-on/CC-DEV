# render.py — index.html の seek(t) を全フレーム撮影し、BGM・効果音（audio.py）と合わせて MP4 化する（日英切替）
# 事前準備: pip install playwright numpy && playwright install chromium / ffmpeg を導入
# 実行: python3 render.py [fps] [ja|en] [--silent]   例) python3 render.py 30 ja
import subprocess, pathlib, shutil, sys, os, json
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
FPS = int(args[0]) if len(args) > 0 else 30           # フレームレート
LANG = args[1] if len(args) > 1 else "ja"             # 言語（ja / en）
SILENT = "--silent" in sys.argv                       # 音声なしで書き出す場合
W, H = 1920, 1080                                     # 解像度
HERE = pathlib.Path(__file__).parent
OUT = HERE / f"frames_{LANG}"
shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir()
events_path = HERE / f"events_{LANG}.json"
wav_path = HERE / f"audio_{LANG}.wav"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))  # 環境変数で Chromium を指定可
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto((HERE / "index.html").resolve().as_uri() + f"?lang={LANG}")
    page.evaluate("window.READY")                     # ロゴ画像・フォント読み込み待ち
    events_path.write_text(json.dumps(page.evaluate("window.SFX()")), encoding="utf-8")   # 効果音タイミングを取得
    total = int(page.evaluate("window.DURATION") * FPS)
    for i in range(total):
        # 指定時刻のフレームを描画させて canvas だけを PNG で取得
        page.evaluate(f"window.seek({i / FPS})")
        page.locator("canvas").screenshot(path=str(OUT / f"{i:05d}.png"))
    browser.close()

out = HERE / f"hihaho-intro-{LANG}.mp4"
cmd = ["ffmpeg", "-y", "-framerate", str(FPS), "-i", str(OUT / "%05d.png")]
if not SILENT:
    subprocess.run([sys.executable, str(HERE / "audio.py"), str(events_path), str(wav_path)], check=True)   # BGM + 効果音を合成
    cmd += ["-i", str(wav_path)]
# 連番画像を H.264 に。yuv420p は QuickTime/SNS 互換のため必須。音声は AAC
cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18"]
if not SILENT:
    cmd += ["-af", "loudnorm=I=-17:TP=-3:LRA=11,volume=-2dB", "-c:a", "aac", "-b:a", "160k", "-shortest"]   # 音量を -17 LUFS・ピーク -3dB に自動調整
subprocess.run(cmd + [str(out)], check=True)
shutil.rmtree(OUT)
for f in (events_path, wav_path):
    f.unlink(missing_ok=True)
print("書き出し完了:", out.name)
