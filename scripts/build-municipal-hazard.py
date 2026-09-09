"""Extract a reproducible local sample from the Tokyo open-data CSV downloads.

Usage: python3 scripts/build-municipal-hazard.py /path/to/downloaded-csv-directory
The CSV files are kanda.csv, shakujii.csv, sumida.csv; source URLs are in the manifest.
"""
import csv
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/hazard-dashboard/data'
BOUNDS = [139.665, 35.67, 139.755, 35.755]
SOURCES = [
    ('kanda', '神田川流域', '2018-03-30', 'utf-8-sig', 'https://www.opendata.metro.tokyo.lg.jp/kensetsu/R3/shinsui_kandagawa.csv'),
    ('shakujii', '石神井川・白子川流域', '2019-05', 'cp932', 'https://www.opendata.metro.tokyo.lg.jp/gesui/R3/shakujii_shirako_jiban_shinsui_1.csv'),
    ('sumida', '隅田川・新河岸川流域', '2021-03-30', 'utf-8-sig', 'https://www.opendata.metro.tokyo.lg.jp/kensetsu/R3/shinsui_sumidagawa.csv'),
]


def build(source_dir):
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = dict(schemaVersion=1, checkedAt='2026-09-09', bounds=BOUNDS,
                    format='12-byte records: little-endian uint32 latitude*1e7, uint32 longitude*1e7, float32 depth meters',
                    description='東京都の浸水予想区域図（外水＋内水）の数値データを両区周辺の矩形で抽出。区境による切り抜きなし。座標は0.0000001度に丸め、浸水深はfloat32で保存。',
                    license='CC BY', sources=[])
    for key, name, date, encoding, url in SOURCES:
        src = source_dir / (key + '.csv')
        raw = src.read_bytes()
        out = bytearray()
        total = colored = 0
        with src.open(encoding=encoding, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get('緯度'):
                    continue
                lat, lng, depth = (float(row[k]) for k in ('緯度', '経度', '浸水深'))
                if not all(math.isfinite(v) for v in (lat, lng, depth)) or depth < 0:
                    raise ValueError('Invalid source value')
                total += 1
                if BOUNDS[0] <= lng <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]:
                    out.extend(struct.pack('<IIf', round(lat * 1e7), round(lng * 1e7), depth))
                    colored += depth >= .1
        filename = key + '-20260909.bin'
        (DEST / filename).write_bytes(out)
        manifest['sources'].append(dict(id=key, name=name, modelDate=date, url=url,
                                      file=filename, count=len(out)//12, coloredCount=colored,
                                      originalCount=total, sourceSha256=hashlib.sha256(raw).hexdigest(),
                                      sha256=hashlib.sha256(out).hexdigest()))
        print(key, len(out)//12, 'records', len(out), 'bytes')
    (DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build(Path(sys.argv[1]))
