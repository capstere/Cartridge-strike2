"""Measure the ringing in a private FFmpeg decode of the original V6 stereo track."""
import argparse
import hashlib
import json
import wave
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("wav", type=Path)
args = parser.parse_args()
with wave.open(str(args.wav), "rb") as source:
    rate = source.getframerate()
    assert source.getsampwidth() == 2 and source.getnchannels() == 2
    frames = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").reshape(-1, 2)
signal = frames.mean(axis=1) / 32768
window = np.hanning(round(rate * 0.1))
bins = np.fft.rfftfreq(len(window), 1 / rate)
band = (bins >= 3000) & (bins <= 3200)
background = (bins >= 2800) & (bins <= 3500) & ~band
rows = []
for t in [0.9, 1.0, 1.2, 1.6, 1.9, 2.2, 2.5, 2.8, 3.1, 3.4]:
    start = round(t * rate)
    fft = np.abs(np.fft.rfft(signal[start:start + len(window)] * window))
    peak = np.flatnonzero(band)[np.argmax(fft[band])]
    left, center, right = np.log(fft[peak - 1:peak + 2])
    offset = 0.5 * (left - right) / (left - 2 * center + right)
    rows.append({
        "startSeconds": t,
        "frequencyHz": round(float(bins[peak] + offset * rate / len(window)), 2),
        "amplitudeDbFS": round(float(20 * np.log10(fft[peak] / (window.sum() / 2))), 2),
        "aboveAdjacentMedianDb": round(float(20 * np.log10(fft[peak] / np.median(fft[background]))), 2),
    })
print(json.dumps({"source": "V6", "wavSha256": hashlib.sha256(args.wav.read_bytes()).hexdigest(),
    "sourceMovieSha256": "ed62d04c77c90d5b3a18e3101a8e8cc0575951f4b3261c237a06c1d038260f2e",
    "sampleRateHz": rate, "windowSeconds": 0.1, "rows": rows}, indent=2))
