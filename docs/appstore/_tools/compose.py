#!/usr/bin/env python3
"""Composite a 1320x2868 capture into the iPhone 17 Pro Max frame, pixel-exact.

    compose.py <frame.png> <capture.png> <out.png>

The capture is pasted at the measured screen cut-out (75,66) and then clipped to
screen_mask.png — the frame's *interior* transparent region (rounded screen,
exterior excluded), precomputed once from the frame. Without the mask the
capture's square corners spill into the transparent area above the device's
rounded top. Finally the frame is laid on top so its bezel and Dynamic Island
mask the edges.
"""
import os
import sys
import numpy as np
from PIL import Image

CUT_X, CUT_Y = 75, 66
HERE = os.path.dirname(os.path.abspath(__file__))

frame_p, shot_p, out_p = sys.argv[1:4]
frame = Image.open(frame_p).convert("RGBA")
shot = Image.open(shot_p).convert("RGBA")
mask = Image.open(os.path.join(HERE, "screen_mask.png")).convert("L")

if shot.size != (1320, 2868):
    shot = shot.resize((1320, 2868), Image.LANCZOS)

canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
canvas.paste(shot, (CUT_X, CUT_Y))

# Clip the pasted capture to the rounded screen region.
r, g, b, al = canvas.split()
al = Image.fromarray(np.minimum(np.array(al), np.array(mask)).astype("uint8"))
canvas = Image.merge("RGBA", (r, g, b, al))

canvas.alpha_composite(frame)
canvas.save(out_p)
