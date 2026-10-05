#!/usr/bin/env python3
"""Repack the approved artwork for each consumer; never redraw a frame."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PROFILES = json.loads((ROOT / 'profiles.json').read_text())
EFFECTS = ['poop', 'vomit', 'poop-drop', 'vomit-drop']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_stamp(profile):
    return {'profile': PROFILES[profile], 'inputs': {p.name: digest(p) for p in sorted((ROOT / 'assets').iterdir()) if p.is_file()},
            'exporter': digest(Path(__file__))}


def export(profile):
    config = PROFILES[profile]
    source = ROOT / 'assets'
    destination = ROOT / '.build/exports' / profile / 'assets'
    # This directory contains only this export, never consumer files.
    shutil.rmtree(destination, ignore_errors=True)
    destination.mkdir(parents=True)
    atlas = json.loads((source / 'manifest.json').read_text())
    inputs = {'manifest.json': digest(source / 'manifest.json')}
    if config['format'] == 'ios':
        for name in atlas['pages'] + ['manifest.json', 'room-map.json'] + [f'{n}.png' for n in EFFECTS]:
            shutil.copyfile(source / name, destination / name)
        (destination.parent / 'inputs.json').write_text(json.dumps(source_stamp(profile), sort_keys=True))
        return destination

    cell, columns = config['cell'], config['columns']
    per_page = columns * columns
    pages, cels, lookup, locations, sequences = {}, [], {}, {}, {}
    for name in config['clips']:
        original = next(s for s in atlas['sequences'] if s['id'] == name)
        frames = []
        for frame in atlas['frames'][original['first']:original['first'] + original['count']]:
            location = (frame['page'], frame['column'], frame['row'])
            if location not in locations:
                page_name = atlas['pages'][frame['page']]
                if page_name not in pages:
                    pages[page_name] = Image.open(source / page_name).convert('RGBA')
                    inputs[page_name] = digest(source / page_name)
                x, y = frame['column'] * atlas['cell'], frame['row'] * atlas['cell']
                cel = pages[page_name].crop((x, y, x + atlas['cell'], y + atlas['cell']))
                if cell != atlas['cell']:
                    cel = cel.resize((cell, cell), Image.Resampling.LANCZOS)
                key = hashlib.sha256(cel.tobytes()).hexdigest()
                if key not in lookup:
                    lookup[key] = len(cels)
                    cels.append(cel)
                locations[location] = lookup[key]
            index = locations[location]
            if config['format'] == 'mutti':
                result = {'tile': index}
                for key in ['travel', 'facing', 'falling']:
                    if key in frame:
                        result[key] = frame[key]
                if frame.get('lift'):
                    result['liftInBodies'] = frame['lift'] * 906 / 104
            else:
                result = {'cell': index, 'travel': frame.get('travel', frame.get('progress', 0)), 'lift': frame.get('lift', 0)}
                for key in ['facing', 'grip', 'falling']:
                    if key in frame:
                        result[key] = frame[key]
            frames.append(result)
        sequence = {'frames': frames}
        if config['format'] == 'mutti':
            if 'distance' in original:
                sequence['distanceInBodies'] = original['distance'] * 1280 / 104
            if 'waste' in original:
                sequence['waste'] = original['waste']
        else:
            sequence['distance'] = original.get('distance', 0)
        for marker in ['swallow', 'deposit', 'loopStart', 'loopEnd', 'tailStart']:
            if marker in original:
                sequence[marker] = original[marker] - original['first']
        sequences[name] = sequence

    filenames = []
    for start in range(0, len(cels), per_page):
        selected = cels[start:start + per_page]
        rows = columns if config['format'] == 'mutti' else math.ceil(len(selected) / columns)
        sheet = Image.new('RGBA', (columns * cell, rows * cell))
        for i, cel in enumerate(selected):
            sheet.paste(cel, ((i % columns) * cell, (i // columns) * cell))
        name = f"{'atlas' if config['format'] == 'mutti' else 'kurt'}-{len(filenames)}.webp"
        sheet.save(destination / name, lossless=True, method=6)
        filenames.append(name)
    common = {'fps': atlas['fps'], 'cell': cell, 'columns': columns, 'anchor': atlas['anchor'], 'pages': filenames}
    if config['format'] == 'mutti':
        manifest = dict(common, version=atlas['version'], bodyRatio=atlas['bodyWidth'] / atlas['sourceSize'], clips=sequences)
        cels[sequences['rise-seat']['frames'][-1]['tile']].save(destination / 'rest.png')
    else:
        manifest = dict(common, sourceVersion=atlas['version'], cellsPerPage=per_page, sourceSize=atlas['sourceSize'], bodyWidth=atlas['bodyWidth'], sequences=sequences)
        cels[sequences['walk-floor']['frames'][0]['cell']].save(destination / 'still.webp', lossless=True)
    for name in EFFECTS:
        inputs[name + '.png'] = digest(source / (name + '.png'))
        if config['format'] == 'mutti':
            shutil.copyfile(source / (name + '.png'), destination / (name + '.png'))
        else:
            Image.open(source / (name + '.png')).save(destination / (name + '.webp'), lossless=True)
    (destination / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    provenance = {'repository': 'https://github.com/ralleur/kurt', 'artworkVersion': atlas['version'], 'profile': profile,
                  'changes': f'Original frames, {cell}px lossless WebP, identical-pixel deduplication. No redrawing.', 'uniqueCels': len(cels), 'inputs': inputs}
    (destination / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (destination / 'README.txt').write_text('Kurt — Ralleur\n\nGenerated from https://github.com/ralleur/kurt; see kurt.lock.json in the consumer root.\nDo not edit these generated assets. Artwork remains owner-provided; no new public license is granted.\nSource hashes and transformations: provenance.json.\n')
    (destination.parent / 'inputs.json').write_text(json.dumps(source_stamp(profile), sort_keys=True))
    print(f'{profile}: {atlas["version"]}, {len(sequences)} clips, {len(cels)} cels, {len(filenames)} pages')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile', nargs='?', choices=PROFILES)
    args = parser.parse_args()
    for profile in [args.profile] if args.profile else PROFILES:
        export(profile)
