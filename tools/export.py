#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Repack the approved artwork for each consumer; never redraw a frame."""
import argparse
import hashlib
import json
import math
import runpy
import shutil
import subprocess
import zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PROFILES = json.loads((ROOT / 'profiles.json').read_text())
EFFECTS = ['poop', 'vomit', 'poop-drop', 'vomit-drop']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def large_source_stamp():
    paths = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '--cached', '--others', '--exclude-standard', 'source', 'tools/build-artwork.mjs'], text=True).splitlines()
    return {name: digest(ROOT / name) for name in sorted(set(paths)) if (ROOT / name).is_file()}


def large_source():
    directory = ROOT / '.build/artwork-512'
    stamp = directory / 'inputs.json'
    current = large_source_stamp()
    if not stamp.exists() or json.loads(stamp.read_text()) != current:
        subprocess.run(['node', str(ROOT / 'tools/build-artwork.mjs'), '--large'], cwd=ROOT, check=True)
        stamp.write_text(json.dumps(large_source_stamp(), sort_keys=True))
    return directory / 'animation-v12'


def source_stamp(profile):
    if PROFILES[profile]['format'] == 'landing-scenes':
        paths = sorted((ROOT / 'source/landing-scenes').rglob('*'))
        return {'profile': PROFILES[profile], 'exporter': digest(Path(__file__)),
                'inputs': {str(p.relative_to(ROOT)): digest(p) for p in paths if p.is_file() and '__pycache__' not in p.parts}}
    return {'profile': PROFILES[profile], 'inputs': {p.name: digest(p) for p in sorted((ROOT / 'assets').iterdir()) if p.is_file()},
            'exporter': digest(Path(__file__)), **({'largeInputs': large_source_stamp()} if profile == 'website' else {})}


def export(profile, large=False):
    config = dict(PROFILES[profile])
    if config['format'] == 'landing-scenes':
        source = export_landing_scenes()
        destination = ROOT / '.build/exports' / profile / 'assets'
        destination.mkdir(parents=True, exist_ok=True)
        for name in ['cinema.webp', 'cinema-poster.webp', 'operator.webp', 'operator-poster.webp',
                     'benchmark.webp', 'benchmark-poster.webp', 'manifest.json']:
            shutil.copyfile(source / name, destination / name)
        (destination.parent / 'inputs.json').write_text(json.dumps(source_stamp(profile), sort_keys=True))
        return destination
    if large:
        config.update(cell=512, columns=4)
    source = large_source() if large else ROOT / 'assets'
    destination = ROOT / '.build/exports' / profile / 'assets'
    if large:
        destination = destination / 'large'
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
    for name in ([] if large else EFFECTS):
        inputs[name + '.png'] = digest(source / (name + '.png'))
        if config['format'] == 'mutti':
            shutil.copyfile(source / (name + '.png'), destination / (name + '.png'))
        else:
            Image.open(source / (name + '.png')).save(destination / (name + '.webp'), lossless=True)
    (destination / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    provenance = {'repository': 'https://github.com/ralleur/kurt', 'artworkVersion': atlas['version'], 'profile': profile,
                  'changes': f'Original frames, {cell}px lossless WebP, identical-pixel deduplication. No redrawing.', 'uniqueCels': len(cels), 'inputs': inputs}
    (destination / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (destination / 'README.txt').write_text('Kurt — Ralleur\n\nGenerated from https://github.com/ralleur/kurt; see kurt.lock.json in the consumer root.\nDo not edit these generated assets. Artwork: Kurt by Ralleur, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit the source and indicate changes.\nSource hashes and transformations: provenance.json.\n')
    if not large:
        if profile == 'website':
            export(profile, large=True)
        (destination.parent / 'inputs.json').write_text(json.dumps(source_stamp(profile), sort_keys=True))
    print(f'{profile}: {atlas["version"]}, {len(sequences)} clips, {len(cels)} cels, {len(filenames)} pages')
    return destination


def export_landing_scenes():
    """Export the three prop scenes independently of the companion atlases."""
    source = ROOT / 'source/landing-scenes'
    module = runpy.run_path(str(source / 'build.py'))
    destination = ROOT / '.build/landing-scenes'
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 'kurt-landing-scenes-1', 'fps': module['FPS'],
                'width': module['SIZE'][0], 'height': module['SIZE'][1],
                'encoding': 'animated WebP quality 90; lossless posters',
                'artworkLicense': 'CC-BY-4.0', 'scenes': {}}
    deliverables = ['index.html', 'manifest.json', 'README.txt', 'CC-BY-4.0.txt', 'AGPL-3.0-only.txt']
    for name, config in module['SCENES'].items():
        frames = module['render'](name)
        durations = [round((i + 1) * 1000 / module['FPS']) - round(i * 1000 / module['FPS']) for i in range(len(frames))]
        animation, poster = f'{name}.webp', f'{name}-poster.webp'
        frames[0].save(destination / animation, save_all=True, append_images=frames[1:],
                       duration=durations, loop=0, lossless=False, quality=90, method=6, minimize_size=True)
        frames[0].save(destination / poster, lossless=True, method=6)
        # Exact exported composition, for focused visual checks and scrubbing.
        work = destination / 'work' / name
        work.mkdir(parents=True, exist_ok=True)
        for i, frame in enumerate(frames):
            frame.save(work / f'{i:03}.png')
        manifest['scenes'][name] = {'label': config['label'], 'action': config['action'],
                                  'animation': animation, 'poster': poster,
                                  'frames': len(frames), 'durationMs': sum(durations),
                                  'keys': config['keys']}
        deliverables.extend([animation, poster])
        print(f'{name}: {len(frames)} frames, {sum(durations)} ms, {(destination / animation).stat().st_size // 1024} KiB')
    manifest['inputs'] = {str(p.relative_to(ROOT)): digest(p) for p in sorted(source.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(source / 'preview.html', destination / 'index.html')
    shutil.copyfile(ROOT / 'licenses/CC-BY-4.0.txt', destination / 'CC-BY-4.0.txt')
    shutil.copyfile(ROOT / 'licenses/AGPL-3.0-only.txt', destination / 'AGPL-3.0-only.txt')
    (destination / 'README.txt').write_text(
        'Kurt — landing scenes for kurtz.app\n\n'
        'Kurt by Ralleur — https://github.com/ralleur/kurt\n'
        'Artwork and animation data: CC BY 4.0. Keep credit, license and indication of changes.\n'
        'Preview HTML/JavaScript: AGPL-3.0-only; complete readable source included.\n'
        'AI-assisted new scene drawings, registered and composited with fixed props;\n'
        'programmatic belt/display activity. Original companion atlas unchanged.\n\n'
        'Use the animated WebP in an img element (768x512, transparent, looping).\n'
        'Use the matching poster for prefers-reduced-motion and a visible pause control.\n'
        'Suspend offscreen animation by selecting the poster. No third-party runtime needed.\n'
        'Serve index.html over HTTP for the local preview. Source hashes and timing: manifest.json.\n'
        'Sources: source/landing-scenes. Rebuild: python3 tools/export.py --landing-scenes\n')
    archive = ROOT / '.build/kurt-landing-scenes.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name in deliverables:
            bundle.write(destination / name, arcname='kurt-landing-scenes/' + name)
    print(f'Landing scenes: {archive}')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile', nargs='?', choices=PROFILES)
    parser.add_argument('--landing-scenes', action='store_true', help='Export the three kurtz.app card scenes separately')
    args = parser.parse_args()
    if args.landing_scenes:
        if args.profile:
            parser.error('--landing-scenes cannot be combined with a companion profile')
        export_landing_scenes()
    else:
        for profile in [args.profile] if args.profile else PROFILES:
            export(profile)
