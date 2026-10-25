# SPDX-License-Identifier: AGPL-3.0-only
"""Costumes must keep the shared clock, contacts and unchanged source drawing."""
import json
import unittest
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]


class CostumeTests(unittest.TestCase):
    def test_complete_pages_share_the_original_layout_and_native_events(self):
        original = json.loads((ROOT / 'assets/manifest.json').read_text())
        native = json.loads((ROOT / '.build/exports/hauser/assets/manifest.json').read_text())
        self.assertEqual({k: v for k, v in native.items() if k != 'costumes'}, original)
        for folder in ['hauser/assets', 'mutti/assets', 'website/assets', 'website/assets/large']:
            directory = ROOT / '.build/exports' / folder
            atlas = json.loads((directory / 'manifest.json').read_text())
            self.assertEqual(atlas['costumes']['oma']['license'], 'CC-BY-4.0')
            pages = atlas['costumes']['oma']['pages']
            self.assertEqual(len(pages), len(atlas['pages']))
            for base, dressed in zip(atlas['pages'], pages):
                with Image.open(directory / base) as a, Image.open(directory / dressed) as b:
                    self.assertEqual(a.size, b.size)
            if 'still' in atlas['costumes']['oma']:
                self.assertTrue((directory / atlas['costumes']['oma']['still']).is_file())

    def test_baked_costumes_keep_every_exposure_and_grounded_paw(self):
        atlas = json.loads((ROOT / 'assets/manifest.json').read_text())
        for size in [256, 512]:
            directory = ROOT / f'.build/costumes/{size}/oma/animation-v13'
            dressed = json.loads((directory / 'manifest.json').read_text())
            canonical = atlas if size == 256 else json.loads((ROOT / '.build/artwork-512/animation-v13/manifest.json').read_text())
            self.assertEqual(dressed, canonical)
            stand = dressed['frames'][next(s['first'] for s in dressed['sequences'] if s['id'] == 'stand-floor')]
            with Image.open(directory / dressed['pages'][stand['page']]) as page:
                x, y = stand['column'] * size, stand['row'] * size
                image = page.crop((x, y, x + size, y + size)).convert('RGBA')
            base_directory = ROOT / ('assets' if size == 256 else '.build/artwork-512/animation-v13')
            with Image.open(base_directory / canonical['pages'][stand['page']]) as page:
                source = page.crop((x, y, x + size, y + size)).convert('RGBA')
            # Compare visible pixels against the matching atlas filtering.
            paw = tuple(round(v * size / 512) for v in (200, 452, 250, 472))
            background = Image.new('RGBA', (size, size), '#eadfbc')
            difference = ImageChops.difference(Image.alpha_composite(background, source).crop(paw),
                                             Image.alpha_composite(background, image).crop(paw))
            self.assertLessEqual(max(high for _, high in difference.getextrema()), 1)
            self.assertNotEqual(source.tobytes(), image.tobytes())

    def test_magic_fully_covers_the_wig_and_has_no_lingering_costume(self):
        directory = ROOT / '.build/costumes/256/oma/animation-v13'
        atlas = json.loads((directory / 'manifest.json').read_text())
        sequence = next(s for s in atlas['sequences'] if s['id'] == 'despawn-floor')
        pages = {}
        def image(offset):
            frame = atlas['frames'][sequence['first'] + offset]
            if frame['page'] not in pages:
                pages[frame['page']] = Image.open(directory / atlas['pages'][frame['page']]).convert('RGBA')
            x, y, size = frame['column'] * 256, frame['row'] * 256, 256
            return pages[frame['page']].crop((x, y, x + size, y + size))
        uncovered = ImageChops.multiply(image(0).getchannel('A'), ImageChops.invert(image(6).getchannel('A')))
        self.assertLessEqual(uncovered.getextrema()[1], 2, 'the bun must disappear behind the cloud')
        self.assertIsNone(image(14).getbbox())
        self.assertEqual(image(5).tobytes(), image(6).tobytes())
