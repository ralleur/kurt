# Kurt

A lovingly drawn pug for your website. Kurt wanders, watches, sits down and
takes his time — a little company, inspired by eSheep and Tamagotchi.

![Kurt, the approved neutral drawing](references/neutral-master.png)

**[Download the website package](https://github.com/ralleur/kurt/releases/latest)**
and copy its `kurt/` folder to your website. Then add:

```html
<script type="module" src="/kurt/kurt-element.mjs"></script>
<kurt-companion></kurt-companion>
```

That's it. No framework, API key, account, CDN, tracking or build step.
The download includes an `index.html` example. Serve it over HTTP to try it;
ES modules and asset loading do not work reliably with a `file://` URL.

The responsive component keeps Kurt inside its own area and provides pause,
reduced-motion support and automatic suspension while hidden. Artwork credit
is included. This simple embed is decorative; the lower-level behavior module
also exposes feeding and carrying for custom integrations.

**Web code: AGPL-3.0-only. Artwork: CC BY 4.0.** You can use Kurt on personal and
commercial sites. Keep the software notice and credit the artwork; indicate
artwork changes. See [licenses](LICENSE.md) and [attribution](ATTRIBUTION.md).

## Customize or contribute

- [Website setup and API](docs/website.md)
- [Build the artwork and update consumers](docs/development.md)
- `runtime/web/`: shared motion, behavior and the drop-in Web component.
- `runtime/ios/`: native motion, room geometry, digestion and renderer.
- `source/`: registered drawings and the reproducible animation build.
- `assets/`: the approved `kurt-a-refined-12` atlas: 27 pages and 2,324 frames
  including held and repeated drawings.
- `references/`: approved casting A and neutral body reference.

Kurt originated in Hauser and also appears in the Mutti installer and on the
Ralleur website. This is their shared source of truth. Existing iOS and
Mutti components retain their original AGPL/GPL licenses; they are not part
of the website download.

To build the website package yourself (Python 3.10+):

```sh
python3 -m pip install -r requirements.txt
python3 tools/package-web.py
python3 -m http.server 8080 --directory .build/web
```

Open `http://localhost:8080`. The ZIP is written to `.build/`.
`npm test` runs the export, behavior and synchronization checks. Node and
`npm ci` are needed when rebuilding the artwork with `npm run artwork`.

Contributions should preserve Kurt's approved proportions, grounded paws,
independent pupil movement and deliberate hand-drawn timing. Existing files
retain their license; use the same license for contributions to those files.
