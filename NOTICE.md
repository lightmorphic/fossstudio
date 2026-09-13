# Notice

## Who wrote FOSSStudio

FOSSStudio is written by Lightmorphic Ltd (registered in England and
Wales, company number 17423646). Every line of the application, its web
pages, its stylesheets and its compositors is Lightmorphic's own work,
written for this project. No code has been merged from anyone outside
the company, and `CONTRIBUTING.md` explains why that is deliberate.

The project is released to the public under the GNU General Public
Licence v3 (`LICENSE`). Because Lightmorphic owns the copyright in the
whole of it, Lightmorphic can also release the same code under other
terms, and does: the hosted service at
[castmorphic.com](https://castmorphic.com) runs it. That is the owner's
right over its own work. It takes nothing away from the AGPL grant you
have here, which is permanent and cannot be withdrawn.

This file exists so that anyone can check that claim rather than take
it on trust. Everything below is the complete list of material in this
repository that Lightmorphic did **not** write.

## Bundled third-party code

These files are checked into the repository and served to browsers. All
three are permissively licensed, so none of them constrains what
Lightmorphic may do with its own code.

### hls.js

* **What:** the HLS player on the watch page, so a live stream plays in
  browsers that have no native HLS (everything except Safari).
* **Where:** `web/assets/hls.min.js` (version 1.5.20, the project's own
  minified build, used unmodified).
* **Whose:** Dailymotion and the hls.js contributors.
* **Licence:** Apache-2.0.
* **From:** <https://github.com/video-dev/hls.js>

### mediasoup-client

* **What:** the browser half of the media engine: it negotiates the
  WebRTC transports that carry camera and microphone between guests and
  the server.
* **Where:** `web/assets/mediasoup-client.js`, an esbuild bundle of the
  npm package and nothing else. It is rebuilt with
  `npm run build:client` from `server/client/mediasoup-client-entry.js`,
  which is one `export * from "mediasoup-client"` line.
* **Whose:** Iñaki Baz Castillo, José Luis Millán and the mediasoup
  authors.
* **Licence:** ISC.
* **From:** <https://github.com/versatica/mediasoup-client>

### RNNoise, via @jitsi/rnnoise-wasm

* **What:** noise suppression in the guest's browser. The microphone
  passes through RNNoise in 480-sample frames before it reaches the
  room.
* **Where:** `web/assets/noise-worklet.js`. This file is a bundle of two
  things: the AudioWorklet processor in
  `server/client/noise-worklet-entry.js`, which is Lightmorphic's own
  code, and the WebAssembly build of RNNoise it calls into, which is
  not. It is rebuilt with `npm run build:worklet`.
* **Whose:**
  * The WebAssembly build is `@jitsi/rnnoise-wasm` 0.2.1, by 8x8 Inc
    (Jitsi), under **Apache-2.0**.
    <https://github.com/jitsi/rnnoise-wasm>
  * The RNNoise library compiled into it is by Jean-Marc Valin and
    Xiph.Org / Mozilla, under **BSD-3-Clause**.
    <https://github.com/xiph/rnnoise>
  * The Emscripten runtime glue around it is by the Emscripten authors,
    under **MIT**.

Because that one file mixes our code with theirs, treat the whole of
`web/assets/noise-worklet.js` as carrying the Apache-2.0, BSD-3-Clause
and MIT notices above.

### Manrope

* **What:** the typeface the pages are set in.
* **Where:** `web/fonts/Manrope.woff2`, and a second copy at
  `docs/Manrope.woff2` for the project website.
* **Whose:** Mikhail Sharanda.
* **Licence:** SIL Open Font Licence 1.1. The full text ships beside
  each copy as `OFL.txt`.
* **From:** <https://github.com/sharanda/manrope>

The font is bundled rather than fetched from a font service, so that an
instance behind a firewall renders and no visitor's browser is made to
call a third party.

### Brand outlines in the off-air game

* **What:** the watch page shows a small game while a show is off air,
  in which the asteroids are big technology companies' logos. The
  outlines are 24x24 path data.
* **Where:** `web/js/offair.js`, and a copy at `docs/offair.js` for the
  project website.
* **Whose:** the Simple Icons project.
* **Licence:** CC0-1.0, which waives copyright in the drawings.
* **From:** <https://github.com/simple-icons/simple-icons>

CC0 settles copyright and nothing else. The marks themselves are their
owners' trademarks, drawn here as the target of a joke about lock-in.
If you fork FOSSStudio, that is your judgement to make, not a right the
AGPL or CC0 gives you.

## Runtime dependencies

Four npm packages, all installed unmodified from the public registry
and shipped inside the container image. Their transitive tree is 97
packages; every one is MIT, ISC, BSD-3-Clause, Apache-2.0 or
BlueOak-1.0.0, except `web-push` as noted.

| Package | Whose | Licence |
|---|---|---|
| `express` 4 | OpenJS Foundation and contributors | MIT |
| `mediasoup` 3 | Iñaki Baz Castillo, José Luis Millán and contributors | ISC |
| `ws` 8 | Einar Otto Stangvik and contributors | MIT |
| `web-push` 3 | Google and contributors | **MPL-2.0** |

`web-push` is the only copyleft dependency. MPL-2.0 is file-level: it
obliges whoever changes *its* files to publish those changes. We use it
as published and change nothing in it, so nothing in FOSSStudio's own
code is affected, and it does not limit what Lightmorphic may do with
its own work.

Build and test tools (`esbuild`, `playwright`, `mediasoup-client`,
`@jitsi/rnnoise-wasm`) are `devDependencies`. They are not in the
container image; the bundles they produce are covered above.

## Things the software runs inside, but does not contain

Separate programs under their own licences, distributed alongside
FOSSStudio in the published container image rather than combined with
it.

| What | Whose | Licence |
|---|---|---|
| Node.js (`node:22-bookworm-slim` base image) | OpenJS Foundation | MIT |
| Debian bookworm (base image) | Debian | mixed, mostly GPL/MIT/BSD |
| ffmpeg (recording, streaming, level matching) | FFmpeg project | LGPL-2.1-or-later as packaged by Debian |
| zip (recording bundles) | Info-ZIP | Info-ZIP licence, BSD-like |
| Caddy (the reverse proxy in the example compose files) | Light Code Labs | Apache-2.0 |

## Artwork and media

* `server/assets/subscribe.mp4` is the subscribe overlay. It was
  rendered for FOSSStudio (see the commit "Stream overlays (subscribe +
  ad banner), raise hand, red mute lights"); the encoder was x264,
  which does not make its output a derivative work.
* `server/assets/banned-words.txt` is a starting word list written for
  the chat filter, meant to be replaced by the operator's own copy at
  `data/banned-words.txt`.
* `web/icons/icon-192.png`, `web/icons/icon-512.png` and
  `docs/icon.png` are FOSSStudio's own icon.
* The screenshots under `docs/shots/` are of FOSSStudio itself.
* The Lightmorphic logo (`docs/lightmorphic-dark-tb-250x50-sq.webp`) is
  Lightmorphic's trademark. The AGPL covers the code, not the brand:
  remove it if you fork this and publish it as your own thing.
