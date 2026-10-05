// SPDX-License-Identifier: AGPL-3.0-only
// Drop-in decorative companion. Movement remains in the shared KurtMotion.
import {KurtMotion} from './kurt-motion.mjs';

export class KurtCompanion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'}).innerHTML = `
      <style>
        :host { display:block; min-width:0; color:inherit; }
        canvas { display:block; width:100%; height:160px; }
        footer { display:flex; align-items:center; justify-content:space-between; gap:1em; font:12px/1.5 system-ui,sans-serif; }
        button { font:inherit; color:inherit; background:transparent; border:1px solid currentColor; border-radius:1em; padding:.25em .8em; cursor:pointer; }
        a { color:inherit; }
        [hidden] { display:none; }
      </style>
      <canvas role="img" aria-label="Kurt, an animated pug"></canvas>
      <footer><button type="button" aria-pressed="false" hidden>Pause Kurt</button>
      <span><a href="https://github.com/ralleur/kurt">Kurt by Ralleur</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>
      <span role="status"></span>`;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.control = this.shadowRoot.querySelector('button');
    this.status = this.shadowRoot.querySelector('[role=status]');
    this.paused = false;
    this.visible = true;
    this.timer = 0;
  }
  connectedCallback() {
    this.abort = new AbortController();
    const {signal} = this.abort;
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.control.addEventListener('click', () => { this.paused = !this.paused; this.sync(); }, {signal});
    this.motionPreference.addEventListener('change', () => { this.draw(); this.sync(); }, {signal});
    document.addEventListener('visibilitychange', () => this.sync(), {signal});
    this.resizeObserver = new ResizeObserver(() => {
      if (this.motion) this.motion.resize(this.clientWidth, 64);
      this.draw();
    });
    this.resizeObserver.observe(this);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.sync();
    });
    this.intersectionObserver.observe(this);
    this.load(signal);
  }
  disconnectedCallback() {
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    cancelAnimationFrame(this.timer);
    this.timer = 0;
    this.lastTime = null;
  }
  async load(signal) {
    this.status.textContent = '';
    try {
      const base = this.hasAttribute('assets')
        ? new URL(this.getAttribute('assets').replace(/\/?$/, '/'), document.baseURI)
        : new URL('./assets/', import.meta.url);
      const response = await fetch(new URL('manifest.json', base), {signal});
      if (!response.ok) throw new Error('Missing atlas');
      const atlas = await response.json();
      const pages = await Promise.all(atlas.pages.map(async name => {
        const image = new Image();
        image.src = new URL(name, base);
        await image.decode();
        return image;
      }));
      if (signal.aborted) return;
      this.atlas = atlas;
      this.pages = pages;
      this.motion = new KurtMotion(atlas, this.clientWidth, 64);
      this.control.hidden = false;
      this.draw();
      this.sync();
    } catch (error) {
      if (signal.aborted) return;
      this.status.textContent = 'Kurt could not load. Check the assets path.';
      this.dispatchEvent(new CustomEvent('kurt-error', {detail: error}));
    }
  }
  sync() {
    const reduced = this.motionPreference.matches;
    const running = this.isConnected && this.motion && this.visible && !this.paused && !reduced && !document.hidden;
    this.control.disabled = reduced;
    this.control.textContent = reduced ? 'Reduced motion' : this.paused ? 'Resume Kurt' : 'Pause Kurt';
    this.control.setAttribute('aria-pressed', String(this.paused || reduced));
    cancelAnimationFrame(this.timer);
    this.timer = 0;
    this.lastTime = null;
    if (running) this.timer = requestAnimationFrame(time => this.tick(time));
  }
  tick(time) {
    this.motion.advance(this.lastTime === null ? 0 : Math.min(.1, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.draw();
    this.timer = requestAnimationFrame(now => this.tick(now));
  }
  draw() {
    if (!this.motion || !this.clientWidth) return;
    const width = this.clientWidth, height = 160, ratio = Math.min(devicePixelRatio || 1, 2);
    const atlas = this.atlas;
    let pose = this.motion.sample();
    if (this.motionPreference.matches) pose = {...pose, cell: atlas.sequences['walk-floor'].frames[0].cell, lift: 0};
    const context = this.canvas.getContext('2d');
    const pixels = Math.round(width * ratio);
    if (this.canvas.width !== pixels || this.canvas.height !== height * ratio) {
      this.canvas.width = pixels;
      this.canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const page = Math.floor(pose.cell / atlas.cellsPerPage), cell = pose.cell % atlas.cellsPerPage;
    context.save();
    context.translate(pose.x, height - 8 - pose.lift);
    context.scale(pose.facing, 1);
    context.drawImage(this.pages[page], cell % atlas.columns * atlas.cell, Math.floor(cell / atlas.columns) * atlas.cell,
      atlas.cell, atlas.cell, -atlas.anchor.x * pose.size, -atlas.anchor.y * pose.size, pose.size, pose.size);
    context.restore();
    this.canvas.dataset.action = pose.action;
  }
}

if (!customElements.get('kurt-companion')) customElements.define('kurt-companion', KurtCompanion);
