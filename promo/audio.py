"""Синтез саундтрека для промо-ролика: музыка 120 BPM + вжухи/удары/щелчки.
Все тайминги совпадают с таймлайном promo.html.  Запуск: python3 audio.py → out/audio.wav
Как библиотека (apple_mix.py): init(dur), WARP — перенос времени эффектов, place_sfx(), master().
"""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
STEP = 0.125  # 1/16 при 120 BPM
rng = np.random.default_rng(11)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
WARP = lambda t: t   # время таймлайна promo.html → время готового звука
APPLE = False        # режим «эффекты поверх чужого трека»: без райзеров, тише удары, ноты в F# minor


def init(dur):
    global DUR, N, music, sfx, verb
    DUR = dur; N = int(SR * DUR)
    music = np.zeros((2, N)); sfx = np.zeros((2, N)); verb = np.zeros((2, N))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def noise(n):
    return rng.standard_normal(n)


def pan_gains(p):
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def add(bus, x, t0, gain=1.0, pan=0.0):
    """Кладёт моно/стерео сигнал в шину; pan — число или массив по времени."""
    i0 = int(round(t0 * SR))
    if x.ndim == 1:
        gl, gr = pan_gains(pan)
        x = np.vstack([x * gl, x * gr])
    if i0 < 0:
        x = x[:, -i0:]; i0 = 0
    n = min(x.shape[1], N - i0)
    if n <= 0:
        return
    bus[:, i0:i0 + n] += x[:, :n] * gain


def norm(x):
    m = np.max(np.abs(x))
    return x / m if m > 0 else x


def shaped_noise(n, fc, bw):
    """Шум с плавающей полосой: fc (Гц) и bw (октавы) — массивы по времени."""
    win, hop = 1024, 256
    src = noise(n + win)
    out = np.zeros(n + win)
    w = np.hanning(win)
    fr = np.maximum(np.fft.rfftfreq(win, 1 / SR), 1.0)
    for i in range(0, n, hop):
        j = min(i + win // 2, n - 1)
        mask = np.exp(-0.5 * (np.log2(fr / fc[j]) / bw[j]) ** 2)
        out[i:i + win] += np.fft.irfft(np.fft.rfft(src[i:i + win] * w) * mask) * w
    return out[:n]


# ------------------------------------------------------------------ SFX
def whoosh(t0, dur, gain=1.0, pan=(-.7, .7), f=(250, 2600, 450), bw=1.1, peak=.58, body=.6):
    t0 = WARP(t0 + dur * peak) - dur * peak   # пик вжуха — на пик движения
    n = int(dur * SR); x = np.linspace(0, 1, n)
    e = np.where(x < peak, (x / peak) ** 2.4, ((1 - x) / (1 - peak)) ** 1.7)
    fc = np.where(x < peak, f[0] * (f[1] / f[0]) ** (x / peak), f[1] * (f[2] / f[1]) ** ((x - peak) / (1 - peak)))
    s = norm(shaped_noise(n, fc, np.full(n, bw))) * e
    lo = norm(filt(noise(n), 'lowpass', 220)) * e ** 1.4
    y = norm(s + body * lo)
    p = np.linspace(pan[0], pan[1], n)
    add(sfx, y, t0, gain, p)
    add(verb, y, t0, gain * .18, p)


def zoom_whoosh(t0, dur, gain=1.0, rise=True):
    f = (300, 5200, 4000) if rise else (4000, 900, 160)
    whoosh(t0, dur, gain, (0, 0), f, bw=.8, peak=.82 if rise else .25, body=.8)


def impact(t0, gain=1.0, big=True):
    t0 = WARP(t0)
    n = int(2.6 * SR); tt = np.arange(n) / SR
    f = 34 + 70 * np.exp(-tt * 16)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * (2.0 if big else 4.5))
    knock = norm(filt(noise(n), 'lowpass', 1800)) * np.exp(-tt * 16)
    crack = norm(filt(noise(n), 'highpass', 2500)) * np.exp(-tt * 45)
    y = np.tanh(1.5 * (sub + .45 * knock + .25 * crack))
    add(sfx, y, t0, gain)
    add(verb, y, t0, gain * .35)
    if big:
        cr = norm(filt(noise(n), 'bandpass', [5000, 14000])) * np.exp(-tt * 2.1)
        add(sfx, np.vstack([cr, np.roll(cr, 90)]), t0, gain * .22)
        add(verb, cr, t0, gain * .12)


def pop(t0, f=900, gain=.4, pan=0.0, dur=.12, glide=.6):
    t0 = WARP(t0)
    n = int(dur * SR); tt = np.arange(n) / SR
    fr = f * (1 + glide * np.exp(-tt * 70))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 38)
    y += .25 * norm(filt(noise(n), 'highpass', 3000)) * np.exp(-tt * 400)
    add(sfx, y, t0, gain, pan)
    add(verb, y, t0, gain * .25, pan)


def boing(t0, f, gain=.3, pan=0.0):
    t0 = WARP(t0)
    n = int(.32 * SR); tt = np.arange(n) / SR
    fr = f * (1 - .35 * np.exp(-tt * 30)) * (1 + .03 * np.sin(2 * np.pi * 22 * tt))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 12) * (1 - np.exp(-tt * 600))
    add(sfx, y, t0, gain, pan)
    add(verb, y, t0, gain * .3, pan)


def click(t0, gain=.35, f=3800, pan=0.0):
    t0 = WARP(t0)
    n = int(.03 * SR); tt = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 260) + .6 * norm(filt(noise(n), 'highpass', 4000)) * np.exp(-tt * 900)
    add(sfx, y, t0, gain, pan)


def chime(t0, notes=(88, 95), gain=.3, gap=.085):
    for k, m in enumerate(notes):
        n = int(1.6 * SR); tt = np.arange(n) / SR; f0 = mtof(m)
        y = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt * d) for r, a, d in [(1, 1, 3.2), (2.0, .35, 5), (2.76, .22, 7), (5.4, .08, 11)])
        y *= 1 - np.exp(-tt * 900)
        add(sfx, y, WARP(t0 + k * gap), gain, -.25 + .5 * k)
        add(verb, y, WARP(t0 + k * gap), gain * .5, -.25 + .5 * k)


def riser(t0, t1, gain=.5, f=(350, 7000)):
    t0, t1 = WARP(t0), WARP(t1)
    n = int((t1 - t0) * SR); x = np.linspace(0, 1, n)
    fc = f[0] * (f[1] / f[0]) ** x
    s = norm(shaped_noise(n, fc, np.full(n, .7))) * x ** 2.6
    tt = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(220 * 4 ** x * (1 + .01 * np.sin(2 * np.pi * 6 * tt))) / SR) * x ** 3 * .25
    y = s + tone
    y[-int(.012 * SR):] *= np.linspace(1, 0, int(.012 * SR))
    add(sfx, y, t0, gain, np.sin(np.linspace(0, 6 * np.pi, n)) * .3)
    add(verb, y, t0, gain * .3)


def shimmer(t0, gain=.18, base=84, minor=False):
    for k, m in enumerate([0, 3, 7, 12, 15, 19] if minor else [0, 4, 7, 12, 16, 19]):
        pop(t0 + k * .035, mtof(base + m), gain * (1 - k * .08), pan=-.6 + k * .24, dur=.25, glide=.02)


def scan_sweep(t0, gain=.08):
    t0 = WARP(t0)
    n = int(.9 * SR); x = np.linspace(0, 1, n); tt = np.arange(n) / SR
    fr = 600 + 900 * x
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * x) ** 2
    add(sfx, y, t0, gain)
    add(verb, y, t0, gain * .4)


def wind(t0, dur, gain=.12):
    t0 = WARP(t0)
    n = int(dur * SR); x = np.linspace(0, 1, n)
    e = np.sin(np.pi * x) ** 1.5
    y = norm(shaped_noise(n, 500 + 1600 * e, np.full(n, 1.3))) * e
    add(sfx, y, t0, gain, np.linspace(-.3, .3, n))


# ------------------------------------------------------------------ MUSIC
def kick(vel=1.0):
    n = int(.5 * SR); tt = np.arange(n) / SR
    f = 46 + 110 * np.exp(-tt * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7)
    c = norm(filt(noise(n), 'highpass', 1500)) * np.exp(-tt * 350) * .25
    return np.tanh(1.7 * (s + c)) * vel


def clap(vel=1.0):
    n = int(.4 * SR); tt = np.arange(n) / SR
    nz = norm(filt(noise(n), 'bandpass', [900, 3200]))
    e = np.zeros(n)
    for d in (0, .011, .022, .031):
        m = tt >= d; e[m] += np.exp(-(tt[m] - d) * (180 if d < .03 else 20))
    return nz * e * .5 * vel


def hat(vel=1.0, open_=False):
    n = int((.35 if open_ else .08) * SR); tt = np.arange(n) / SR
    nz = norm(filt(noise(n), 'highpass', 7500, 4))
    return nz * np.exp(-tt * (13 if open_ else 85)) * vel


def pluck(m, vel=1.0, dur=.5):
    n = int(dur * SR); tt = np.arange(n) / SR; f0 = mtof(m)
    y = sum((1 / k) * np.sin(2 * np.pi * f0 * k * tt) * np.exp(-tt * (7 + 5 * k)) for k in range(1, 11) if f0 * k < 12000)
    return y * (1 - np.exp(-tt * 1500)) * vel


def bassnote(m, dur=.22, vel=1.0):
    n = int((dur + .05) * SR); tt = np.arange(n) / SR; f0 = mtof(m)
    y = np.sin(2 * np.pi * f0 * tt) + .35 * np.sin(4 * np.pi * f0 * tt) + .12 * np.sin(6 * np.pi * f0 * tt)
    e = np.minimum(1, tt / .006) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) * 60)) * np.exp(-tt * 3)
    return np.tanh(1.4 * y * e) * vel


CHORDS = [  # F – Am – Dm – B♭, по такту (2 c)
    dict(pad=[53, 57, 60, 64, 67], root=41, arp=[65, 69, 72, 76, 79]),
    dict(pad=[52, 57, 60, 64, 67], root=45, arp=[64, 67, 69, 72, 76]),
    dict(pad=[50, 57, 60, 64, 65], root=38, arp=[62, 65, 69, 72, 74]),
    dict(pad=[50, 53, 57, 58, 62], root=34, arp=[62, 65, 69, 70, 74]),
]
FINAL_T = 37.92
SECTIONS = [
    (0.0, 2.0, 'pad'),
    (2.0, 9.5, 'pad kick clap hat8 bass'),
    (9.5, 10.0, 'pad roll'),
    (10.0, 19.5, 'pad kick clap hat8 hat16 ohat bass arp'),
    (19.5, 20.0, 'pad'),
    (20.0, 22.0, 'pad hat8 arp'),
    (22.0, 25.4, 'pad kick clap hat8 bass arp'),
    (25.4, 26.0, 'pad roll'),
    (26.0, 33.6, 'pad kick clap hat8 hat16 ohat bass arp'),
    (33.6, 34.0, 'pad'),
    (34.0, 37.3, 'pad kick clap hat8 bass arp'),
    (37.3, FINAL_T, 'pad'),
]


def flags(t):
    for a, b, f in SECTIONS:
        if a <= t < b:
            return set(f.split())
    return set()


def build_music():
    global music
    ARP_PAT = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 3, 1, 3, 2, 4]
    drums = np.zeros((2, N)); bass = np.zeros((2, N)); arp = np.zeros((2, N))
    kicks = []
    for s in range(int(DUR / STEP)):
        t = s * STEP; fl = flags(t); ch = CHORDS[int(t // 2) % 4]; q = s % 4; beat = (s // 4) % 4
        if 'kick' in fl and q == 0:
            add(drums, kick(), t, .9); kicks.append(t)
        if 'clap' in fl and q == 0 and beat in (1, 3):
            c = clap(); add(drums, c, t, .55); add(verb, c, t, .25)
        if 'hat8' in fl and q == 2 and 'ohat' not in fl:
            add(drums, hat(), t, .22, .25)
        if 'ohat' in fl and q == 2:
            add(drums, hat(open_=True), t, .16, .3)
        if 'hat16' in fl and q in (1, 3):
            add(drums, hat(.6), t, .14, -.3)
        if 'roll' in fl:
            sec = next(x for x in SECTIONS if x[0] <= t < x[1])
            k = (t - sec[0]) / (sec[1] - sec[0])
            for sub in ([0, .0625] if k > .5 else [0]):
                c = clap(.35 + .65 * k); add(drums, c, t + sub, .5); add(verb, c, t + sub, .2)
        if 'bass' in fl and q == 2:
            add(bass, bassnote(ch['root']), t, .55)
        if 'arp' in fl:
            m = ch['arp'][ARP_PAT[s % 16]]
            v = .9 if q == 0 else .6
            p = pluck(m, v); pn = .35 if s % 2 else -.35
            add(arp, p, t, .16, pn); add(arp, p, t + .375, .07, -pn); add(arp, p, t + .75, .035, pn)
            add(verb, p, t, .07, pn)

    # пэд с плавным «открытием» фильтра
    pad = np.zeros((2, N))
    for b in range(int(np.ceil(FINAL_T / 2))):
        t0 = b * 2.0; ch = CHORDS[b % 4]
        L = min(2.0, FINAL_T - t0)
        n = int((L + .9) * SR); tt = np.arange(n) / SR
        env = np.minimum(1, tt / .35) * np.where(tt < L, 1.0, np.exp(-(tt - L) * 5))
        for m in ch['pad']:
            for det, pn in ((-.08, -.6), (0, 0), (.08, .6)):
                f0 = mtof(m + det)
                ph = (f0 * tt + rng.random()) % 1.0
                add(pad, (2 * ph - 1) * env * .07, t0, 1.0, pn)
    # финальный аккорд
    n = int((DUR - FINAL_T) * SR); tt = np.arange(n) / SR
    env = np.minimum(1, tt / .02) * np.exp(-tt * .9)
    for m in [53, 57, 60, 64, 67, 72]:
        for det, pn in ((-.08, -.6), (0, 0), (.08, .6)):
            ph = (mtof(m + det) * tt + rng.random()) % 1.0
            add(pad, (2 * ph - 1) * env * .075, FINAL_T, 1.0, pn)
    add(bass, np.tanh(1.3 * np.sin(2 * np.pi * mtof(41) * tt)) * np.exp(-tt * 1.2), FINAL_T, .5)
    add(drums, kick(1.1), FINAL_T, 1.0)
    for k, m in enumerate([72, 76, 79, 81, 84, 88]):  # искры под буквы логотипа
        p = pluck(m, .8, .9); add(arp, p, 38.42 + k * .055, .2, -.5 + k * .2); add(verb, p, 38.42 + k * .055, .15)

    dark = np.vstack([filt(pad[0], 'lowpass', 380), filt(pad[1], 'lowpass', 380)])
    bright = np.vstack([filt(pad[0], 'lowpass', 2100), filt(pad[1], 'lowpass', 2100)])
    T = np.arange(N) / SR
    mix = np.clip(T / 2.0, 0, 1) ** 1.5
    mix = np.where((T > 20) & (T < 22), .55 + .45 * ((T - 20) / 2), mix)
    pad = dark * (1 - mix) + bright * mix
    add(verb, pad[0], 0, .25, -.5); add(verb, pad[1], 0, .25, .5)

    # сайдчейн от бочки
    duck = np.ones(N)
    for k in kicks:
        i = int(k * SR); n = min(int(.45 * SR), N - i); tt = np.arange(n) / SR
        duck[i:i + n] *= 1 - .55 * np.exp(-tt / .11)
    music += drums + bass * duck + pad * duck * .9 + arp * duck


# ------------------------------------------------------------------ SFX CUES (= таймлайн promo.html)
def place_sfx():
    ig = .55 if APPLE else 1.0   # поверх трека Apple удары тише: у него свои
    for k in range(6):
        click(.12 + k * .06, .12, 2600 + k * 260, -.5 + k * .2)          # буквы лоадера
    if not APPLE:
        riser(.3, 1.8, .22)
    whoosh(1.62, .78, .75, (0, 0), (180, 2200, 400))                    # лоадер уезжает вверх
    impact(1.99, .55 * ig, big=False)
    whoosh(2.1, .7, .3, (-.6, -.2), (300, 1800, 500))                   # телефоны влетают
    whoosh(2.28, .7, .26, (.7, .3), (350, 2000, 500))
    for k, a in enumerate([2.9, 3.0, 3.1]):
        pop(a, 1400 + 200 * k, .14, -.3 + .3 * k)                       # пузыри
    for k, a in enumerate([3.15, 3.35, 3.55]):
        pop(a, 820 + 120 * k, .32, [-.5, .5, .1][k])                    # чипы
    for k, m in enumerate([66, 69, 71, 73, 76, 78] if APPLE else [72, 74, 76, 79, 81, 84]):
        boing(5.45 + k * .085 + .08, mtof(m), .17, -.5 + k * .2)        # резиновые буквы
    whoosh(7.32, .98, 1.0, (.8, -.8), (180, 3200, 300), peak=.6)        # вжух влево
    impact(8.2, .32 * ig, big=False)
    shimmer(8.45, base=78 if APPLE else 84, minor=APPLE)
    if not APPLE:
        riser(8.55, 9.98, .3)
    zoom_whoosh(9.32, .72, .85)                                          # зум в звезду
    impact(10.0, 1.0 * ig, big=True)                                          # STRAIN
    pop(10.13, 620, .35)
    whoosh(10.2, .55, .22, (-.3, .3), (900, 4000, 1200), bw=.7, body=.1)
    for k in range(4):
        pop(10.95 + k * .08, 1000 + 140 * k, .2, -.45 + .3 * k)
    whoosh(11.42, .72, .7, (0, 0), (220, 2600, 380))                     # заголовок вверх, карусель снизу
    for a in [13.5, 15.0, 16.5, 18.0]:
        whoosh(a - .42, .7, .55, (.7, -.7), (300, 2800, 450), peak=.6)  # листание экранов
    for a in [12.15, 13.62, 15.12, 16.62, 18.12]:
        pop(a, 900, .24, .4)
    whoosh(19.4, .95, .8, (.8, -.1), (200, 2400, 350), peak=.55)        # круг Butterfly
    impact(20.2, .35 * ig, big=False)
    pop(19.97, 760, .3, -.4)
    whoosh(20.12, .6, .26, (0, 0), (300, 1500, 400))
    whoosh(20.6, .7, .34, (.9, .4), (400, 2200, 600))
    scan_sweep(21.0); scan_sweep(21.95)
    for k in range(3):
        pop(22.5 + k * .15, 1300 + 180 * k, .22, -.2 + .2 * k)
    for k in range(3):
        click(23.1 + k * .15, .2, 3000, .2)
    for k, a in enumerate(np.arange(23.1, 24.0, .055)):
        click(a, .05 * (1 - k / 20), 5200, .3)
    chime(24.1, (90, 97) if APPLE else (88, 95), .28)
    whoosh(25.28, .78, .95, (-.8, .8), (200, 3000, 350), peak=.6)       # плиты-вжух
    whoosh(25.92, .6, .5, (-.6, .8), (300, 2600, 500))
    impact(26.02, .4 * ig, big=False)
    for k in range(8):
        pop(26.12 + k * .065 + .05, 700 + 90 * k, .12, -.6 + k * .17)
    for k, a in enumerate(np.concatenate([np.arange(26.65, 28.3, .062), np.arange(27.1, 28.6, .07)])):
        click(a + rng.random() * .02, .045, 1800 + rng.random() * 900, .4 if k % 2 else -.4)
    pop(28.55, 980, .2, .4)
    zoom_whoosh(29.36, .78, .85)                                         # зум в «Сайты»
    impact(30.05, .4 * ig, big=False)
    wind(30.8, .9, .14); wind(32.8, .85, .14)
    click(32.14, .4, 3200, .4)
    whoosh(32.2, .7, .3, (.5, -.3), (2500, 700, 200), bw=.9, peak=.3, body=.3)  # смена темы
    whoosh(33.42, .9, .85, (0, 0), (200, 2600, 380), peak=.6)           # вертикальный вжух
    impact(34.25, .3 * ig, big=False)
    for k in range(3):
        pop(34.88 + k * .12, 820 + 130 * k, .26, -.4 + .4 * k)
    click(36.57, .38, 3000, -.1)
    zoom_whoosh(37.12, .82, .8, rise=True)                               # схлопывание
    impact(FINAL_T, 1.0 * ig, big=True)
    chime(38.9, (78, 85, 90) if APPLE else (84, 91, 96), .2, gap=.07)


# ------------------------------------------------------------------ MASTER
def master(path, music_gain=.62, sfx_gain=.85, verb_gain=.35):
    ir_n = int(2.4 * SR); tt = np.arange(ir_n) / SR
    ir = np.vstack([filt(noise(ir_n), 'lowpass', 6000) * np.exp(-tt * 2.6) for _ in range(2)])
    ir[:, :int(.012 * SR)] = 0
    wet = np.vstack([signal.fftconvolve(verb[c], ir[c])[:N] for c in range(2)])
    wet = wet / np.max(np.abs(wet)) * verb_gain
    mix = music_gain * norm(music) + sfx_gain * norm(sfx) + wet
    mix = np.vstack([filt(mix[c], 'highpass', 28) for c in range(2)])
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    T = np.arange(N) / SR
    fade = np.clip((DUR - T) / .6, 0, 1) ** 1.5
    mix *= fade
    mix = mix / np.max(np.abs(mix)) * .93
    wavfile.write(path, SR, (mix.T * 32767).astype(np.int16))
    print('ok', path, 'rms dBFS', 20 * np.log10(np.sqrt(np.mean(mix ** 2))))


if __name__ == '__main__':
    init(41.0)
    build_music()
    place_sfx()
    master(os.path.join(OUT, 'audio.wav'))
