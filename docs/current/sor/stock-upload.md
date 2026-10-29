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
  - **Getty Images** (`api.gettyimages.com`, port `443`, `esp-https` Getty ESP HTTPS API, path `/esp/submission/v1/submission_batches` for `contributors.gettyimages.com` / `esp.gettyimages.com`; switchable to `sftp` e.g. `files.transfer.brandfolder.com:22` or `ftps-explicit` e.g. `feedsftp.gettyimages.com:21`). Vector submissions require **paired same-basename `<stem>.eps` + RGB `<stem>.jpg`** (AI10/CS6 EPS + RGB JPEG min `1900×2800 px`, `4075×4075 px` recommended, max `50 MB`, max `50` keywords, no `.svg`/`.zip`, no generative AI). Includes one-click **`Download ESP CSV`** (`src/lib/stockupload/gettycsv.ts`: `file name,created date,title,description,country,brief code,keywords`) for `esp.gettyimages.com` and DeepMeta batch imports.
- **Credentials (`src/lib/stockupload/credvault.ts`, [I-81](invariants/upload.md#i-81))**: login/username, password, and optional Getty ESP `apiKey`/`apiSecret` live **only** in IndexedDB `iconSplitter/secrets` (`stock-ftp-cred:<presetId>`, session fallback if blocked). Never written to `localStorage`, `export.json`, presets, or logs, and **never expanded** in the UI.

## 4. Multi-target transfer (`tools/bridge/{ftps,sftp,esp}/`)

- **Pinned bar**: thumbnail zoom slider, `Apply badges`, same-stem format checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP` packed deterministically in memory via `JSZip` without `export.json`), multi-upload target site checkboxes, and `Upload`.
- **Confirmation & runner (`src/stockupload/runupload.ts`)**: `Upload` opens a preflight confirmation modal. Confirmed runs send files sequentially through the zero-dependency local loopback helper (`http://127.0.0.1:47391/ftps/*`, started via `run_ftp_bridge.bat` or `run_app_ftp.bat`), reusing one pooled Explicit FTPS, SFTP v3, or Getty ESP HTTPS batch session per target stock, isolating per-file errors, supporting mid-batch `Cancel`, and recording crash-safe status in `iconSplitter.stockUpload.{history,journal}.v1`.
