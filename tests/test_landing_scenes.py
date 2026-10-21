"""Check scene contacts, fixed props and readable motion in the assembled cels."""
# SPDX-License-Identifier: AGPL-3.0-only
import runpy
import unittest
from pathlib import Path

from PIL import ImageChops

ROOT = Path(__file__).resolve().parents[1]


class LandingSceneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = runpy.run_path(str(ROOT / 'source/landing-scenes/build.py'))
        cls.frames = {name: cls.module['render'](name) for name in cls.module['SCENES']}

    def test_no_clipping_and_transparent_outer_padding(self):
        for name, frames in self.frames.items():
            with self.subTest(scene=name):
                for frame in frames:
                    bounds = self.module['opaque_bounds'](frame)
                    self.assertGreater(bounds[0], 0)
                    self.assertGreater(bounds[1], 0)
                    self.assertLess(bounds[2], frame.width)
                    self.assertLess(bounds[3], frame.height)
                    for p in [(0, 0), (767, 0), (0, 511), (767, 511)]:
                        self.assertEqual(frame.getpixel(p)[3], 0)

    def test_furniture_does_not_wobble(self):
        # Seat/front panel/stool geometry must survive the whole loop exactly.
        regions = {'cinema': (170, 405, 540, 430),
                   'benchmark': (220, 405, 550, 425),
                   'operator': (415, 425, 465, 460)}
        for name, region in regions.items():
            reference = self.frames[name][0].crop(region)
            self.assertGreater(reference.getchannel('A').getextrema()[1], 128)
            for frame in self.frames[name][1:]:
                self.assertIsNone(ImageChops.difference(reference, frame.crop(region)).convert('RGB').getbbox(), name)

    def test_actions_are_drawn_and_equipment_is_active(self):
        regions = {'cinema': (235, 180, 460, 325),
                   'benchmark': (255, 270, 560, 355),
                   'operator': (275, 230, 450, 315)}
        for name, region in regions.items():
            states = {frame.crop(region).tobytes() for frame in self.frames[name]}
            self.assertGreaterEqual(len(states), 4, name)
        for name, region in [('benchmark', (620, 50, 705, 115)),
                             ('operator', (115, 140, 180, 215))]:
            self.assertGreater(len({frame.crop(region).tobytes() for frame in self.frames[name]}), 4)


if __name__ == '__main__':
    unittest.main()
