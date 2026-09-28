# 巴御前 デモ動画用 BGM/SE を numpy で合成（30秒・48kHz・ステレオ）
# 和太鼓・琴（都節音階, Karplus-Strong）・篠笛風リード・ドローン・斬撃/弓/納刀SE
import numpy as np
import wave
import os

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
mix = np.zeros((N, 2))


def place(sig, t, gain=1.0, pan=0.0):
    """信号 sig を時刻 t 秒に配置（pan: -1=左, 1=右）"""
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    mix[i : i + len(sig), 0] += sig * gain * l
    mix[i : i + len(sig), 1] += sig * gain * r


def env_exp(n, decay):
    return np.exp(-np.arange(n) / SR / decay)


def taiko(size=1.0):
    """和太鼓：ピッチが落ちるサイン＋皮のノイズ"""
    n = int(SR * 1.6 * size)
    t = np.arange(n) / SR
    f = 55 * size ** -0.5 + 70 * np.exp(-t * 18)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.35 * size)
    skin = rng.standard_normal(n) * env_exp(n, 0.03)
    skin = np.convolve(skin, np.ones(12) / 12, 'same')
    return np.tanh((body * 1.4 + skin * 0.5) * 1.3)


def shime():
    """締太鼓（高めのアクセント）"""
    n = int(SR * 0.25)
    t = np.arange(n) / SR
    f = 220 + 160 * np.exp(-t * 40)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.7 + rng.standard_normal(n) * 0.25) * env_exp(n, 0.05)


def koto(freq, dur=2.2):
    """琴：Karplus-Strong 撥弦"""
    n = int(SR * dur)
    p = int(SR / freq)
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    # 撥のアタック感
    out[: int(SR * 0.004)] *= np.linspace(0, 1, int(SR * 0.004))
    return out * 0.8


def fue(freq, dur, vib=5.5):
    """篠笛風リード：ビブラート付きサイン＋息ノイズ"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = freq * (1 + 0.012 * np.sin(2 * np.pi * vib * t) * np.clip(t / 0.4, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = np.convolve(rng.standard_normal(n), np.ones(30) / 30, 'same') * 0.15
    a = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    return (tone + breath) * a * 0.35


def drone(freq, dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * k * t + k) / k for k in (1, 2, 3, 5))
    a = np.clip(t / 1.5, 0, 1) * np.clip((dur - t) / 1.0, 0, 1)
    return s * a * 0.18


def noise_sweep(dur, f0, f1, decay=0.2):
    """斬撃・風切り：帯域が動くノイズ"""
    n = int(SR * dur)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    y1 = y2 = 0.0
    fs = np.linspace(f0, f1, n)
    for i in range(n):
        w = 2 * np.pi * fs[i] / SR
        alpha = np.sin(w) / (2 * 2.5)
        # 簡易バンドパス（状態変数ではなく2次IIRの近似）
        y = alpha * x[i] + 2 * np.cos(w) * y1 * (1 - alpha) - y2 * (1 - 2 * alpha)
        y2, y1 = y1, y
        out[i] = y
    out /= np.max(np.abs(out)) + 1e-9
    t = np.arange(n) / SR
    return out * np.clip(t / 0.02, 0, 1) * np.exp(-t / decay)


def metal_ping(freq=2400, dur=1.2):
    """納刀の「カチン」：非整数倍音の金属音"""
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * r * t) * np.exp(-t * d) for r, d in ((1, 6), (1.47, 9), (2.09, 12), (2.76, 16)))
    click = rng.standard_normal(n) * np.exp(-t * 400)
    return (s * 0.3 + click * 0.4)


def gong(dur=3.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in ((73, 0.8), (110, 1.1), (164.8, 1.5), (231, 2.0)))
    return np.tanh(s * 0.6)


# 都節音階（D Eb G A Bb）
scale = [146.83, 155.56, 196.0, 220.0, 233.08, 293.66, 311.13, 392.0, 440.0, 466.16, 587.33]

# ── S1 導入 0–4s：ドローン＋風＋単発の太鼓、琴の間
place(drone(73.42, 8.5), 0.0, 1.0)
place(noise_sweep(4.0, 300, 900, decay=3.0), 0.0, 0.08, -0.3)
place(taiko(1.4), 0.05, 0.9)
for t, k in ((1.2, 5), (2.0, 7), (2.6, 6), (3.3, 4)):
    place(koto(scale[k]), t, 0.35, 0.3)
place(fue(587.33, 2.6), 1.4, 0.8, -0.1)

# ── S2 美 4–8s：琴のアルペジオ＋笛の旋律
arp = [5, 7, 8, 9, 7, 8, 10, 9]
for i, k in enumerate(arp):
    place(koto(scale[k], 2.0), 4.0 + i * 0.45, 0.32, (-1) ** i * 0.4)
for t, f, d in ((4.2, 440.0, 1.3), (5.6, 466.16, 0.8), (6.5, 392.0, 1.4)):
    place(fue(f, d), t, 0.85, -0.1)
place(taiko(1.2), 4.0, 0.55)

# ── S3 武 8–12.5s：加速する太鼓＋斬撃・弓SE
beats = [8.0, 8.5, 9.0, 9.4, 9.8, 10.15, 10.5, 10.8, 11.1, 11.35, 11.6, 11.8, 12.0, 12.15, 12.3]
for i, t in enumerate(beats):
    place(taiko(1.0 if i % 2 == 0 else 0.8), t, 0.75, (-1) ** i * 0.2)
    place(shime(), t + 0.25 if t + 0.25 < 12.4 else t, 0.25, 0.4)
place(noise_sweep(0.6, 400, 6000, 0.12), 8.25, 0.9, 0.6)  # 斬撃1
place(noise_sweep(0.6, 6000, 500, 0.12), 9.6, 0.8, -0.6)  # 斬撃2
place(koto(98.0, 1.0), 10.55, 0.9, 0.0)  # 弓弦のしなり
place(noise_sweep(0.5, 3000, 800, 0.08), 10.7, 0.8, 0.5)  # 矢の風切り
place(drone(146.83, 4.6), 8.0, 0.6)

# ── S4 対比 12.5–15s：大太鼓＋上昇音
place(taiko(1.6), 12.5, 1.0)
place(gong(2.5), 12.5, 0.5)
place(noise_sweep(2.3, 200, 5000, 1.5), 12.7, 0.25)
place(fue(880.0, 1.8), 13.0, 0.5, 0.2)

# ── S5/S6 企画プレゼン 15–25.5s：一定のビート＋琴のオスティナート
bpm_t = np.arange(15.0, 25.5, 0.5)
for i, t in enumerate(bpm_t):
    place(taiko(1.1 if i % 4 == 0 else 0.85), t, 0.6 if i % 4 == 0 else 0.35)
    if i % 2 == 1:
        place(shime(), t, 0.22, 0.3)
ost = [0, 2, 3, 5, 3, 2]
for i, t in enumerate(np.arange(15.0, 25.5, 0.25)):
    place(koto(scale[ost[i % len(ost)] + (5 if (i // 12) % 2 else 0)], 1.2), t, 0.16, (-1) ** i * 0.5)
place(drone(73.42, 10.8), 15.0, 0.8)
for t in (15.3, 18.0, 21.2, 22.4, 23.6):
    place(taiko(1.4), t, 0.7)  # 情報カード出現のアクセント

# ── S7 納刀 25.5–27.5s：静寂＋笛＋カチン
place(fue(587.33, 1.8), 25.6, 0.7)
place(noise_sweep(0.9, 1500, 300, 0.4), 26.1, 0.35, 0.3)  # 鞘走り
place(metal_ping(), 27.15, 0.6)

# ── S8 エンドカード 27.5–30s：大太鼓＋銅鑼
place(taiko(1.8), 27.5, 1.0)
place(gong(2.6), 27.5, 0.8)
place(koto(146.83, 2.4), 27.55, 0.5)
place(koto(220.0, 2.4), 27.6, 0.4)
place(koto(293.66, 2.4), 27.65, 0.35)

# ── 簡易リバーブ（指数減衰ノイズIRをFFT畳み込み）
ir_n = int(SR * 1.8)
ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR / 0.45)[:, None]
ir[0] = 0
wet = np.zeros_like(mix)
L = N + ir_n
nfft = 1 << int(np.ceil(np.log2(L)))
for ch in range(2):
    w = np.fft.irfft(np.fft.rfft(mix[:, ch], nfft) * np.fft.rfft(ir[:, ch], nfft), nfft)[:N]
    wet[:, ch] = w
wet /= np.max(np.abs(wet)) + 1e-9
out = mix / (np.max(np.abs(mix)) + 1e-9) + wet * 0.22
# 最後の0.6秒でフェードアウト
fade = int(SR * 0.6)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = np.tanh(out * 1.1)
out /= np.max(np.abs(out)) + 1e-9
out *= 0.89

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'public', 'audio'), exist_ok=True)
path = os.path.join(os.path.dirname(__file__), '..', 'public', 'audio', 'bgm.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
print('wrote', path)
