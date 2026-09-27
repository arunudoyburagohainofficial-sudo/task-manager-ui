#!/usr/bin/env python3
"""
Generates the app's notification chime.

The sound is committed as a .wav, but it's generated rather than sourced so it can be changed
deliberately — a binary nobody can regenerate is a binary nobody dares touch. Run:

    python3 scripts/make-notification-sound.py

and it rewrites assets/sounds/foyg_chime.wav in place.

── What it's trying to sound like ──

A reminder that says "time to start", not "something is wrong". Three notes of a C major triad,
rising, each struck a beat after the last and left to ring, so they land together as a chord
rather than three separate beeps. Rising and resolving reads as an invitation; falling or
dissonant intervals read as an error, and a single flat tone is the generic ping every other app
already uses.

Bell-ish rather than pure: a sine on its own sounds like a hearing test. Each note is its
fundamental plus a couple of quiet harmonics, with a fast attack and a long exponential decay —
the shape a struck object makes.

Kept under 1.5s on purpose. Android truncates long notification sounds, and a reminder that
outstays its welcome gets the channel muted.
"""

import math
import os
import struct
import wave

SAMPLE_RATE = 44_100
# C5, E5, G5 — the notes of a C major triad, ascending.
NOTES_HZ = [523.25, 659.25, 783.99]
# How far apart the notes are struck. Short enough to read as one gesture, not three events.
STRIKE_GAP_S = 0.16
# How long each note takes to fade to silence.
DECAY_S = 1.05
TOTAL_S = STRIKE_GAP_S * (len(NOTES_HZ) - 1) + DECAY_S

# Relative loudness of each harmonic above the fundamental. Falling quickly keeps it warm;
# strong upper harmonics are what make a chime sound cheap and piercing.
HARMONICS = [(1.0, 1.0), (2.0, 0.22), (3.0, 0.08)]

# Underscores, not hyphens: this becomes an Android resource name, and those allow only
# lowercase letters, digits and underscores. A hyphen fails the prebuild outright.
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds", "foyg_chime.wav")


def note_sample(t_since_strike: float, freq: float) -> float:
    """One note's contribution at a moment, or silence before it's struck."""
    if t_since_strike < 0:
        return 0.0
    # Exponential decay, plus a few milliseconds of attack so the onset isn't a click.
    attack = min(1.0, t_since_strike / 0.004)
    envelope = attack * math.exp(-t_since_strike / (DECAY_S / 4.0))
    value = 0.0
    for multiple, weight in HARMONICS:
        value += weight * math.sin(2.0 * math.pi * freq * multiple * t_since_strike)
    return envelope * value


def build() -> bytes:
    frames = bytearray()
    total_frames = int(TOTAL_S * SAMPLE_RATE)
    # Normalise against the loudest possible stack rather than clipping: the three notes overlap,
    # so the peak is well above any single one.
    peak = sum(weight for _, weight in HARMONICS) * len(NOTES_HZ)

    for i in range(total_frames):
        t = i / SAMPLE_RATE
        mixed = sum(note_sample(t - index * STRIKE_GAP_S, freq) for index, freq in enumerate(NOTES_HZ))
        # A short fade at the very end guarantees the file ends at zero — a hard cut is an
        # audible pop on some Android hardware.
        remaining = TOTAL_S - t
        if remaining < 0.02:
            mixed *= remaining / 0.02
        amplitude = int(max(-1.0, min(1.0, mixed / peak)) * 0.82 * 32767)
        frames += struct.pack("<h", amplitude)
    return bytes(frames)


def main() -> None:
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    data = build()
    with wave.open(OUT_PATH, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(data)
    print(f"wrote {os.path.normpath(OUT_PATH)} — {TOTAL_S:.2f}s, {len(data) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
