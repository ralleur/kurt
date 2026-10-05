# Add Kurt to a website

Download the ZIP from https://github.com/ralleur/kurt/releases/latest.
Copy the complete `kurt/` folder into your site's public files, then include:

```html
<script type="module" src="/kurt/kurt-element.mjs"></script>
<kurt-companion></kurt-companion>
```

The folder contains the JavaScript source, compact atlases, animation data,
attribution and licenses. It needs no build system or server-side code.
Serve `.mjs` files with a JavaScript MIME type. The included `index.html` is
a working example; test over HTTP, not by double-clicking it as a local file.

## Layout and asset location

The element takes its parent's width and reserves about 190px vertically.
Give the parent enough room for Kurt. Colors inherit from the surrounding
page and the canvas is transparent.

```html
<div style="max-width: 720px; margin: auto">
  <kurt-companion></kurt-companion>
</div>
```

Assets are loaded relative to `kurt-element.mjs`. You can change their folder
before connecting the element:

```html
<kurt-companion assets="/images/kurt/"></kurt-companion>
```

The manifest and all image files must remain together. Keep a release's
runtime and assets together when updating. Every element has its own clock;
removing it disconnects observers and stops playback.

The pause control is keyboard accessible. Reduced motion displays a stable
pose. A hidden browser tab or offscreen component suspends the animation.
Load errors display a short message and emit a `kurt-error` event.

## Custom behavior

The small component plays Kurt's decorative routine. It does not add feeding,
dragging or page-surface detection to your website. For a custom integration,
import `KurtMotion` from `kurt-motion.mjs` or `KurtBehavior` from
`kurt-behavior.mjs` and supply the included `assets/manifest.json`.

`KurtMotion(atlas, width, bodyWidth)` provides `advance(seconds)`, `sample()`
and `resize(width, bodyWidth)`. A pose contains `cell`, `x`, `size`, `facing`,
`lift`, `action` and `frame`. The supplied component demonstrates rendering.

`KurtBehavior` adds `feed()`, `pickUp()`, `place(width, x, roaming)`,
`advance(seconds)`, `sample()` and `takeEvents()`. Pass only active, unpaused
time. Consume `swallow` and `deposit` events once; your UI owns waste placement,
cleanup, pointer interaction and supporting surfaces. The existing behavior
tests show timing and interruption examples.

## Credit and license

Web JavaScript: AGPL-3.0-only. Artwork/animation data: CC BY 4.0. Personal and commercial
reuse is allowed. Keep the supplied license notices and credit Kurt by Ralleur
with a license link; indicate changes to the artwork. The component displays
the credit already. Custom renderers can put it in their footer or credits.

Full details: https://github.com/ralleur/kurt/blob/main/LICENSE.md.
