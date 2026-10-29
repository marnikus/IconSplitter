# Upload (`stockUpload`) — Stock FTPS, SFTP & Getty ESP Uploader

Handles: [selectors/stock-upload](../selectors/stock-upload.md) · Invariants: [I-80, I-81](invariants/upload.md#i-80).

## 1. Strict `export/` + `export.json` discovery (`src/lib/stockupload/discovery.ts`)

When scanning a picked workspace root (or when the root folder itself is named `export`), the `"Upload"` tab includes **only** files that satisfy both conditions ([I-80](invariants/upload.md#i-80)):
1. Reside inside a folder named `export` containing a valid committed `export.json` (`timestamps.committedAt !== null`).
2. Are explicitly listed in `record.outputs.{jpg,svg,eps}` AND physically exist on disk (`size > 0`).

Unrecorded files inside `export/`, uncommitted records, and source files outside `export/` are excluded; corrupt or unreadable `export.json` files and missing recorded outputs surface explicit warnings.

## 2. Row controls, metadata re-embedding & unified general badges

- **Preview (`StockUploadPreview.tsx`)**: scales with the pinned thumbnail zoom slider (`stock-upload-zoom`), rendering available `JPEG/PNG` (revoked blob URL) first, else `SVG`, else an `EPS` badge.
- **Identity & Location**: shows `<stem>`, primary `export/` path, available formats, and `Location` (`copyFolderText`).
- **Unified row badges (`src/lib/upload/rowbadge.ts`)**: shares `iconSplitter.upload.rowBadges.v1` and global undo `uploadRowBadges` with `"SVG to upload"` via one single general badge catalog. Hardcoded stock badges (`HARDCODED_STOCK_BADGES`: `Shutterstock`, `Adobe Stock`, `Getty Images`) plus any added custom stock badges live in this same catalog and are automatically assigned to an item row (`assignNamedBadge`) as soon as a file is uploaded to that stock, filterable via `stock-filter-badge`.
- **Local metadata (`src/stockupload/metaembed.ts`)**: clicking a row expands editable `Title`, `Description`, `Tags`, `Creator`, and `Copyright` (no AI controls). `Accept & embed` validates (`validateMetadata`) and atomically re-embeds XMP/IPTC/RDF in-place into existing `export/<stem>.{jpg,svg,eps}` files before updating `export.json`.

## 3. Stock presets, Getty Images ESP rules & local-only credentials

- **Presets (`src/lib/stockupload/presets.ts`, `iconSplitter.stockUpload.presets.v1`)**: seeded with three built-in stock sites:
  - **Shutterstock** (`ftps.shutterstock.com`, port `21`, `ftps-explicit` / `AUTH TLS`, remote folder `/`, standalone `JPG` or `EPS`).
  - **Adobe Stock** (`sftp.contributor.adobestock.com`, port `22`, `sftp` SSH-2 / SFTP v3, remote folder `/`; SFTP Member ID + generated SFTP password; standalone `SVG`/`EPS`/`JPG`/`PNG`, max `45 MB`, `1–200` char title, `5–49` keywords, no `.zip` or subfolders).
  - **Getty Images** (default `esp-batch`: **Getty ESP Batch Folder** into `<root>/_getty_esp_batches/<batch>/` for `esp.gettyimages.com` & **DeepMeta 4** `deepmeta.creativ.zone` — works for all contributors without partner API keys; switchable to `esp-https` **Getty ESP Partner API** via OAuth2 PKCE at `authentication.gettyimages.com` + `api.gettyimages.com:443/esp/submission/v1/submission_batches`, or `sftp`/`ftps-explicit` for account-specific servers). Vector submissions require **paired same-basename `<stem>.eps` + RGB `<stem>.jpg`** (AI10/CS6 EPS + RGB JPEG min `1900×2800 px`, `4075×4075 px` recommended, max `50 MB`, max `50` keywords, no `.svg`/`.zip`, no generative AI). Includes one-click **`Download ESP CSV`** (`src/lib/stockupload/gettycsv.ts`) and flat batch staging (`src/stockupload/espstage.ts`).
- **Credentials (`src/lib/stockupload/credvault.ts`, [I-81](invariants/upload.md#i-81))**: login/username, password, and optional Getty ESP `apiKey`/`apiSecret` live **only** in IndexedDB `iconSplitter/secrets` (`stock-ftp-cred:<presetId>`, session fallback if blocked). Never written to `localStorage`, `export.json`, presets, or logs, and **never expanded** in the UI.

## 4. Multi-target transfer (`src/stockupload/espstage.ts`, `tools/bridge/{ftps,sftp,esp}/`)

- **Pinned bar**: thumbnail zoom slider, `Apply badges`, same-stem format checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP` packed deterministically in memory via `JSZip` without `export.json`), multi-upload target site checkboxes, and `Upload`.
- **Confirmation & runner (`src/stockupload/runupload.ts`)**: `Upload` opens a preflight confirmation modal. `esp-batch` targets stage paired files + `getty_esp_metadata.csv` directly into `<root>/_getty_esp_batches/<batch>/` via the File System Access handle (never polluting `export/` discovery, `RULE 23` non-overwriting). Network targets (`ftps-explicit`, `sftp`, `esp-https`) send sequentially through the local loopback helper (`http://127.0.0.1:47391`, including OAuth2 PKCE `/esp/oauth/{start,callback,status}` against `authentication.gettyimages.com` + `/v3/countries` 403 permission diagnostics), assigning the unified stock badge on completion.

## 5. Experimental Getty web helper (local, assisted)

`run_getty_web.bat` / `node tools/getty-web/run.mjs` is a separate interactive local helper for a **previously staged** `esp-batch` folder, not a new network protocol in the Upload tab. Install repository dependencies, then install its browser once with `npx playwright install chromium`. The user supplies the stage folder and a batch name, reviews the exact EPS/JPG list, asserts permission/content compliance and confirms. The helper starts a visible isolated Chromium browser; the user signs in with Getty credentials and handles MFA. It uses the contributor-provided batch-list/create-dialog selectors for a new iStock creative illustration batch, then the user opens the batch's upload form and confirms again. The helper selects files only if the same Getty batch page has exactly one multiple-file input explicitly accepting EPS and JPEG; otherwise it keeps the browser open for manual selection. It never uploads the CSV or submits for inspection. The browser and console must remain open; minimize them for background transfer. Closing either, sleep or a connection interruption can stop it.

**Experimental, not verified against a live Getty account:** batch navigation, file input and Getty upload completion may differ. File selection is not proof of receipt; the user must check each result in Getty before retrying. No status or uploaded badge is written by this helper. The existing staging path separately records its own legacy badge/status, which is **not proof of remote upload**. `tools/getty-web/files.mjs` verifies pair names/count/size and snapshots only the listed files into a private temporary directory; it removes the snapshot on normal exit, but an abrupt kill may leave `iconsplitter-getty-` directories in the OS temp folder. Browser credentials are entered directly on Getty and are not passed through the app, CLI or helper; a fresh ephemeral browser session is used per run. `tests/getty_web_bridge.test.ts` tests the local logic against fakes, not Getty.
