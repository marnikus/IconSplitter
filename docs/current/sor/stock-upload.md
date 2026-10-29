# Upload (`stockUpload`) — Stock FTPS, SFTP & Getty ESP Uploader

Handles: [selectors/stock-upload](../selectors/stock-upload.md) · Invariants: [I-80, I-81](invariants/upload.md#i-80) · Getty website automation: [Getty web upload](stock-upload-getty-web.md).

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
  - **Getty Images (web upload)** (`getty-web`, `esp.gettyimages.com/contribute`): the loopback helper launches Chrome/Edge headless, signs in with the saved contributor e-mail (or numeric contributor ID) and password, creates one batch and hands each JPEG (+ optional EPS) to the site's own uploader. See [Getty web upload](stock-upload-getty-web.md).
  - **Getty Images** (default `esp-https` at `api.gettyimages.com:443`; old local-stage presets migrate). Automatic upload requires Getty-issued ESP Submission and Ingestion API access, not merely an ESP web login or catalog API key. OAuth uses browser PKCE where supported. One illustration contribution contains its JPEG and optional matching EPS. Local multipart protocol follows the [Getty ESP tutorial](https://github.com/mpimedia/esp_api_code_examples/blob/main/tutorial%20%281%29.pdf); present-day compatibility and illustration batch type have not been verified against Getty. Metadata is embedded in exported files for ESP extraction. Uploading is not the same as submission for review. Retries after failures can leave incomplete remote contributions.
- **Credentials (`src/lib/stockupload/credvault.ts`, [I-81](invariants/upload.md#i-81))**: login/username, password, and optional Getty ESP `apiKey`/`apiSecret` live **only** in IndexedDB `iconSplitter/secrets` (`stock-ftp-cred:<presetId>`, session fallback if blocked). Never written to `localStorage`, `export.json`, presets, or logs, and **never expanded** in the UI.

## 4. Multi-target transfer (`src/stockupload/espstage.ts`, `tools/bridge/{ftps,sftp,esp}/`)

- **Pinned bar**: thumbnail zoom slider, `Apply badges`, same-stem format checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP` packed deterministically in memory via `JSZip` without `export.json`), multi-upload target site checkboxes, and `Upload`.
- **Upload-only title (`src/lib/stockupload/sendmeta.ts`)**: the default-off, locally persisted `Title + description` option freezes in the confirmation plan. It combines the accepted `export.json` title and description with a period and space in in-memory copies (JPEG XMP/IPTC, SVG RDF, EPS XMP/IPTC, PNG XMP iTXt, and supported carriers inside ZIPs), including Getty pairs. Originals and `export.json` are never written. Missing or unverifiable accepted metadata and malformed/unsupported carriers fail instead of silently uploading unchanged. Unknown non-image ZIP entries remain intact. XMP keeps the full title; legacy IPTC and stock sites may truncate it or impose title-length limits.
- **Confirmation & runner (`src/stockupload/runupload.ts`)**: `Upload` previews transfers and sends through the loopback helper. `getty-web` groups tasks per icon exactly like ESP, keeps one `sessionKey` for the target (one sign-in, one batch), and closes the pooled browser session when the target ends. ESP pairs matching JPEG/EPS in one request, creates a contribution, authorizes 10 MiB chunks using SHA-256, uploads using the returned HTTPS storage headers, and completes each file with ETags. No Getty credentials go to storage. Both completion requests must succeed before a Getty badge is assigned. A missing selected pair or unsupported format fails explicitly. Legacy `esp-batch` targets are rejected, never counted as uploads. Uploads can leave incomplete server-side contributions if interrupted; no automatic submission or publication occurs. A 403 is not proof of the exact cause; check Getty access and account permissions.
