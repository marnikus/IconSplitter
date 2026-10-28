# Upload (`stockUpload`) — Stock FTPS & SFTP Uploader

Handles: [selectors/stock-upload](../selectors/stock-upload.md) · Invariants: [I-80, I-81](invariants/upload.md#i-80).

## 1. Strict `export/` + `export.json` discovery (`src/lib/stockupload/discovery.ts`)

When scanning a picked workspace root (or when the root folder itself is named `export`), the `"Upload"` tab includes **only** files that satisfy both conditions ([I-80](invariants/upload.md#i-80)):
1. Reside inside a folder named `export` containing a valid committed `export.json` (`timestamps.committedAt !== null`).
2. Are explicitly listed in `record.outputs.{jpg,svg,eps}` AND physically exist on disk (`size > 0`).

Unrecorded files inside `export/`, uncommitted records, and source files outside `export/` are excluded; corrupt or unreadable `export.json` files and missing recorded outputs surface explicit warnings.

## 2. Row controls, metadata re-embedding & shared badges

- **Preview (`StockUploadPreview.tsx`)**: scales with the pinned thumbnail zoom slider (`stock-upload-zoom`), rendering available `JPEG/PNG` (revoked blob URL) first, else `SVG`, else an `EPS` badge.
- **Identity & Location**: shows `<stem>`, primary `export/` path, available formats, and `Location` (`copyFolderText`).
- **Row badges**: shares `iconSplitter.upload.rowBadges.v1` and global undo `uploadRowBadges` with `"SVG to upload"` via `useSyncExternalStore`.
- **Local metadata (`src/stockupload/metaembed.ts`)**: clicking a row expands editable `Title`, `Description`, `Tags`, `Creator`, and `Copyright` (no AI controls). `Accept & embed` validates (`validateMetadata`) and atomically re-embeds XMP/IPTC/RDF in-place into existing `export/<stem>.{jpg,svg,eps}` files before updating `export.json`.

## 3. Stock FTPS/SFTP presets & local-only credentials

- **Presets (`src/lib/stockupload/presets.ts`, `iconSplitter.stockUpload.presets.v1`)**: seeded with two built-in stock sites:
  - **Shutterstock** (`ftps.shutterstock.com`, port `21`, `ftps-explicit` / `AUTH TLS`, remote folder `/`, passive TLS).
  - **Adobe Stock** (`sftp.contributor.adobestock.com`, port `22`, `sftp` SSH-2 / SFTP v3, remote folder `/`; SFTP Member ID + portal-generated SFTP password; preflight warns on `.zip` archives, subfolders, `> 45 MB` files, and missing `1–200` char title / `5–49` keywords per Adobe Stock submission guidelines).
  Users can reset built-in presets or add/remove custom presets with protocol-specific fields (`ftps-explicit`, `sftp`, `ftps-implicit`, `ftp`) and server certificate / SSH host-key policies (`strict`, `pinned` SHA-256, `accept-self-signed`).
- **Credentials (`src/lib/stockupload/credvault.ts`, [I-81](invariants/upload.md#i-81))**: username / SFTP Member ID and password live **only** in IndexedDB `iconSplitter/secrets` (`stock-ftp-cred:<presetId>`, session fallback if blocked). They are never written to `localStorage`, `export.json`, presets, or logs, and are **never expanded** in the UI (status badge + blank replace inputs + `Forget`).

## 4. Multi-target, multi-format FTPS/SFTP transfer (`tools/bridge/{ftps,sftp}/`)

- **Pinned bar**: thumbnail zoom slider, `Apply badges`, same-stem format checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP` packed deterministically in memory via `JSZip` without `export.json`), multi-upload target site checkboxes, and `Upload`.
- **Confirmation & runner (`src/stockupload/runupload.ts`)**: `Upload` opens a preflight confirmation modal. Confirmed runs send files sequentially through the zero-dependency local loopback helper (`http://127.0.0.1:47391/ftps/*`, started via `run_ftp_bridge.bat` or `run_app_ftp.bat`), reusing one pooled Explicit FTPS or SFTP v3 session per target stock, isolating per-file errors, supporting mid-batch `Cancel`, and recording crash-safe status in `iconSplitter.stockUpload.{history,journal}.v1` (interrupted runs are never resent automatically).
