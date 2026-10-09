# audio.py — 効果音イベント(JSON)から BGM + 効果音の WAV を合成する（numpy のみ・外部素材なし）
# 実行: python3 audio.py events.json audio.wav
# events.json は index.html の window.SFX() の出力: {"duration": 秒, "events": [{"t": 秒, "type": 種別, "v": 音量}]}
import json, sys, wave
import numpy as np

SR = 44100
BEAT = 0.5                                   # BPM120

events_path, out_path = sys.argv[1], sys.argv[2]
data = json.load(open(events_path))
DUR = data["duration"]
N = int(DUR * SR) + SR
mix = np.zeros(N)
rng = np.random.default_rng(7)               # 毎回同じ音になるよう乱数を固定


def tvec(sec):
    return np.arange(int(sec * SR)) / SR


def place(buf, start, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    j = min(N, i + len(buf))
    mix[i:j] += buf[: j - i] * gain


def tone(freq, sec, decay, amp=1.0, harmonics=((1, 1.0),)):
    t = tvec(sec)
    y = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in harmonics)
    return y * np.exp(-t / decay) * amp


def add(arr, i, buf):                         # 範囲外を安全に無視して加算
    if i < 0 or i >= N:
        return
    j = min(N, i + len(buf))
    arr[i:j] += buf[: j - i]


def lowpass(x, win):                          # 移動平均によるローパス
    k = np.ones(win) / win
    return np.convolve(x, k, mode="same")


# ---------- 効果音 ----------
def sfx_pop(v):                               # ぽん：音程が上がって消える
    t = tvec(0.14)
    f = 520 + 520 * (1 - np.exp(-t / 0.025))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    return y * 0.5 * v


def sfx_blip(v):                              # 説明行が出る合図：2音の短いピッ
    return (tone(988, 0.16, 0.05, 0.28) + tone(1480, 0.16, 0.04, 0.2)) * v


def sfx_tick(v):                              # 時計・線が伸びるカチッ
    t = tvec(0.04)
    return (rng.standard_normal(len(t)) * np.exp(-t / 0.004) * 0.25 + np.sin(2 * np.pi * 2200 * t) * np.exp(-t / 0.01) * 0.25) * v


def sfx_key(v):                               # キーボードを押す音
    t = tvec(0.07)
    return (np.sin(2 * np.pi * 260 * t) * np.exp(-t / 0.02) * 0.5 + rng.standard_normal(len(t)) * np.exp(-t / 0.006) * 0.3) * v


def sfx_click(v):                             # 選択・決定のクリック
    t = tvec(0.09)
    return (np.sin(2 * np.pi * 700 * t) * np.exp(-t / 0.018) * 0.45 + np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.012) * 0.2) * v


def sfx_ding(v):                              # 成功のベル
    return tone(1568, 1.1, 0.35, 0.3, ((1, 1.0), (2.76, 0.4), (5.4, 0.18))) * v


def sfx_warn(v):                              # 注意：下がる2音
    t = tvec(0.28)
    f = 520 - 140 * (t / 0.28)
    y = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    return lowpass(y, 8) * np.exp(-t / 0.15) * 0.3 * v


def sfx_beep(v):                              # タイマーの警告ビープ
    t = tvec(0.09)
    return np.sin(2 * np.pi * 1250 * t) * np.minimum(1, t / 0.005) * np.exp(-t / 0.05) * 0.3 * v


def sfx_thud(v):                              # 章扉の数字が着地する低音
    t = tvec(0.5)
    f = 48 + 70 * np.exp(-t / 0.06)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = lowpass(rng.standard_normal(len(t)), 30) * np.exp(-t / 0.01)
    return (body * 0.8 + click * 0.4) * v


def sfx_whoosh(v):                            # 画面転換のスイープ
    n = int(0.75 * SR)
    noise = rng.standard_normal(n)
    dull, bright = lowpass(noise, 140), lowpass(noise, 10)
    m = np.linspace(0, 1, n)
    y = dull * (1 - m) + bright * m
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    y = y / (np.max(np.abs(y)) + 1e-9)
    return y * env * 0.45 * v


def sfx_chime(v):                             # ロゴ登場のアルペジオ
    out = np.zeros(int(1.6 * SR))
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        b = tone(f, 1.2, 0.3, 0.2, ((1, 1.0), (2.76, 0.25)))
        i = int(k * 0.09 * SR)
        out[i:i + len(b)] += b[: len(out) - i]
    return out * v


SFX = dict(pop=sfx_pop, blip=sfx_blip, tick=sfx_tick, key=sfx_key, click=sfx_click, ding=sfx_ding,
           warn=sfx_warn, beep=sfx_beep, thud=sfx_thud, whoosh=sfx_whoosh, chime=sfx_chime)

sfx_mix = np.zeros(N)
for e in data["events"]:
    fn = SFX.get(e["type"])
    if not fn:
        continue
    buf = fn(float(e.get("v", 1.0)))
    add(sfx_mix, int(e["t"] * SR), buf)

# ---------- BGM（C–G–Am–F のループ。イントロ→本編で少しずつ音を足す） ----------
CHORDS = [  # (ルート Hz, 和音 Hz)
    (65.41, [261.63, 329.63, 392.00]),    # C
    (49.00, [246.94, 293.66, 392.00]),    # G
    (55.00, [261.63, 329.63, 440.00]),    # Am
    (43.65, [261.63, 349.23, 440.00]),    # F
]
bgm = np.zeros(N)
total_beats = int(DUR / BEAT) + 4
for beat in range(0, total_beats, 4):         # 1小節 = 4拍 = 2秒
    bar = beat // 4
    root, chord = CHORDS[bar % 4]
    t0 = beat * BEAT
    # パッド（ゆっくり立ち上がる持続音）
    t = tvec(2.2)
    env = np.minimum(1, t / 0.5) * np.minimum(1, (2.2 - t) / 0.6)
    pad = sum(np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2 * t) for f in chord) / len(chord)
    add(bgm, int(t0 * SR), pad * env * 0.07)
    # ベース（3拍目以降から）
    if beat >= 8:
        for k in (0, 2):
            b = tone(root * 2, 0.5, 0.25, 0.16)
            add(bgm, int((t0 + k * BEAT) * SR), b)
    # アルペジオ（8分音符。本編から）
    if beat >= 12:
        pattern = [0, 1, 2, 1, 0, 1, 2, 1]
        for k, idx in enumerate(pattern):
            f = chord[idx] * 2
            b = tone(f, 0.35, 0.09, 0.07, ((1, 1.0), (2, 0.25), (3, 0.1)))
            add(bgm, int((t0 + k * BEAT / 2) * SR), b)
    # ハイハット・キック（全体像以降）
    if beat >= 22:
        for k in range(8):
            if k % 2 == 1:
                t = tvec(0.04)
                h = rng.standard_normal(len(t)) * np.exp(-t / 0.008) * 0.03
                add(bgm, int((t0 + k * BEAT / 2) * SR), h - lowpass(h, 6))
        for k in (0, 2):
            t = tvec(0.25)
            f = 45 + 80 * np.exp(-t / 0.04)
            kk = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * 0.14
            add(bgm, int((t0 + k * BEAT) * SR), kk)

# ---------- ミックス ----------
out = bgm * 0.9 + sfx_mix * 1.0
n_dur = int(DUR * SR)
out = out[:n_dur]
fade_in = np.minimum(1, np.arange(n_dur) / (0.3 * SR))
fade_out = np.minimum(1, (n_dur - np.arange(n_dur)) / (2.0 * SR))
out = out * fade_in * fade_out
peak = np.max(np.abs(out)) + 1e-9
out = out / peak * 0.89                       # ピークを -1dBFS 付近に正規化
pcm = (out * 32767).astype(np.int16)
stereo = np.column_stack([pcm, pcm]).ravel()
with wave.open(out_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(stereo.tobytes())
print(f"音声を書き出し: {out_path} ({DUR:.0f}秒, イベント{len(data['events'])}件, ピーク正規化 x{0.89 / peak:.2f})")
