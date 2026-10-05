import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KurtBehavior, KurtDigestion} from '../runtime/web/kurt-behavior.mjs';
const atlas = JSON.parse(readFileSync(new URL('../.build/exports/website/assets/manifest.json', import.meta.url)));
const create = () => new KurtBehavior(atlas, 1200, 52);

test('one to four swallowed treats become one poop after exactly three active minutes', () => {
  for (let count = 1; count <= 4; count++) {
    const life = new KurtDigestion();
    for (let i = 0; i < count; i++) life.swallow();
    life.advance(179.999); assert.equal(life.pending, null);
    life.advance(.001); assert.equal(life.pending, 'poop');
    assert.equal(life.deposit(), 'poop'); assert.equal(life.deposit(), null);
    life.advance(180); assert.equal(life.pending, null);
  }
});

test('the fifth treat causes vomit and cancels the same meal’s poop timer', () => {
  const life = new KurtDigestion();
  for (let i = 0; i < 5; i++) life.swallow();
  assert.equal(life.pending, 'vomit');
  assert.equal(life.deposit(), 'vomit');
  life.advance(300); assert.equal(life.pending, null); assert.equal(life.treats, 0);
});

test('rapid clicks queue five meals and count only actual swallowing markers', () => {
  const kurt = create();
  for (let i = 0; i < 5; i++) assert.equal(kurt.feed(), true);
  assert.equal(kurt.feed(), false); assert.equal(kurt.life.treats, 0);
  kurt.advance(2.4); assert.equal(kurt.life.treats, 0);
  kurt.advance(.2); assert.equal(kurt.life.treats, 1);
  kurt.advance(40);
  const events = kurt.takeEvents();
  assert.equal(events.filter(e => e.type === 'swallow').length, 5);
  assert.deepEqual(events.filter(e => e.type === 'deposit').map(e => e.kind), ['vomit']);
  kurt.advance(190); assert.equal(kurt.takeEvents().filter(e => e.type === 'deposit').length, 0);
});

test('pickup preserves an uneaten treat without swallowing twice after release', () => {
  for (const elapsed of [1, 3]) {
    const kurt = create(); kurt.feed(); kurt.advance(elapsed);
    kurt.pickUp(); kurt.advance(4);
    assert.equal(kurt.sample().action, 'carry-hang');
    kurt.place(160, 80, false); kurt.advance(20);
    assert.equal(kurt.life.treats, 1);
    assert.equal(kurt.takeEvents().filter(e => e.type === 'swallow').length, 1);
    assert.equal(kurt.sample().action, 'idle-lie');
  }
});

test('a carried dog waits until put down to deposit; deposits happen exactly once', () => {
  const kurt = create(); kurt.feed(); kurt.advance(7);
  kurt.pickUp(); kurt.advance(180);
  assert.equal(kurt.life.pending, 'poop');
  assert.equal(kurt.takeEvents().filter(e => e.type === 'deposit').length, 0);
  kurt.place(90, 45); kurt.advance(10);
  assert.deepEqual(kurt.takeEvents().filter(e => e.type === 'deposit').map(e => e.kind), ['poop']);
  kurt.advance(60); assert.equal(kurt.takeEvents().filter(e => e.type === 'deposit').length, 0);
});

test('placed Kurt stays on narrow surfaces through feeding, resting and resizing', () => {
  const kurt = create(); kurt.pickUp(); kurt.place(70, 65); kurt.advance(4);
  const x = kurt.sample().x;
  kurt.advance(60); assert.equal(kurt.sample().x, x); assert.equal(kurt.sample().action, 'idle-lie');
  kurt.feed(); kurt.advance(12); assert.equal(kurt.sample().x, x);
  kurt.resize(35, 44); kurt.advance(12); assert.equal(kurt.sample().x, 17.5);
});

test('paused time does not age meals; quiet playback does not shorten the three-minute wait', () => {
  const kurt = create(); kurt.feed(); kurt.advance(6, false);
  assert.equal(kurt.life.treats, 1); assert.equal(kurt.life.seconds, 0);
  const pose = kurt.sample(); kurt.advance(0); assert.deepEqual(kurt.sample(), pose);
  kurt.advance(179); assert.equal(kurt.life.pending, null);
});
