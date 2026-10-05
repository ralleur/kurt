import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {KurtMotion} from '../runtime/web/kurt-motion.mjs';
const atlas = JSON.parse(readFileSync(new URL('../.build/exports/website/assets/manifest.json', import.meta.url)));

test('all animation frames resolve to a packed original asset', () => {
  for (const page of atlas.pages) assert.ok(existsSync(new URL(`../.build/exports/website/assets/${page}`, import.meta.url)));
  for (const sequence of Object.values(atlas.sequences)) {
    for (const frame of sequence.frames) {
      assert.ok(Number.isInteger(frame.cell));
      assert.ok(Math.floor(frame.cell / atlas.cellsPerPage) < atlas.pages.length);
      assert.ok(frame.travel >= 0 && frame.travel <= 1);
      assert.ok(frame.lift >= 0);
    }
  }
});

test('walking, running, scooting, jumping and turning stay on the line at narrow and wide widths', () => {
  for (const width of [230, 291, 660, 1260]) {
    const motion = new KurtMotion(atlas, width, width < 660 ? 44 : 52);
    const actions = new Set(), directions = new Set();
    let jumped = false;
    for (let frame = 0; frame < 60 * 240; frame++) {
      const pose = motion.advance(1 / 60);
      actions.add(pose.action); directions.add(pose.facing);
      const [left, right] = motion.limits;
      assert.ok(pose.x >= left - 0.01 && pose.x <= right + 0.01, `${width}: ${pose.action} off line`);
      if (pose.action === 'jump-seat' && pose.lift > 10) jumped = true;
      if (!['jump-seat', 'run-floor'].includes(pose.action)) assert.equal(pose.lift, 0);
      if (pose.action === 'run-floor') assert.ok(pose.lift <= 0.0045 * 906 * motion.bodyWidth / 104 + 0.001);
    }
    for (const action of ['walk-floor', 'run-floor', 'jump-seat', 'scoot-floor', 'turn-floor', 'sit-seat', 'yawn-seat']) assert.ok(actions.has(action), `${width}: missing ${action}`);
    assert.equal(directions.size, 2); assert.ok(jumped);
  }
});

test('a turn changes direction without moving the paw anchor', () => {
  const motion = new KurtMotion(atlas, 1260);
  motion.begin('turn-floor');
  const start = motion.sample();
  const middle = motion.advance(10 / 12);
  assert.equal(middle.x, start.x);
  assert.equal(middle.facing, -start.facing);
});

test('resize during a run or jump cannot leave an endpoint outside the new track', () => {
  for (const id of ['run-floor', 'jump-seat']) {
    const motion = new KurtMotion(atlas, 1260);
    motion.x = 1100; motion.begin(id); motion.advance(0.8);
    motion.resize(230, 44);
    for (let i = 0; i < 600; i++) {
      const pose = motion.advance(1 / 60), [left, right] = motion.limits;
      assert.ok(pose.x >= left && pose.x <= right);
      assert.ok(pose.size < 60);
    }
  }
});

test('zero elapsed time holds the current pose without advancing the sequence', () => {
  const motion = new KurtMotion(atlas, 291, 44);
  motion.advance(4);
  const before = motion.sample();
  for (let i = 0; i < 100; i++) assert.deepEqual(motion.advance(0), before);
});
