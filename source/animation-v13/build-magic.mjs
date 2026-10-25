// SPDX-License-Identifier: AGPL-3.0-only
// One exposure sheet, played in opposite directions. Only the cloud scales.
// Sources: the approved v8 base/stand.png and the separate CC BY 4.0 cloud.svg.
import sharp from 'sharp';
import {readDrawing} from '../costumes/dress.mjs';
import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import {cell, atlasDirectory, costume} from '../shared/build-profile.mjs';

const dir = new URL('.', import.meta.url).pathname;
const previous = atlasDirectory('animation-v12'), out = atlasDirectory('animation-v13');
await mkdir(out, {recursive: true});
const atlas = JSON.parse(await readFile(previous + 'manifest.json', 'utf8'));
for (const file of [...atlas.pages, 'room-map.json', 'poop.png', 'vomit.png', 'poop-drop.png', 'vomit-drop.png']) {
  await copyFile(previous + file, out + file);
}
const stand = atlas.frames[atlas.sequences.find(s => s.id === 'stand-floor').first];
const dog = await readDrawing('base/stand', new URL('../animation-v8/cels/base/stand.png', import.meta.url));
const cloud = await readFile(dir + 'cloud.svg', 'utf8');
const empty = () => sharp({create: {width: 512, height: 512, channels: 4, background: '#0000'}});
const textures = [], locations = [];
const page = atlas.pages.length;

// 1.25 s at 12 fps: fast cover, a covered exchange, then a shrinking point.
// The two full cloud cels are identical: Kurt changes visibility behind it.
const exposures = [
  [0, true], [0, true], [.12, true], [.48, true], [.86, true],
  [1, true], [1, false], [.93, false], [.74, false], [.49, false],
  [.24, false], [.075, false], [.012, false], [0, false], [0, false]
];
for (const [scale, visible] of exposures) {
  if (!scale && visible) {
    locations.push({page: stand.page, column: stand.column, row: stand.row});
    continue;
  }
  // The full cloud covers every visible dog pixel. Omit the dog at this
  // exposure too, so stray alpha=1 pixels in the source cannot leave dust.
  const layers = visible && scale < 1 ? [{input: dog}] : [];
  if (scale) {
    let contents = cloud.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    if (costume) contents = `<g transform="translate(0 486) scale(1 1.14) translate(0 -486)">${contents}</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><g transform="translate(258 310) scale(${scale}) translate(-258 -310)">${contents}</g></svg>`;
    layers.push({input: Buffer.from(svg)});
  }
  const composed = await empty().composite(layers).png().toBuffer();
  const texture = await sharp(composed).resize(cell).png().toBuffer();
  const tile = textures.length;
  textures.push(texture);
  locations.push({page, column: tile % atlas.columns, row: Math.floor(tile / atlas.columns)});
}
const file = `kurt-a-${page}.png`;
atlas.pages.push(file);
await sharp({create: {width: cell * atlas.columns, height: cell * atlas.columns, channels: 4, background: '#0000'}})
  .composite(textures.map((input, i) => ({input, left: i % atlas.columns * cell, top: Math.floor(i / atlas.columns) * cell})))
  .png().toFile(out + file);
for (const [id, label, cels] of [
  ['despawn-floor', 'Wegzaubern · helle Wolke', locations],
  ['spawn-floor', 'Herbeizaubern · helle Wolke', [...locations].reverse()]
]) {
  atlas.sequences.push({id, label, first: atlas.frames.length, count: cels.length});
  for (const location of cels) {
    const index = atlas.frames.length;
    atlas.frames.push({...stand, ...location, index, time: index / atlas.fps, clip: id, label,
      source: 'animation-v13/cloud.svg + base/stand'});
  }
}
atlas.version = 'kurt-a-refined-13';
await writeFile(out + 'manifest.json', JSON.stringify(atlas, null, 2) + '\n');
console.log({version: atlas.version, frames: atlas.frames.length, pages: atlas.pages.length, magicFrames: locations.length});
