#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Assemble the three drawn card scenes. No image generation at build time."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

SOURCES = Path(__file__).parent / 'sources'
SIZE = (768, 512)
FPS = 12
SCENES = {
    'cinema': {
        'label': 'kurtz video player',
        'action': 'Popcorn greifen, essen und den Film weiterschauen.',
        'scale': .78,
        'keys': [(0, 18), (1, 4), (2, 3), (3, 5), (4, 5), (5, 5),
                 (0, 14), (1, 3), (2, 3), (3, 4), (4, 4), (5, 4)],
    },
    'benchmark': {
        'label': 'kurtz Gassi Benchmark',
        'action': 'Auf dem Laufband gehen, während Messkurve und Band laufen.',
        'scale': .75,
        'keys': [(i, 2) for i in range(12)],
    },
    'operator': {
        'label': 'kurtz preview',
        'action': 'Tippen und zwischen den aktiven Bildschirmen arbeiten.',
        'scale': .82,
        'keys': [(0, 4), (1, 2), (2, 2), (3, 3), (1, 2), (2, 2),
                 (0, 5), (4, 3), (5, 4), (4, 3), (0, 4), (8, 3),
                 (9, 2), (10, 2), (11, 4), (0, 5)],
    },
}


def opaque_bounds(image):
    return image.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()


def character(name, sheet, key):
    """Register whole cels by fixed contacts, never normalize pose dimensions."""
    col, row = key % 4, key // 4
    # The cinema sheet has uneven row gutters. Cut in the empty gutters so
    # a neighbouring character's head cannot enter the current cel.
    rows = (0, 278, 565, 887) if name == 'cinema' else tuple(round(i * sheet.height / 3) for i in range(4))
    cel = sheet.crop((round(col * sheet.width / 4), rows[row],
                      round((col + 1) * sheet.width / 4), rows[row + 1]))
    # Generated removal layers contain faint colored alpha debris outside ink.
    # Remove only low-coverage pixels before resampling; keep original RGB ink.
    cel.putalpha(cel.getchannel('A').point(lambda a: a if a >= 128 else 0))
    scale = SCENES[name]['scale']
    cel = cel.resize((round(cel.width * SIZE[0] * scale / (sheet.width / 4)),
                      round(cel.height * SIZE[1] * scale / (sheet.height / 3))), Image.Resampling.LANCZOS)
    x0, y0, x1, y1 = opaque_bounds(cel)
    if name == 'cinema':
        position = (round(.76 * SIZE[0]) - x1, round(.72 * SIZE[1]) - y1)
    elif name == 'operator':
        position = (round(.81 * SIZE[0]) - x1, round(.73 * SIZE[1]) - y1)
    else:
        # Dock the breathing hose to the fixed analyzer connector in every key.
        candidates = [(x, y) for y in range(cel.height) for x in range(cel.width // 4)
                      if (lambda p: p[3] >= 180 and p[2] > p[0] * 1.3 and p[2] > p[1] * 1.05)(cel.getpixel((x, y)))]
        left = min(x for x, y in candidates)
        ys = sorted(y for x, y in candidates if x <= left + 4)
        position = (134 - left, 212 - ys[len(ys) // 2])
    layer = Image.new('RGBA', SIZE)
    layer.alpha_composite(cel, position)
    if name == 'benchmark':
        # The thin drawn cable ends dock at the console. Only their free span
        # is extended; fur, sensor patches, face and paws are untouched.
        span = (558, 210, 635, 305)
        wires = layer.crop(span).resize((147, 95), Image.Resampling.BICUBIC)
        layer.paste((0, 0, 0, 0), span)
        layer.alpha_composite(wires, (558, 210))
    return layer


def activity(background, name, frame, count):
    """Move the belt and display activity while furniture stays pixel-stable."""
    result = background.copy()
    graphics = Image.new('RGBA', SIZE)
    draw = ImageDraw.Draw(graphics)
    phase = frame / count
    if name == 'benchmark':
        belt = Image.new('L', SIZE)
        ImageDraw.Draw(belt).polygon([(137, 330), (619, 330), (676, 360), (176, 360)], fill=255)
        for base in range(-120, 800, 130):
            x = base + round(phase * 130)
            draw.line([(x, 328), (x + 40, 363)], fill=(97, 204, 211, 125), width=3)
        graphics.putalpha(Image.composite(graphics.getchannel('A'), Image.new('L', SIZE), belt))
        result.alpha_composite(graphics)
        graphics = Image.new('RGBA', SIZE)
        draw = ImageDraw.Draw(graphics)
        x = 638 + round(phase * 69)
        y = round(86 - 12 * math.sin(phase * math.tau * 2))
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(183, 255, 180, 245))
    elif name == 'operator':
        screens = [((110, 136), (193, 115), (199, 214), (112, 230)),
                   ((203, 81), (301, 75), (307, 187), (208, 196)),
                   ((328, 46), (436, 42), (436, 139), (332, 152)),
                   ((492, 80), (584, 93), (574, 187), (491, 174)),
                   ((646, 131), (720, 146), (711, 234), (643, 218))]
        for i, polygon in enumerate(screens):
            mask = Image.new('L', SIZE)
            ImageDraw.Draw(mask).polygon(polygon, fill=255)
            sweep = Image.new('RGBA', SIZE)
            y0, y1 = min(p[1] for p in polygon), max(p[1] for p in polygon)
            y = round(y0 + ((phase + i / 5) % 1) * (y1 - y0))
            ImageDraw.Draw(sweep).rectangle((0, y, SIZE[0], y + 3), fill=(139, 255, 165, 95))
            sweep.putalpha(Image.composite(sweep.getchannel('A'), Image.new('L', SIZE), mask))
            graphics.alpha_composite(sweep)
    result.alpha_composite(graphics)
    return result


def render(name):
    background = Image.open(SOURCES / f'{name}-background.png').convert('RGBA').resize(SIZE, Image.Resampling.LANCZOS)
    sheet = Image.open(SOURCES / f'{name}-layer.png').convert('RGBA')
    if sheet.size != (1774, 887):
        raise ValueError(f'{name}: expected the selected 4x3 source sheet, got {sheet.size}')
    keys = [key for key, hold in SCENES[name]['keys'] for _ in range(hold)]
    layers = {key: character(name, sheet, key) for key in set(keys)}
    frames = []
    for i, key in enumerate(keys):
        frame = activity(background, name, i, len(keys))
        frame.alpha_composite(layers[key])
        # Common export padding keeps fine outer ink inside the canvas after
        # resampling. Scale the complete composition, never individual poses.
        padded = Image.new('RGBA', SIZE)
        padded.alpha_composite(frame.resize((736, 490), Image.Resampling.LANCZOS), (16, 11))
        frame = padded
        bounds = opaque_bounds(frame)
        if not bounds or not (0 < bounds[0] < bounds[2] < SIZE[0] and 0 < bounds[1] < bounds[3] < SIZE[1]):
            raise ValueError(f'{name}: clipped scene at frame {i}: {bounds}')
        frames.append(frame)
    return frames
