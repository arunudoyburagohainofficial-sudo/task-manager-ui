#!/usr/bin/env python3
"""
Generates the slide-to-focus confirmation tick.

Committed as a .wav but generated rather than sourced, for the same reason as the notification
chime next door: a binary nobody can regenerate is a binary nobody dares touch. Run:

    python3 scripts/make-slide-sound.py

and it rewrites assets/sounds/foyg_slide.wav in place.

── What it's trying to sound like ──

The tick a phone makes when a fingerprint is accepted. That family is the opposite of the
notification chime, and deliberately so - the chime announces something from across the room,
this one only confirms that the gesture landed:

  - Very short. 130ms, finished before your thumb has left the glass. The push to the session
    screen takes 220ms, so anything longer is still sounding on the next screen.
  - Dry. Barely any room. A tail would make it an event rather than an acknowledgement.
  - High and light, around 1.3-1.5kHz, so it sits above everything else and never feels heavy.
  - A fast upward pitch snap over the first 14ms. That small rise is most of what makes it read
    as "accepted" rather than "pressed", and it is the part people notice if you remove it.
  - A few milliseconds of band-limited noise at the onset: the contact itself. Never audible on
    its own, but without it the tone just appears, with nothing having touched anything.

Quiet on purpose. It plays under a haptic tap, and a bright sound at full level is far more
tiring than a warm one - this is heard several times a day, every day.

Stereo, with both ears identical: a UI tick that favours one side feels broken rather than wide.
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44_100
DURATION_S = 0.13

# The pitch snap. Starts here, settles there, over GLIDE_S.
START_HZ = 1320.0
END_HZ = 1520.0
GLIDE_S = 0.014
DECAY_S = 0.026

# Underscores, not hyphens: Android resource names allow only lowercase, digits and underscores.
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds", "foyg_slide.wav")

# Same seed every run, so the file is byte-identical unless the parameters above change.
random.seed(11)


def lowpass(buf, start_hz, end_hz):
    """One-pole lowpass whose cutoff falls across the sound: bright contact, darker release."""
    out, y, n = [], 0.0, len(buf)
    for i, x in enumerate(buf):
        fc = start_hz + (end_hz - start_hz) * (i / n)
        a = 1.0 - math.exp(-2.0 * math.pi * fc / SAMPLE_RATE)
        y += a * (x - y)
        out.append(y)
    return out


def highpass(buf, hz):
    """Low-frequency energy is what turns a tick into a thud. This keeps it light."""
    a = math.exp(-2.0 * math.pi * hz / SAMPLE_RATE)
    out, prev_x, prev_y = [], 0.0, 0.0
    for x in buf:
        y = a * (prev_y + x - prev_x)
        out.append(y)
        prev_x, prev_y = x, y
    return out


def tone(n):
    """The tick. Phase is integrated rather than recomputed, or the glide would click."""
    out, phase = [0.0] * n, 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        k = min(1.0, t / GLIDE_S)
        # Ease-out: fast at first, then settling. That shape is the "snap".
        freq = START_HZ + (END_HZ - START_HZ) * (1 - (1 - k) ** 3)
        phase += 2.0 * math.pi * freq / SAMPLE_RATE
        envelope = math.exp(-t / DECAY_S) * min(1.0, t / 0.0015)
        out[i] = 0.9 * envelope * math.sin(phase)
    return out


def contact(n):
    """Three milliseconds of band-limited noise - the finger arriving."""
    length = int(SAMPLE_RATE * 0.003)
    raw = [
        (random.random() * 2 - 1) * math.exp(-i / (length / 2.5)) if i < length else 0.0
        for i in range(n)
    ]
    return [v * 0.12 for v in highpass(lowpass(raw, 5200, 5200), 1200)]


def tiny_room(buf, mix=0.04):
    """Barely there: enough that it isn't airless, not enough to hear as reverb."""
    d = int(SAMPLE_RATE * 0.011)
    wet = [0.0] * len(buf)
    for i in range(d, len(buf)):
        wet[i] = buf[i - d] * 0.55 + wet[i - d] * 0.2
    return [b * (1 - mix) + w * mix for b, w in zip(buf, wet)]


def build() -> bytes:
    n = int(DURATION_S * SAMPLE_RATE)
    mixed = [a + b for a, b in zip(tone(n), contact(n))]
    mixed = tiny_room(highpass(lowpass(mixed, 6000, 2600), 600))

    peak = max(abs(v) for v in mixed) or 1.0
    frames = bytearray()
    for i, v in enumerate(mixed):
        # A short fade guarantees the file ends at zero; a hard cut pops on some hardware.
        fade = min(1.0, (n - i) / (0.012 * SAMPLE_RATE))
        # Gentle saturation rounds the peak off rather than letting it clip.
        sample = math.tanh(v / peak * 1.05) * 0.55 * fade
        packed = struct.pack("<h", int(max(-1.0, min(1.0, sample)) * 32767))
        frames += packed + packed  # identical in both ears
    return bytes(frames)


def main() -> None:
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    data = build()
    with wave.open(OUT_PATH, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(data)
    print(f"wrote {os.path.normpath(OUT_PATH)} — {DURATION_S * 1000:.0f}ms, {len(data) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
