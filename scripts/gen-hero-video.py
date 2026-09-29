#!/usr/bin/env python3
"""Generate the Drayvenn Health ambient hero loop (self-generated brand asset).
Light glass-aurora scene: drifting teal/sky blobs, dot grid, sweeping ECG trace,
breathing logo lockup. Seamless 8s loop, rendered low-res then upscaled."""
import numpy as np, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 384, 216          # render res (upscaled 3x later)
FPS, SEC = 24, 8
N = FPS * SEC
OUT_W, OUT_H = 1152, 648
FRAMES = '/tmp/hero-frames'
os.makedirs(FRAMES, exist_ok=True)

LOGO = '/home/sandbox/drayvenn-health/public/brand/lockup.png'

def base_bg():
    top = np.array([240, 251, 248], dtype=np.float32)
    bot = np.array([214, 244, 238], dtype=np.float32)
    t = np.linspace(0, 1, H)[:, None, None]
    img = top[None, None, :] * (1 - t) + bot[None, None, :] * t
    return np.repeat(img, W, axis=1)

def blob(img, cx, cy, r, color, alpha):
    yy, xx = np.mgrid[0:H, 0:W]
    d2 = ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)
    w = np.exp(-d2 * 2.2) * alpha
    for c in range(3):
        img[:, :, c] = img[:, :, c] * (1 - w) + color[c] * w

BLOBS = [
    # (radius, color, alpha, orbit_cx, orbit_cy, orbit_r, phase)
    (165, (45, 212, 191), .42,  80,  30, 52, 0.0),
    (180, (36, 150, 214), .30, 330,  40, 60, 2.1),
    (170, (126, 110, 250), .18, 210, 230, 62, 4.2),
    (130, (0, 168, 152),  .30, 330, 195, 44, 1.2),
    (140, (110, 235, 200), .26, 130, 210, 48, 3.3),
]

# ECG waveform (one period, x in [0,1))
def ecg_y(u):
    # classic PQRST-ish pulse
    y = 0.0
    y += 0.10 * math.exp(-((u - 0.18) ** 2) / 0.0009)      # P
    y += -0.16 * math.exp(-((u - 0.30) ** 2) / 0.00035)    # Q
    y += 1.00 * math.exp(-((u - 0.34) ** 2) / 0.00045)     # R
    y += -0.30 * math.exp(-((u - 0.38) ** 2) / 0.0005)     # S
    y += 0.22 * math.exp(-((u - 0.58) ** 2) / 0.0022)      # T
    return y

logo_img = Image.open(LOGO).convert('RGBA').crop((50, 100, 460, 400))

def render_frame(f):
    t = f / N  # 0..1
    img = base_bg()
    for (r, color, alpha, ox, oy, orad, phase) in BLOBS:
        ang = 2 * math.pi * t + phase
        cx = ox + orad * math.cos(ang)
        cy = oy + orad * 0.62 * math.sin(ang)
        blob(img, cx, cy, r, color, alpha)
    frame = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGB')

    # dot grid (very subtle, drifts slowly, period-synced)
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 15
    off = (t * step) % step
    for gx in np.arange(-step, W + step, step):
        for gy in np.arange(-step, H + step, step):
            x, y = gx + off, gy + off * 0.5
            gd.ellipse([x - .6, y - .6, x + .6, y + .6], fill=(0, 133, 122, 20))
    frame = Image.alpha_composite(frame.convert('RGBA'), grid)

    # ECG trace sweeping across, soft glow, period-synced (2 pulses per loop)
    ecg = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ed = ImageDraw.Draw(ecg)
    midy = H * 0.78
    span = W * 1.0
    shift = (t * 2.0) % 1.0  # two full wavelengths per loop
    pts = []
    for px in range(0, W + 2, 2):
        u = ((px / span) + shift) % 1.0
        # fade the trace older (left) -> stronger near the "now" point
        y = midy - ecg_y(u) * H * 0.16
        pts.append((px, y))
    ed.line(pts, fill=(0, 168, 152, 45), width=5)
    ecg = ecg.filter(ImageFilter.GaussianBlur(3))
    frame = Image.alpha_composite(frame, ecg)
    ecg2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ed2 = ImageDraw.Draw(ecg2)
    ed2.line(pts, fill=(13, 148, 136, 200), width=2)
    frame = Image.alpha_composite(frame, ecg2)

    # breathing logo lockup with soft shadow
    breathe = 1.0 + 0.03 * math.sin(2 * math.pi * t)
    lw = int(150 * breathe)
    lh = int(lw * logo_img.size[1] / logo_img.size[0])
    lg = logo_img.resize((lw, lh), Image.LANCZOS)
    sh = Image.new('RGBA', (lw + 60, lh + 60), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([30, 30 + int(lh * 0.6), 30 + lw, 30 + lh + 8], fill=(0, 120, 110, 22))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    lx, ly = W // 2 - lw // 2, int(H * 0.36) - lh // 2
    frame.alpha_composite(sh, (lx - 30, ly - 30))
    frame.paste(lg, (lx, ly), lg)

    return frame.convert('RGB')

for f in range(N):
    render_frame(f).save(f'{FRAMES}/f{f:04d}.png')
    if f % 48 == 0: print(f'frame {f}/{N}', flush=True)

# upscale + encode
subprocess.run([
    'ffmpeg', '-y', '-framerate', str(FPS), '-i', f'{FRAMES}/f%04d.png',
    '-vf', f'scale={OUT_W}:{OUT_H}:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    '/tmp/hero-gen.mp4'
], check=True)
print('DONE', os.path.getsize('/tmp/hero-gen.mp4'), 'bytes')
