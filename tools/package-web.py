#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Build a self-hosted website download, including sources and attribution."""
import json
import shutil
import zipfile
from pathlib import Path
from export import ROOT, export

version = json.loads((ROOT / 'package.json').read_text())['version']
assets = export('website')
output = ROOT / '.build/web'
shutil.rmtree(output, ignore_errors=True)
(output / 'kurt').mkdir(parents=True)
shutil.copytree(assets, output / 'kurt/assets')
for name in ['kurt-motion.mjs', 'kurt-behavior.mjs', 'kurt-element.mjs']:
    shutil.copyfile(ROOT / 'runtime/web' / name, output / 'kurt' / name)
for name in ['AGPL-3.0-only.txt', 'CC-BY-4.0.txt']:
    shutil.copyfile(ROOT / 'licenses' / name, output / 'kurt' / name)
shutil.copyfile(ROOT / 'ATTRIBUTION.md', output / 'kurt/ATTRIBUTION.md')
shutil.copyfile(ROOT / 'examples/index.html', output / 'index.html')
shutil.copyfile(ROOT / 'docs/website.md', output / 'README.md')
archive = ROOT / f'.build/kurt-web-{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(output.rglob('*')):
        if path.is_file():
            package.write(path, path.relative_to(output))
print(f'Website package: {archive} ({archive.stat().st_size:,} bytes)')
