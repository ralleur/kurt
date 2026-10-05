// SPDX-License-Identifier: AGPL-3.0-only
// The numbered stages preserve the approved drawing history, not app copies.
import {execFileSync} from 'node:child_process';
import {readFile, copyFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const script of ['animation-v8/build-walk.mjs', 'animation-v8/build.mjs', 'animation-v9/build-idle.mjs',
  'animation-v10/build-carry.mjs', 'animation-v12/build-idle.mjs']) {
  execFileSync(process.execPath, [new URL(`source/${script}`, root).pathname], {stdio: 'inherit'});
}
const source = new URL('source/animation-v12/ios-assets/', root);
const atlas = JSON.parse(await readFile(new URL('manifest.json', source)));
for (const file of [...atlas.pages, 'manifest.json', 'room-map.json', 'poop.png', 'vomit.png', 'poop-drop.png', 'vomit-drop.png']) {
  await copyFile(new URL(file, source), new URL(`assets/${file}`, root));
}
console.log('Canonical artwork rebuilt. Run npm test before updating consumers.');
