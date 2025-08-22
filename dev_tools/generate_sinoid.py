#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, csv, math, wave, struct
from typing import List, Dict, Tuple, Optional

SR = 48000  # sample rate

# ---------- small helpers ----------

def hann(n: int, N: int) -> float:
    return 0.5 * (1 - math.cos(2 * math.pi * n / (N - 1))) if N > 1 else 1.0

def write_wav_mono16(path: str, samples: List[float], sr: int = SR) -> None:
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s)) * 32767.0)
        frames += struct.pack('<h', v)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(sr)
        w.writeframes(frames)

# ---------- continuous F0 synth (as before) ----------

def generate_continuous(cfg: Dict) -> List[float]:
    """Existing continuous F0 patterns (T1/T2/T3/T4/STEP/GLIDE + vibrato/harmonics)."""
    dur = cfg.get("durMs", 600) / 1000.0
    N = max(1, int(SR * dur))
    f0 = [0.0] * N

    typ = cfg["type"]

    if typ == "T1":
        for i in range(N):
            f0[i] = float(cfg["f0"])
    elif typ == "T2":
        f0s, f0e = float(cfg["f0Start"]), float(cfg["f0End"])
        for i in range(N):
            a = i / (N - 1) if N > 1 else 0.0
            f0[i] = f0s + (f0e - f0s) * a
    elif typ == "T3":
        split = int(cfg.get("split", 0.6) * N)
        f0A, f0B, f0E = float(cfg["f0A"]), float(cfg["f0B"]), float(cfg["f0End"])
        for i in range(N):
            if i < split:
                a = i / max(1, split - 1)
                f0[i] = f0A + (f0B - f0A) * a
            else:
                rem = N - split
                a = (i - split) / max(1, rem - 1)
                f0[i] = f0B + (f0E - f0B) * a
    elif typ == "T4":
        f0s, f0e = float(cfg["f0Start"]), float(cfg["f0End"])
        for i in range(N):
            a = i / (N - 1) if N > 1 else 0.0
            f0[i] = f0s + (f0e - f0s) * a
    elif typ == "STEP":
        split = int(cfg.get("split", 0.5) * N)
        f0A, f0B = float(cfg["f0A"]), float(cfg["f0B"])
        for i in range(N):
            f0[i] = f0A if i < split else f0B
    elif typ == "GLIDE":
        f0s, f0e = float(cfg["f0Start"]), float(cfg["f0End"])
        for i in range(N):
            a = i / (N - 1) if N > 1 else 0.0
            # cubic smoothstep
            s = a * a * (3 - 2 * a)
            f0[i] = f0s + (f0e - f0s) * s
    else:
        for i in range(N):
            f0[i] = 220.0

    vib_hz = cfg.get("vibratoHz", None)
    vib_depth = cfg.get("vibratoDepth", None)
    if vib_hz and vib_depth:
        vhz, vdp = float(vib_hz), float(vib_depth)
        for i in range(N):
            t = i / SR
            f0[i] *= (1.0 + vdp * math.sin(2 * math.pi * vhz * t))

    # Integrate frequency → phase and synthesize sine (+ optional harmonics)
    samples = [0.0] * N
    phase = 0.0
    harmonics = int(cfg.get("harmonics", 0))

    for i in range(N):
        phase += (2 * math.pi * f0[i]) / SR
        s = math.sin(phase)
        if harmonics > 0:
            for k in range(2, harmonics + 1):
                s += (1.0 / (k * k)) * math.sin(k * phase)
            s /= (1.0 + 0.2)
        samples[i] = s

    # short fade-in/out (~10 ms) to avoid clicks in continuous tones
    fade = max(1, int(0.01 * SR))
    for i in range(min(fade, N)):
        w = hann(i, fade)
        samples[i] *= w
        samples[-1 - i] *= w

    # normalize to ~0.6 peak
    peak = max(1e-9, max(abs(x) for x in samples))
    scale = 0.6 / peak
    return [x * scale for x in samples]

# ---------- NEW: segment engine for timing tests ----------

Segment = Tuple[int, Optional[float]]  # (duration_ms, hz or None for silence)

def generate_segments(segments: List[Segment], add_clicks: bool = False) -> List[float]:
    """
    Build a waveform from timed segments. Each segment is (duration_ms, f_hz or None for silence).
    If add_clicks=True, put a 1-sample marker (small spike) at each boundary to make timing obvious.
    """
    out: List[float] = []
    last_was_tone = False
    phase = 0.0

    for si, (dur_ms, hz) in enumerate(segments):
        n = max(1, int(SR * (dur_ms / 1000.0)))

        # Optional boundary click (tiny, but visible in waveform/spectrogram)
        if add_clicks and out:
            out[-1] = 0.95  # single-sample spike

        if hz is None or hz <= 0.0:
            # silence
            out.extend([0.0] * n)
            last_was_tone = False
            continue

        # tone segment – hard step by design (no crossfade)
        for i in range(n):
            phase += (2 * math.pi * hz) / SR
            out.append(math.sin(phase))
        last_was_tone = True

    # global normalization to ~0.6 peak
    peak = max(1e-9, max(abs(x) for x in out))
    scale = 0.6 / peak
    return [x * scale for x in out]

# ---------- presets ----------

CONT_PRESETS = [
    { "id":"sinoid-t1",      "type":"T1",   "durMs":600, "f0":220 },
    { "id":"sinoid-t2",      "type":"T2",   "durMs":600, "f0Start":180, "f0End":280 },
    { "id":"sinoid-t3",      "type":"T3",   "durMs":650, "f0A":260, "f0B":160, "f0End":230, "split":0.6 },
    { "id":"sinoid-t4",      "type":"T4",   "durMs":600, "f0Start":280, "f0End":150 },
    { "id":"sinoid-t2-vib",  "type":"T2",   "durMs":700, "f0Start":180, "f0End":280, "vibratoHz":5, "vibratoDepth":0.03 },
    { "id":"sinoid-step",    "type":"STEP", "durMs":600, "f0A":200, "f0B":260, "split":0.5 },
    { "id":"sinoid-t4-rich", "type":"T4",   "durMs":600, "f0Start":280, "f0End":150, "harmonics":4 }
]

# Timing fixtures (clear steps + initial/final silence).
SEG_PRESETS = [
    {
        "id": "sinoid-steps-250",
        "desc": "250 ms steps: 500 ms silence, then 220↔440 Hz swaps every 250 ms, then 500 ms silence",
        "segments": [
            (500, None),
            (250, 220), (250, 440), (250, 220), (250, 440),
            (500, None)
        ],
        "clicks": False
    },
    {
        "id": "sinoid-steps-250-clicks",
        "desc": "Same as 250, with boundary clicks for timing markers",
        "segments": [
            (500, None),
            (250, 220), (250, 440), (250, 220), (250, 440),
            (500, None)
        ],
        "clicks": True
    },
    {
        "id": "sinoid-steps-500",
        "desc": "500 ms steps: 500 ms silence, 220→440→220 Hz, each 500 ms, then 500 ms silence",
        "segments": [
            (500, None),
            (500, 220), (500, 440), (500, 220),
            (500, None)
        ],
        "clicks": False
    },
    {
        "id": "sinoid-staircase",
        "desc": "250 ms staircase: 200→240→280→320→360→400→360→...→200 Hz",
        "segments": (
            [(250, f) for f in (200,240,280,320,360,400,360,320,280,240,200)]
        ),
        "clicks": False
    },
    {
        "id": "sinoid-pulse-train",
        "desc": "Pulse train at 4 Hz: (200 ms tone @ 300 Hz + 50 ms silence) × 8 after 300 ms silence",
        "segments": (
            [(300, None)] +
            sum([[(200, 300), (50, None)] for _ in range(8)], [])
        ),
        "clicks": False
    }
]

# Artificial vocabulary rows for the CSV
VOCAB_BASE = [
    ("sinoid-t1","siːnɔɪd tiː wʌn","Flat tone, steady pitch like a calm horizon"),
    ("sinoid-t2","siːnɔɪd tiː tuː","Rising tone, steadily climbing like a question"),
    ("sinoid-t3","siːnɔɪd tiː θriː","Dipping tone, falls then rises like a swing"),
    ("sinoid-t4","siːnɔɪd tiː fɔːr","Falling tone, dropping sharply like a command"),
    ("sinoid-t2-vib","siːnɔɪd tiː tuː vɪb","Rising tone with vibrato shimmer"),
    ("sinoid-step","siːnɔɪd stɛp","Step tone, jumps to a higher register halfway"),
    ("sinoid-t4-rich","siːnɔɪd tiː fɔːr rɪʧ","Falling tone with added harmonics (overtone-rich)")
]

VOCAB_TIMING = [
    ("sinoid-steps-250","siːnɔɪd stɛps tuː fɪfti","250 ms steps: 500 ms silence, then 220↔440 Hz swaps every 250 ms, then 500 ms silence"),
    ("sinoid-steps-250-clicks","siːnɔɪd stɛps tuː fɪfti klɪks","250 ms steps with boundary clicks for timing markers"),
    ("sinoid-steps-500","siːnɔɪd stɛps faɪv hʌndrəd","500 ms steps: 500 ms silence, 220→440→220 Hz, each 500 ms, then 500 ms silence"),
    ("sinoid-staircase","siːnɔɪd stɛəkeɪs","250 ms staircase: 200→240→280→320→360→400→360→...→200 Hz"),
    ("sinoid-pulse-train","siːnɔɪd pʌls treɪn","Pulse train at 4 Hz: (200 ms tone @ 300 Hz + 50 ms silence) × 8 after 300 ms silence")
]

def main():
    locale_dir = os.path.join("data", "recordings", "xx-COOL")  # invented locale
    os.makedirs(locale_dir, exist_ok=True)

    # 1) continuous presets
    for cfg in CONT_PRESETS:
        path = os.path.join(locale_dir, f"{cfg['id']}.wav")
        samples = generate_continuous(cfg)
        write_wav_mono16(path, samples, SR)
        print("Wrote", path)

    # 2) timing/segment presets
    for scfg in SEG_PRESETS:
        path = os.path.join(locale_dir, f"{scfg['id']}.wav")
        samples = generate_segments(scfg["segments"], add_clicks=scfg.get("clicks", False))
        write_wav_mono16(path, samples, SR)
        print("Wrote", path)

    # 3) vocabulary CSV
    csv_path = os.path.join("data", "artificial.csv")
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["hanzi","pinyin","english"])
        for row in VOCAB_BASE:
            w.writerow(row)
        # map the file ids to short "words" in the CSV so you can pick them in your app
        # (use simple names that correspond to the timing files)
        timing_rows = VOCAB_TIMING
        for row in timing_rows:
            w.writerow(row)
    print("Wrote", csv_path)

if __name__ == "__main__":
    main()