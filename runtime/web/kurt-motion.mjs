// SPDX-License-Identifier: AGPL-3.0-only
// Playback uses the original cel timing and travel curves from the Kurt atlas.
const routine = [
  ['idle-floor', 24], ['walk-floor'], ['run-floor'], ['jump-seat'],
  ['scoot-floor'], ['stand-floor'], ['turn-floor'], ['run-floor'],
  ['walk-floor'], ['sit-seat'], ['yawn-seat'], ['rise-seat'],
  ['run-floor'], ['jump-seat'], ['idle-floor', 60]
];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (a, b, t) => a + (b - a) * t;

export class KurtMotion {
  constructor(atlas, width, bodyWidth = 52) {
    this.atlas = atlas;
    this.width = width;
    this.bodyWidth = bodyWidth;
    this.direction = 1;
    this.x = 0;
    this.cursor = 0;
    this.elapsed = 0;
    this.resize(width, bodyWidth, true);
    this.next();
  }
  get size() { return this.bodyWidth * this.atlas.sourceSize / this.atlas.bodyWidth; }
  get limits() {
    const margin = this.size * 0.56;
    return [Math.min(margin, this.width / 2), Math.max(this.width / 2, this.width - margin)];
  }
  resize(width, bodyWidth, initial = false) {
    const previousWidth = this.width || width;
    const fraction = this.x / previousWidth;
    this.width = Math.max(1, width);
    this.bodyWidth = bodyWidth;
    const [left, right] = this.limits;
    this.x = clamp(initial ? Math.min(100, width * 0.19) : fraction * width, left, right);
    if (this.action) {
      // Restart from the current supported position after a layout change.
      // Never retain an off-screen endpoint from a wider viewport.
      this.begin(this.action.id, this.action.id === 'idle-floor' ? this.action.count : undefined);
    }
  }
  get runCycles() {
    const stride = this.atlas.sequences['run-floor'].distance * this.bodyWidth / 0.08125 / 3;
    return clamp(Math.round(this.width * 0.24 / stride), 3, 12);
  }
  wantedDistance(id) {
    if (id === 'run-floor') return this.atlas.sequences[id].distance * this.bodyWidth / 0.08125 * this.runCycles / 3;
    if (id === 'jump-seat') return this.bodyWidth * 1.1;
    return (this.atlas.sequences[id].distance || 0) * this.bodyWidth / 0.08125;
  }
  fitDistance(id, direction) {
    const [left, right] = this.limits;
    const room = direction > 0 ? right - this.x : this.x - left;
    return Math.min(this.wantedDistance(id), Math.max(0, room));
  }
  next() {
    const [id, count] = routine[this.cursor % routine.length];
    const desired = this.wantedDistance(id);
    const available = this.fitDistance(id, this.direction);
    if (desired > 0 && available < desired - 0.01) {
      const opposite = this.fitDistance(id, -this.direction);
      if (opposite > available + 0.01) {
        this.begin('turn-floor');
        return;
      }
    }
    this.cursor++;
    this.begin(id, count);
  }
  begin(id, count) {
    const sequence = this.atlas.sequences[id];
    let frames = sequence.frames;
    if (id === 'run-floor') {
      // Repeat the existing eight-cel stride, retaining its takeoff and settling cels.
      frames = sequence.frames.slice(0, 4);
      for (let cycle = 0; cycle < this.runCycles; cycle++) {
        for (let phase = 0; phase < 8; phase++) {
          frames.push({...sequence.frames[4 + phase], travel: (cycle * 8 + phase) / (this.runCycles * 8)});
        }
      }
      frames.push(...sequence.frames.slice(-4));
    }
    this.action = {id, frames, count: count || frames.length};
    this.elapsed = 0;
    this.startX = this.x;
    this.startDirection = this.direction;
    this.distance = this.fitDistance(id, this.direction);
  }
  advance(seconds) {
    let remaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    while (remaining > 0) {
      const duration = this.action.count / this.atlas.fps;
      const step = Math.min(remaining, duration - this.elapsed);
      this.elapsed += step;
      remaining -= step;
      const pose = this.sample();
      this.x = pose.x;
      if (this.elapsed >= duration - 1e-9) {
        if (this.action.id === 'turn-floor') this.direction *= -1;
        this.next();
      }
    }
    return this.sample();
  }
  sample() {
    const frameTime = this.elapsed * this.atlas.fps;
    const index = Math.min(this.action.count - 1, Math.floor(frameTime));
    const frame = this.action.frames[index % this.action.frames.length];
    const next = this.action.frames[Math.min(index + 1, this.action.count - 1) % this.action.frames.length];
    const part = Math.min(1, frameTime - index);
    const travel = mix(frame.travel, next.travel, part);
    const [left, right] = this.limits;
    const x = clamp(this.startX + this.distance * this.startDirection * travel, left, right);
    return {
      x, cell: frame.cell, action: this.action.id, frame: index,
      lift: mix(frame.lift, next.lift, part) * 906 * this.bodyWidth / 104,
      facing: this.startDirection * (frame.facing ?? -1),
      size: this.size
    };
  }
}
