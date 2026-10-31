# Quarterbloom — landing page

Static site for Quarterbloom, a calm rotation puzzle made from Vietnamese cement tiles:
`index.html` (landing), `privacy.html` (Privacy Policy URL), `support.html` (Support URL)
and `play/`, the web build of the game (Chapter I and the daily tile).
No build step and no third-party requests.

Live: https://nguyenvanlamm.github.io/quarterbloom-site/

The web build in `play/` is built for the `/quarterbloom-site/play/` path, so preview from the
parent folder:

```bash
cd .. && python3 -m http.server 8090   # http://localhost:8090/quarterbloom-site/
```

Published by GitHub Pages from the root of `main`.

## Files

- `assets/css/site.css`: every page's styles.
- `assets/js/home.js`: the landing page's playable floor (Levels 1–8), figures, rooms and today's daily floor.
- `assets/js/quarterbloom-engine.js`: the game's rules ported to JavaScript (Levels 1–36 and the daily tile give the same boards as the app).
- `assets/img/`: logo, icons, four WebP captures of the app, and the share card `share-card.jpg` (1200×630, the `og:image` of every page).
- Fonts: Marcellus and Jost (SIL Open Font License, see `assets/fonts/OFL-*.txt`).

## Updating the web build

From the game repository:

```bash
flutter build web --release --no-source-maps --no-web-resources-cdn \
  --base-href /quarterbloom-site/play/ \
  --dart-define=SHARE_URL=https://nguyenvanlamm.github.io/quarterbloom-site/
rm -rf ../quarterbloom-site/play
rsync -a --exclude '*.map' --exclude '*.symbols' --exclude .last_build_id build/web/ ../quarterbloom-site/play/
```

The game's `web/flutter_bootstrap.js` loads CanvasKit and the engine's default font (Roboto,
SIL OFL) from the build itself, so the web game makes no requests to Google's servers either.
Keep `--no-source-maps`: a source map would publish the game's Dart source.

## Search and AI files

`sitemap.xml`, `llms.txt`, the JSON-LD in each page and the Markdown copies `index.html.md`,
`privacy.html.md` and `support.html.md` repeat the pages' text. When a page changes, update its
`.html.md`, `llms.txt`, the JSON-LD and the sitemap `lastmod` in the same commit. Crawlers read
robots.txt only at the host root (`nguyenvanlamm.github.io/robots.txt`), which this repo cannot serve.

## Before launch

Swap the "Coming soon" badges (hero and closing section) for the official App Store and
Google Play badges and links, and add the `apple-itunes-app` meta tag (see the comment in
`index.html`). Add the store URLs to the JSON-LD and replace "coming soon" in `llms.txt` and
`index.html.md`.
