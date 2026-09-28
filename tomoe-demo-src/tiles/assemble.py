# Canvaサムネイルタイルからルック画像を再構成する
from PIL import Image, ImageFilter
import os
R = '/root/.claude/projects/-home-user-CC-DEV/1b2e0f21-7293-5775-8aa9-f9edd7644e27/tool-results'
full = {'keyvisual': '1790500491299-wdzor0', 's1-silhouette': '1790500504637-9s63ym', 's2-closeup': '1790500509462-phq1q0',
        's3-slash': '1790500513368-81k8ki', 's4-bow': '1790500517185-4eqsys', 's5-sheathe': '1790500520926-gk5lh4'}
tiles = {}
for line in open('tiles/map.txt'):
    p = line.split()
    tiles[p[0]] = p[1:]
os.makedirs('public/look', exist_ok=True)
for name, fid in full.items():
    # ベース：フルサムネを1800x1013に拡大
    base = Image.open(f'{R}/mcp-Canva-blob-{fid}.png').convert('RGB').resize((1800, 1013), Image.LANCZOS)
    for t, tid in enumerate(tiles.get(name, [])):
        col, row = t % 3, t // 3
        tile = Image.open(f'{R}/mcp-Canva-blob-{tid}.png').convert('RGB').resize((600, 600), Image.LANCZOS)
        h = 600 if row == 0 else 1013 - 600
        base.paste(tile.crop((0, 0, 600, h)), (col * 600, row * 600))
    out = base.resize((1920, 1080), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    out.save(f'public/look/{name}.jpg', quality=92)
    print(name, len(tiles.get(name, [])), 'tiles')
