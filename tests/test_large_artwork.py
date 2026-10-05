"""Verify full-resolution pixels and playback metadata, not just file dimensions."""
import json
import unittest
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]

class LargeArtworkTests(unittest.TestCase):
    def test_source_detail_and_animation_timing(self):
        assets = ROOT / '.build/exports/website/assets'
        small = json.loads((assets / 'manifest.json').read_text())
        large = json.loads((assets / 'large/manifest.json').read_text())
        self.assertEqual(large['cell'], 512)
        self.assertEqual(small['cell'], 128)
        self.assertEqual(large['fps'], small['fps'])
        self.assertEqual(large['anchor'], small['anchor'])
        for name, clip in large['sequences'].items():
            original = small['sequences'][name]
            self.assertEqual(len(clip['frames']), len(original['frames']))
            self.assertEqual(clip['distance'], original['distance'])
            for a, b in zip(clip['frames'], original['frames']):
                self.assertEqual({k:v for k,v in a.items() if k != 'cell'}, {k:v for k,v in b.items() if k != 'cell'})
        cell = large['sequences']['walk-floor']['frames'][0]['cell']
        sheet = Image.open(assets / 'large' / large['pages'][cell // large['cellsPerPage']]).convert('RGBA')
        index = cell % large['cellsPerPage']
        x, y = index % large['columns'] * 512, index // large['columns'] * 512
        actual = sheet.crop((x,y,x+512,y+512))
        canonical = json.loads((ROOT / '.build/artwork-512/animation-v12/manifest.json').read_text())
        frame = canonical['frames'][next(s['first'] for s in canonical['sequences'] if s['id']=='walk-floor')]
        original = Image.open(ROOT / 'source/animation-v8/cels' / (frame['source']+'.png')).convert('RGBA')
        background = Image.new('RGBA', (512,512), '#eadfbc')
        difference = ImageChops.difference(Image.alpha_composite(background, actual), Image.alpha_composite(background, original))
        # Atlas compositing may round an antialiased edge by one channel value.
        self.assertLessEqual(max(high for low, high in difference.getextrema()), 1)
        self.assertNotEqual(actual.tobytes(), actual.resize((128,128)).resize((512,512)).tobytes())
