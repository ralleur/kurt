"""Check the visible exchange and the same reversible cels in every export."""
# SPDX-License-Identifier: AGPL-3.0-only
import json
import unittest
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]


class MagicArtworkTests(unittest.TestCase):
    def test_reversible_stationary_effect_and_clean_endpoints(self):
        for path in ['assets', '.build/exports/mutti/assets',
                     '.build/exports/website/assets', '.build/exports/website/assets/large']:
            with self.subTest(atlas=path):
                directory = ROOT / path
                atlas = json.loads((directory / 'manifest.json').read_text())
                canonical = isinstance(atlas.get('sequences'), list)
                pages = {}

                def frames(name):
                    if canonical:
                        seq = next(s for s in atlas['sequences'] if s['id'] == name)
                        return atlas['frames'][seq['first']:seq['first'] + seq['count']]
                    return atlas.get('sequences', atlas.get('clips'))[name]['frames']

                def location(frame):
                    if canonical:
                        return frame['page'], frame['column'], frame['row']
                    tile = frame.get('cell', frame.get('tile'))
                    columns = atlas['columns']
                    local = tile % (columns * columns)
                    return tile // (columns * columns), local % columns, local // columns

                def image(frame):
                    page, column, row = location(frame)
                    if page not in pages:
                        pages[page] = Image.open(directory / atlas['pages'][page]).convert('RGBA')
                    x, y, cell = column * atlas['cell'], row * atlas['cell'], atlas['cell']
                    return pages[page].crop((x, y, x + cell, y + cell))

                despawn, spawn = frames('despawn-floor'), frames('spawn-floor')
                self.assertEqual(len(despawn) / atlas['fps'], 1.25)
                self.assertEqual([location(f) for f in despawn], [location(f) for f in reversed(spawn)])
                self.assertEqual(image(despawn[0]).tobytes(), image(frames('stand-floor')[0]).tobytes()
                                 if canonical or 'website' in path else image(frames('rise-seat')[-1]).tobytes())
                self.assertIsNone(image(despawn[-1]).getbbox())
                # Exchanging the dog under the opaque cloud must not leave an edge or pop.
                difference = ImageChops.difference(image(despawn[5]), image(despawn[6]))
                self.assertLessEqual(max(high for low, high in difference.getextrema()), 1)
                uncovered = ImageChops.multiply(image(despawn[0]).getchannel('A'),
                                                ImageChops.invert(image(despawn[6]).getchannel('A')))
                # Downsampling can retain a two-level alpha fringe (<1%).
                self.assertLessEqual(uncovered.getextrema()[1], 2, 'cloud must cover the original silhouette')
                alpha = [sum(image(f).getchannel('A').getdata()) for f in despawn[6:]]
                self.assertTrue(all(a >= b for a, b in zip(alpha, alpha[1:])))
                self.assertGreater(alpha[-3], 0, 'retain the last tiny point before becoming transparent')
                for frame in despawn + spawn:
                    self.assertEqual(frame.get('lift', frame.get('liftInBodies', 0)), 0)
                    self.assertEqual(frame.get('travel', 0), 0)
                    if canonical:
                        self.assertEqual(frame['support'], 'floor')
                        self.assertEqual((frame['x'], frame['y'], frame['width']),
                                         (despawn[0]['x'], despawn[0]['y'], despawn[0]['width']))
