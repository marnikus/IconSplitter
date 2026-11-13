# Adobe Stock ingestion validation

[Embedded metadata](upload-file-metadata.md) · [Upload](upload.md)

## Evidence levels — do not confuse them

1. Local XMP/IPTC readback proves bytes were embedded, not Adobe ingestion.
2. ExifTool proves another reader extracts them, still not Adobe ingestion.
3. A saved Adobe page is captured UI/state, not an executable Adobe importer.
4. Only a NEW upload through LIVE Adobe, followed by matching new server data
   AND the selected asset's displayed fields, passes Adobe acceptance.

`Contributors Uploaded Files.html` and its saved bundles are user fixtures.
The frontend requests `/uploads/presign` then sends multipart `file` bytes to
server-provided storage; its metadata comes from server assets. There is no
local XMP/IPTC extractor to replay as Adobe's importer. Never inject the local
reader's values into the saved form and call that an Adobe test.

The supplied snapshot has empty serialized title/keyword textareas, BUT its
URL-encoded Redux initializer contains nonempty titles and keywords for both
EPS names. This does not show whether metadata was imported or entered manually.
The original supplied EPS has NO XMP/IPTC. Exact fresh failing JPEG/EPS exports
are needed to identify an exporter bug. Do not change carriers speculatively.

## Automated saved-page/tool tests

`tests/adobe_stock_validation.test.ts` uses the actual snapshot/bundles, checks
its native upload/title/keyword selectors and parses ONLY asset metadata from
saved state. It parses isolated form-control markup, never loads captured
scripts, CSS, images, frames or endpoints. Account/session configuration is not
copied to reports. Tests cover origin/permission guards, exact fields, stale
assets, missing metadata, timeout failure and CLI refusal without permission.
These tests passing is explicitly NOT live Adobe acceptance.

No snapshot assets or original artwork are edited. The saved page may contain
account/session data: do not publish or execute it as an authenticated session.
No credentials, cookies or tokens from it are replayed.

## Live test in your own browser

`tools/adobe-stock-acceptance.mjs` is an opt-in real-upload validator. It requires
an existing authenticated Chrome/Chromium **test profile** in your environment,
not sandbox localhost or a saved page. We do not receive/store your credentials.

1. Install the optional test driver OUTSIDE the repository, e.g.
   `npm install --prefix ../iconsplitter-adobe-validation playwright-core`.
   No Playwright/browser dependency is added to the application.
2. Start Chrome with a dedicated test profile and local CDP, for example:
   `chrome --remote-debugging-port=9222 --user-data-dir=<your-test-profile>`.
   Sign in yourself, open exactly one live
   `https://contributor.stock.adobe.com/uploads` tab. Use the page's paste-keywords
   textarea mode as captured in the fixture, and keep any other work separate.
   Never expose the debugging port outside your machine.
3. Create a local manifest of NEW exports with accepted metadata. Paths are
   relative to that manifest. Example (replace values with exact file metadata):

```json
{"files":[
  {"path":"exports/test.jpg","metadata":{"title":"Temporary metadata test","tags":["icon","test","vector","line","example"]}},
  {"path":"exports/test.eps","metadata":{"title":"Temporary metadata test","tags":["icon","test","vector","line","example"]}}
]}
```

4. Run from the repository root (adjust platform paths):

```sh
node tools/adobe-stock-acceptance.mjs --cdp http://127.0.0.1:9222 --manifest path/to/manifest.json --playwright ../iconsplitter-adobe-validation/node_modules/playwright-core --allow-upload --report coverage/adobe-stock-acceptance.json
```

`--allow-upload` explicitly authorizes creating draft test uploads in Adobe.
The tool uploads uniquely named copies of the exact bytes (SHA-256 recorded),
never overwrites original files, and listens only to NEW successful JSON
responses from the real Adobe origin. An older same-name asset, saved Redux,
local parsed metadata or third-party response cannot pass. It waits up to three
minutes per server/UI step, identifies the unique new thumbnail, selects it and
READS Title/Keywords. Expected title and ordered tags must match in BOTH server
response and selected UI. Missing metadata/processing failure/timeouts/UI
changes exit nonzero; none become green skips. The captured form has no separate
Description field, so this command makes no claim about a displayed description.

It never fills metadata controls, patches metadata endpoints, submits/publishes
or deletes assets. Draft copies remain in your account for you to inspect and
remove yourself. It disconnects its CDP client when done. Use a dedicated test
browser/profile rather than a browser holding unrelated unsaved work.

Choose a new `.json` report path for each run; existing reports are never
overwritten. Each report has a unique run ID and start time.
The report contains file hashes/names and match status only, no account state,
response bodies, headers, cookies or tokens. It belongs under ignored coverage,
not in Git. `PASS` is printed ONLY after actual live server/UI confirmation.

## Current acceptance status

**LIVE ADOBE INGESTION: NOT RUN here.** This environment cannot reach Adobe and
has no authenticated Adobe session. The saved HTML cannot supply its backend.
A runnable live check and local contract tests do not fix or certify the user's
reported import failure. Capture exact failing exported bytes and run the live
check in the user's environment before declaring that issue resolved.
