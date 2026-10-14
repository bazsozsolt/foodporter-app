"""Generates public/sounds/beep-beep.wav: our own synthesized cartoon "beep-beep" (two rising chirps). No third-party audio."""
import math, struct, wave
SR = 44100
def chirp(f0, f1, dur=0.17):
    out, ph = [], 0.0
    for i in range(int(SR * dur)):
        t = i / SR
        f = f0 * (f1 / f0) ** min(t / 0.11, 1)
        ph += 2 * math.pi * f / SR
        env = min(t / 0.012, 1) * (1 if t < 0.12 else max(0, 1 - (t - 0.12) / 0.05))
        sq = 1 if math.sin(ph) >= 0 else -1
        tri = 2 / math.pi * math.asin(math.sin(ph))
        out.append(env * (0.25 * sq + 0.55 * tri))
    return out
s = chirp(740, 1180) + [0.0] * int(SR * 0.05) + chirp(880, 1480) + [0.0] * int(SR * 0.05)
with wave.open("public/sounds/beep-beep.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 30000)) for x in s))
