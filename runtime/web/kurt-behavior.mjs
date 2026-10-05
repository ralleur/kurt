import { KurtMotion } from './kurt-motion.mjs';

// Only visible, unpaused foreground time is passed to this clock.
export class KurtDigestion {
  constructor() { this.seconds = 0; this.treats = 0; this.due = null; this.pending = null; }
  advance(seconds) {
    this.seconds += Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    if (this.due !== null && this.seconds >= this.due && !this.pending) this.pending = 'poop';
  }
  swallow() {
    if (!this.treats) this.due = this.seconds + 180;
    this.treats++;
    if (this.treats >= 5) { this.pending = 'vomit'; this.due = null; }
  }
  deposit() {
    const kind = this.pending;
    if (kind) { this.treats = 0; this.due = null; this.pending = null; }
    return kind;
  }
}

export class KurtBehavior {
  constructor(atlas, width, bodyWidth) {
    this.atlas = atlas;
    this.motion = new KurtMotion(atlas, width, bodyWidth);
    this.life = new KurtDigestion();
    this.queue = 0;
    this.roaming = true;
    this.carrying = false;
    this.clip = null;
    this.events = [];
  }
  get acceptedTreats() {
    return this.life.treats + this.queue + (this.clip?.id === 'eat-floor' && !this.clip.swallowed ? 1 : 0);
  }
  feed() {
    // Every accepted click gets a complete eating action, even during rapid taps.
    if (this.carrying || this.life.pending || this.acceptedTreats >= 5 || ['vomit-floor', 'poop-floor'].includes(this.clip?.id)) return false;
    this.queue++;
    this.schedule();
    return true;
  }
  play(id) { this.clip = {id, elapsed: 0, swallowed: false, deposited: false}; }
  interrupt() {
    if (this.clip?.id === 'eat-floor' && !this.clip.swallowed) this.queue++;
    this.clip = null;
    const pose = this.motion.sample();
    this.motion.x = pose.x;
    this.motion.direction = -pose.facing;
    this.motion.begin('idle-floor');
  }
  pickUp() {
    this.interrupt();
    this.carrying = true;
    this.play('carry-lift');
  }
  place(width, x, roaming = false) {
    this.carrying = false;
    this.roaming = roaming;
    this.motion.resize(width, this.motion.bodyWidth);
    const [low, high] = this.motion.limits;
    this.motion.x = Math.max(low, Math.min(high, x));
    this.motion.begin('idle-floor');
    this.play('carry-release');
  }
  resize(width, bodyWidth) { this.motion.resize(width, bodyWidth); }
  schedule() {
    if (this.carrying || this.clip && !['idle-lie', 'lie-seat'].includes(this.clip.id)) return;
    if (this.life.pending) {
      this.interrupt();
      this.play(`${this.life.pending}-floor`);
    } else if (this.queue) {
      if (!this.roaming && this.clip) { this.play('wake-seat'); return; }
      this.interrupt();
      this.queue--;
      this.play('eat-floor');
    }
  }
  finish() {
    const id = this.clip.id;
    this.clip = null;
    if (this.carrying) { this.play('carry-hang'); return; }
    if (this.life.pending || this.queue) { this.schedule(); return; }
    if (!this.roaming) this.play(['lie-seat', 'idle-lie'].includes(id) ? 'idle-lie' : 'lie-seat');
    else this.motion.begin('idle-floor', 18);
  }
  advance(seconds, age = true) {
    let remaining = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    // Bound steps so due meals and cel markers are never skipped by a slow frame.
    while (remaining > 1e-9) {
      const delta = Math.min(remaining, 1 / this.atlas.fps);
      remaining -= delta;
      if (age) this.life.advance(delta);
      this.schedule();
      if (this.clip) {
        const clip = this.clip, sequence = this.atlas.sequences[clip.id];
        clip.elapsed += delta;
        const frame = clip.elapsed * this.atlas.fps;
        if (sequence.swallow !== undefined && frame >= sequence.swallow && !clip.swallowed) {
          clip.swallowed = true;
          this.life.swallow();
          this.events.push({type: 'swallow', treats: this.life.treats});
        }
        if (sequence.deposit !== undefined && frame >= sequence.deposit && !clip.deposited) {
          clip.deposited = true;
          const kind = this.life.deposit();
          if (kind) this.events.push({type: 'deposit', kind, pose: this.sample()});
        }
        if (frame >= sequence.frames.length - 1e-7) this.finish();
      } else this.motion.advance(delta);
    }
    return this.sample();
  }
  sample() {
    if (!this.clip) return this.motion.sample();
    const sequence = this.atlas.sequences[this.clip.id];
    const index = Math.min(sequence.frames.length - 1, Math.floor(this.clip.elapsed * this.atlas.fps));
    const frame = sequence.frames[index];
    return {x: this.motion.x, size: this.motion.size, facing: -this.motion.direction,
      cell: frame.cell, lift: 0, action: this.clip.id, frame: index,
      grip: frame.grip, falling: frame.falling};
  }
  takeEvents() { return this.events.splice(0); }
}
