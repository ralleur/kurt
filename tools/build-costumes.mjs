// SPDX-License-Identifier: AGPL-3.0-only
// Reuse every cel, deformation, exposure and event from the approved pipeline.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('source/costumes/catalog.json', root)));
for (const costume of Object.keys(catalog)) {
  if (!/^[a-z][a-z0-9-]*$/.test(costume)) throw Error(`Invalid costume ID: ${costume}`);
  for (const script of ['animation-v8/build-walk.mjs', 'animation-v8/build.mjs', 'animation-v9/build-idle.mjs',
    'animation-v10/build-carry.mjs', 'animation-v12/build-idle.mjs', 'animation-v13/build-magic.mjs']) {
    execFileSync(process.execPath, [new URL(`source/${script}`, root).pathname], {
      env: {...process.env, KURT_COSTUME: costume, KURT_LARGE_ARTWORK: process.argv.includes('--large') ? '1' : '0'}, stdio: 'inherit'
    });
  }
  console.log(`Costume ${costume}: same clips, timing, contacts and deformation rig.`);
}
