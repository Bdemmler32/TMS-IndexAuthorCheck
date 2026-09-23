# TMS Index Author Check v0.02

Checks the author index tags in an Adobe InDesign tagged-text export before the index is built. Everything runs in the browser, and files are never uploaded.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | Styles (TMS Conference Check look) |
| `app.js` | Parsing, checks, results, export |
| `sw.js` | Cache-busting service worker |
| `tms-logo.png` | Top-bar logo |

## Using it

1. **Choose file:** the tagged-text `output.txt` exported from InDesign (*File › Export › Adobe InDesign Tagged Text*).
2. **Choose checks:** switch checks on or off, then click **Run checks**.
3. **Results:** steps 1 and 2 fold into one-line summaries (click to reopen) and the Results links jump to each section. Export as a text log or CSV.

## Hosting on GitHub Pages

Upload everything in this `public` folder to the root of a repository, then go to **Settings › Pages** and deploy from the `main` branch, `/ (root)`.

## Releasing a new version

The service worker loads HTML, CSS and JS from the network first, so users get new files on their next visit. If a page is already open while an update lands, a **New version, reload** button appears in the top bar instead of wiping their results.

For each release, change the version number in these places:

- `sw.js`: `const VERSION = "0.02";`
- `index.html`: `?v=0.02` on `styles.css` and `app.js`, and the `app-version` meta tag
- `app.js`: `var APP_VERSION = "0.02";`
- the `v0.02` label in the top bar in `index.html`
