# Отделение голоса от музыки моделью UVR MDX-Net (ONNX): vocals = model(mix), instrumental = mix - vocals
# python3 separate.py UVR-MDX-NET-Voc_FT.onnx track.mp3 out/track  →  out/track_vocals.wav, out/track_instrumental.wav
import sys, time, numpy as np, librosa, onnxruntime as ort
from scipy.io import wavfile
model_path, src, out_prefix = sys.argv[1:4]
N_FFT, HOP, DIM_F, DIM_T = 7680, 1024, 3072, 256
mix, sr = librosa.load(src, sr=44100, mono=False)
n = mix.shape[1]
chunk = HOP * (DIM_T - 1); trim = N_FFT // 2; gen = chunk - 2 * trim
pad = gen - n % gen
mp = np.concatenate([np.zeros((2, trim)), mix, np.zeros((2, pad)), np.zeros((2, trim))], 1)
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(model_path, so, providers=['CPUExecutionProvider'])
def stft(x):  # x [2, chunk] -> [1,4,DIM_F,DIM_T]
    S = np.stack([librosa.stft(x[c], n_fft=N_FFT, hop_length=HOP, window='hann', center=True, pad_mode='reflect') for c in range(2)])
    S = S[:, :DIM_F]
    return np.stack([S[0].real, S[0].imag, S[1].real, S[1].imag])[None].astype(np.float32)
def istft(y):  # [1,4,DIM_F,DIM_T] -> [2, chunk]
    y = y[0]; bins = N_FFT // 2 + 1
    out = []
    for c in range(2):
        Z = np.zeros((bins, DIM_T), np.complex64)
        Z[:DIM_F] = y[2*c] + 1j * y[2*c+1]
        out.append(librosa.istft(Z, hop_length=HOP, n_fft=N_FFT, window='hann', center=True, length=chunk))
    return np.stack(out)
voc = []
t0 = time.time()
starts = list(range(0, n + pad, gen))
for k, i in enumerate(starts):
    w = mp[:, i:i + chunk]
    spec = stft(w)
    a = sess.run(None, {'input': spec})[0]
    b = sess.run(None, {'input': -spec})[0]      # denoise trick
    y = istft((a - b) / 2)[:, trim:-trim]
    voc.append(y)
    if k % 5 == 0: print(f'chunk {k+1}/{len(starts)}  {time.time()-t0:.0f}s', flush=True)
voc = np.concatenate(voc, 1)[:, :n] * 1.021
inst = mix - voc
for name, x in [('vocals', voc), ('instrumental', inst)]:
    wavfile.write(f'{out_prefix}_{name}.wav', sr, (np.clip(x, -1, 1).T * 32767).astype(np.int16))
print('rms mix/voc/inst dB', [round(20*np.log10(np.sqrt(np.mean(x**2))), 1) for x in (mix, voc, inst)])
