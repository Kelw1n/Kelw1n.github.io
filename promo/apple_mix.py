"""Версия ролика под чужой трек (инструментал ролика Apple, 92.45 BPM, F# minor).

Склейка трека по сильным долям + карта времени «таймлайн promo.html → готовый звук»,
чтобы переходы ролика попадали в доли, паузы и дропы музыки.
  python3 apple_mix.py <instrumental.wav>  →  out/audio_apple.wav, out/warp.json
Инструментал получен разделением трека моделью MDX-Net (голос диктора убран).
"""
import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

import audio as A

T = 0.64902                       # длительность доли, с
DROP, FINAL = 146.7225, 170.0825  # дроп и финальный удар (по транзиентам)
# куски трека: (начало, конец) в секундах исходника
SEGMENTS = [
    (11.948, 14.665 + T),         # стабы вступления → 2-я доля грува
    (139.5842, 164.8943),         # грув → пауза → дроп → пауза → … до такта d+28
    (159.7047, 173.0),            # повтор двух тактов (d+20…d+28) → финальный удар → хвост
]
XF = 0.030                        # кроссфейд на склейке, с


def build_music(src):
    sr, x = wavfile.read(src)
    x = x.astype(np.float64).T / 32768.0
    x = signal.resample_poly(x, A.SR, sr, axis=1)
    out, starts = [], []
    pos = 0.0
    xf = int(XF * A.SR); pre = int(.005 * A.SR)
    for a, b in SEGMENTS:
        i0, i1 = int(round(a * A.SR)) - xf - pre, int(round(b * A.SR)) - pre
        seg = x[:, max(0, i0):i1].copy()
        starts.append(pos)
        if out:
            # equal-power: хвост предыдущего куска гаснет, новый кусок проявляется
            k = np.linspace(0, 1, xf)
            prev = out[-1]
            prev[:, -xf:] = prev[:, -xf:] * np.cos(k * np.pi / 2) + seg[:, :xf] * np.sin(k * np.pi / 2)
            seg = seg[:, xf:]
        else:
            seg = seg[:, xf + pre:]
        out.append(seg)
        pos += b - a
    music = np.concatenate(out, axis=1)
    return music, starts


def main(src):
    music, starts = build_music(src)
    o = lambda m, seg: starts[seg] + (m - SEGMENTS[seg][0])
    # опорные точки: момент таймлайна promo.html → доля трека
    anchors = [
        (0.0, 0.0),
        (2.0, o(14.6612, 0)),                 # лоадер уехал, герой ↔ сильная доля грува
        (7.87, o(DROP - 3 * T, 1)),           # вжух влево
        (10.0, o(DROP, 1)),                   # пауза → звезда → удар STRAIN на дроп
        (13.475, o(DROP + 5 * T, 1)),         # листания карусели — через каждые 2 доли
        (14.975, o(DROP + 7 * T, 1)),
        (16.475, o(DROP + 9 * T, 1)),
        (17.975, o(DROP + 11 * T, 1)),
        (19.9, o(DROP + 14 * T, 1)),          # вторая пауза → круг Butterfly на возврат грува
        (26.0, o(DROP + 24 * T, 1)),          # плиты → навыки на сильную долю
        (30.05, starts[2] + 3 * T),           # зум в «Сайты»
        (33.96, starts[2] + 9 * T),           # вертикальный вжух
        (37.92, o(FINAL, 2)),                 # логотип на финальный удар
    ]
    anchors.append((41.0, anchors[-1][1] + 41.0 - 37.92))
    dur = anchors[-1][1]
    vt, ot = np.array(anchors).T
    for (v0, o0), (v1, o1) in zip(anchors, anchors[1:]):
        print(f'  ролик {v0:6.2f}–{v1:6.2f} → {o0:6.3f}–{o1:6.3f}   скорость ×{(v1 - v0) / (o1 - o0):.3f}')
    with open(os.path.join(A.OUT, 'warp.json'), 'w') as f:
        json.dump({'duration': dur, 'video': vt.tolist(), 'out': ot.tolist()}, f, indent=1)

    A.init(dur)
    A.WARP = lambda t: float(np.interp(t, vt, ot))
    A.APPLE = True
    A.place_sfx()
    n = min(music.shape[1], A.N)
    A.music[:, :n] = music[:, :n]
    A.master(os.path.join(A.OUT, 'audio_apple.wav'), music_gain=.82, sfx_gain=.42, verb_gain=.2)
    print(f'длительность {dur:.3f} c')


if __name__ == '__main__':
    main(sys.argv[1])
