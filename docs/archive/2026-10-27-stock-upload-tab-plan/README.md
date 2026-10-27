# "Upload" Tab (Stock FTP/FTPS Uploader) — Problem Analysis, Architecture & Implementation Plan

Date: 2026-10-27  
Baseline commit: `c69aba8` (`arena/624048c3-iconsplitter`)  
Status: **Design & step-by-step plan only — NO production or test code modified**

---

## 1. Problem Understanding & Scope

Icon Splitter currently ends its five-tab pipeline at **SVG to upload** (`src/upload/`), which prepares approved SVGs into validated local per-icon packages under `<pair-folder>/export/` (`<stem>.svg`, `<stem>.jpg`, `<stem>.eps`, plus `export.json`) with embedded XMP/IPTC/RDF metadata. Today, transferring those finished packages to stock agencies requires manually collecting files and uploading them in external FTP clients (FileZilla, Cyberduck, WinSCP).

We need a **6th top-level tab named `"Upload"`** (`tab: "stockUpload"`) dedicated to **uploading already-exported icon packages to stock agencies over FTP/FTPS**, inheriting its core list/workspace UX from **SVG to upload** while removing all SVG preparation, artboard decoration, and AI-generation controls.

### 1.1 Inherited vs. Removed Functionality from "SVG to upload"

| Area | Keep / Inherit on `"Upload"` | Omit from `"Upload"` (remains in `"SVG to upload"`) |
|---|---|---|
| **Top folder bar** | `Open folder`, `↻ Rescan`, recursive audit summary, and full captured OS path (`OpenFolderButton` + `FolderPathRow`) | — |
| **Root discovery** | Strict **exported-only** rule: parse ONLY folders named `export` containing a committed `export.json`, and include ONLY files recorded as exported in `export.json` that also exist in that `export/` folder | `.svg.json` pair-approval walk, `EXPORT_IGNORE` rule, source `*_AI.svg` version picking |
| **Top workspace widgets** | Stock FTP preset dropdown + varying per-stock connection settings + local-only credentials; Row Badges filter + `Badges…` catalog manager; Search / Upload-status / Metadata filters & Sort (including selection/state sort) | Gemini prompt editor & prompt presets, Gemini API card / model check, paid-request confirmation |
| **Pinned top bulk bar** | Sticky `.svg-bulkbar-pin`: header checkbox + selection counts + `Select all visible` / `Deselect all` (RULE 25), `PREVIEW BG`, `ZOOM` slider, `Apply badges`, **target FTP site checkboxes** (multi-upload), **file-type checkboxes** (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`), **`Upload`** button, live progress & `Cancel` | `PreviewStroke`, `⚙ Export settings…`, `↺ Reset to inherited`, `✦ Generate` / `↻ Regenerate` metadata, `⇪ Export selected`, `⤓ Download all` |
| **Row item** | Checkbox, zoomed thumbnail (`JPEG/PNG` or `SVG` — whichever exported file is available), base stem name + relative path to `export/`, available format chips (`JPG`/`PNG`, `SVG`, `EPS`, `ZIP`), upload status per target stock, row badges + `+ Badge`, `Location` button, `Metadata` expand toggle, single-row `Upload` button, expandable **editable metadata fields** (`Title`, `Description`, `Tags`, `Creator`, `Copyright` + `Copy` + local `Accept / Save`) | Artboard/padding/stroke/shadow/corner-badge/size-guide summary & per-row `Settings` / `Export` buttons |

---

## 2. Key Technical Constraints & Architectural Decisions

### 2.1 Strict Discovery Rule (`export/` + `export.json` Authority)

Per the requirement *"list of already exported files only. Include only files that where added in json as exported and are in folder 'export' only"*:

1. **Folder Walk**: Recursively walk the chosen root directory (including when the chosen root directory itself is named `export`). Inspect **only** directories whose basename is `export` (`name.toLowerCase() === "export"`). Source files outside `export/` are ignored.
2. **JSON Authority**: Read `<export-dir>/export.json` via `parseExportRecord` (`v: 1`). An `export/` folder yields an item **only** if `export.json` parses cleanly, `timestamps.committedAt !== null` (or `status` is `processed` / `partial` / `stale`), and at least one output entry in `record.outputs` is non-null.
3. **File Verification**: For each output slot recorded in `export.json` (`jpg`, `png` if present in future records, `svg`, `eps`):
   - Resolve its filename strictly inside that same `<export-dir>/` (reject any `..` or cross-directory path).
   - Verify the file exists on disk in `<export-dir>/` with `size > 0` and no read error.
   - **Stray files** sitting inside `export/` that are **not** referenced by `export.json` are **never** included in the row or uploaded; they are counted in the scan audit (`unrecorded files ignored`).
   - **Recorded-but-missing files** (listed in `export.json` but deleted on disk) are flagged honestly on the row and audit banner (RULE 4: distinguish empty from broken), never substituted from source folders.
4. **Same-Stem Grouping**: Every valid `<export-dir>/export.json` produces **one row** representing one icon asset with shared base stem `<stem>` (e.g., `icon-handshake-heart_7_03_v2`), bundling its verified sibling representations (`<stem>.jpg`/`.png`, `<stem>.svg`, `<stem>.eps`, plus `<stem>.zip` built from those siblings when `ZIP` is selected).

### 2.2 Thumbnail Preview Resolution (`JPEG/PNG` → `SVG` → Placeholder)

- Uses the shared `--svg-thumb` CSS variable, `zoomBoxFit(thumb, ratio)`, and `previewFrame(bg)` from `src/lib/zoom.ts` and `src/lib/svgbackground.ts`.
- **Available-file fallback order** per row (strictly reading from `export/`, never touching source SVGs):
  1. **`JPEG` / `PNG`** (`outputs.jpg` or `outputs.png`): loaded via File System Access handle into an `ObjectURL` (`URL.createObjectURL(file)`) managed by a dedicated hook `useExportRasterPreview` that revokes the blob URL immediately on unmount or `(rootToken, path, mtime)` change (RULE 20). Aspect ratio derives from `record.jpeg.{width,height}` or decoded `naturalWidth/naturalHeight`.
  2. **`SVG`** (`outputs.svg`) when raster is unavailable: loaded via `useSvgText` and rendered inside `SvgPreviewBox` (`buildSvgPreview` sanitized shadow-DOM preview).
  3. **`EPS`-only package** (when only `.eps` was exported): clean vector card inside the `zoomBoxFit` frame labeled `EPS` (browsers do not natively decode PostScript, avoiding heavy rasterization during scrolling).

### 2.3 Editable Metadata & Direct Re-Embedding on Save

- Shutterstock FTPS and similar stock FTP servers accept **media files only** (no sidecar JSON or CSV over FTPS) and ingest `Title` / `Description` / `Keywords` from embedded XMP + IPTC-IIM inside the uploaded JPEG/EPS files.
- Therefore, expanding a row shows the editable `Title`, `Description`, `Tags`, `Creator`, and `Copyright` fields (with per-field `Copy` buttons).
- Clicking **`✓ Accept / Save`** (row or bulk) runs `cleanMetadata` + `validateMetadata` and **re-embeds** the updated metadata in-place into every existing exported carrier of that row in `export/` (`embedMetadata` for SVG, `embedJpegMetadata` for JPEG without re-encoding pixels, `embedEpsMetadata` for EPS preserving vector bytes), verifies readback, and atomically updates `export.json` (RULE 15, RULE 23).

### 2.4 Shared Row Badges Across Tabs (RULE 24 Live Sync)

- Both `"SVG to upload"` and `"Upload"` key items by `pair.id` (`record.pair.id` in `export.json`).
- Instead of duplicating badge state, promote `src/upload/rowbadgestore.ts` to an external subscribable store (`useSyncExternalStore` over `localStorage` `iconSplitter.upload.rowBadges.v1` + existing `uploadRowBadges` global undo entry).
- Full badge UI is mounted on `"Upload"`:
  1. Top filter bar: `Badge` selector (`All / No badges / Any badge / <named>`) + `Badges…` button opening `UploadRowBadgeSettings` dialog (add, rename, recolor, delete).
  2. Pinned bulk bar: `Apply badges` toggle menu (`UploadRowBadgeApply`) operating on all checked rows.
  3. Row item: colored chips + `+ Badge` picker (`UploadRowBadges`).

### 2.5 Why FTPS Uses the Local Loopback Helper (`tools/bridge/`)

- Icon Splitter is a browser app (`dist/index.html` / Chromium File System Access API). Browsers prohibit raw TCP sockets (`port 21`), `AUTH TLS` upgrades, and passive TLS data channels.
- Icon Splitter **already ships** `tools/bridge/server.mjs` (`http://127.0.0.1:47391`), a zero-dependency Node 22 loopback server used for Inkscape CLI conversion.
- **Architectural choice**: Extend `tools/bridge/` with a clean, modular **Node `node:net` + `node:tls` FTPS client** (`tools/bridge/ftps/*.mjs` — **zero new npm dependencies**):
  - Binds strictly to `127.0.0.1` with the existing `ALLOWED_ORIGIN` (`file://`, `localhost`, `127.0.0.1`) and Private Network Access (`Access-Control-Allow-Private-Network: true`) guards.
  - Supports **Explicit FTPS (`AUTH TLS` + `PBSZ 0` + `PROT P`)**, **Implicit FTPS**, and plain **FTP** (with UI warning), passive mode (`EPSV` with `PASV` fallback), binary transfer (`TYPE I`), TLS session reuse between control and data sockets (required by strict FTPS servers), and `STOR <filename>` verified by server `226` completion.
  - Kills/aborts the active transfer immediately if the browser request cancels or disconnects (`res.once("close")`, RULE 7).
  - **Zero secret/content logging** (RULE 20): logs only HTTP method, route, status code, duration, and byte count — **never** logs credentials, hostnames, usernames, or filenames.
  - Provide `run_ftp_bridge.bat` / `run_app_ftp.bat` alongside `run_inkscape_bridge.bat` / `run_app_inkscape.bat` (both start the same unified `tools/bridge/server.mjs`).

### 2.6 Shutterstock FTPS Preset Specification (Initial Built-In Stock)

Per Shutterstock's official FTPS documentation (`https://submit.shutterstock.com/help/en/articles/10617392-how-do-i-upload-content-via-ftps` and technical image specs):

| Field | Shutterstock Preset Default | Notes |
|---|---|---|
| `id` / `name` | `shutterstock` / `Shutterstock` | Seeded as the **only** pre-configured stock connection out of the box |
| `protocol` | `ftps-explicit` | Explicit FTP over TLS (`AUTH TLS`, `PBSZ 0`, `PROT P`) |
| `host` | `ftps.shutterstock.com` | Official Shutterstock FTPS host |
| `port` | `21` | Standard Explicit FTPS control port |
| `remoteDir` | `/` | Root directory (Shutterstock requires uploading to root, never subfolders) |
| `passive` | `true` | `EPSV` / `PASV` passive data channel |
| `tlsPolicy` | `strict` (with explicit cert-fingerprint trust option) | Shutterstock's guide (Step 5) notes first-time unknown/untrusted certificate prompts are normal; if strict CA check fails with a cert warning, the UI displays the server's SHA-256 certificate fingerprint so the user can explicitly trust/pin that exact fingerprint (`pinnedCertSha256`) |
| `logonType` | `normal` | Shutterstock Contributor Email/Username + Account Password |
| Stock constraints | JPEG ≤ 50 MB (≥ 4 MP), EPS ≤ 100 MB | Preflight warns on filenames outside `[A-Za-z0-9_.-]` or oversized files; user still controls format checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`) |

**Varying fields across stocks**: Presets (`StockFtpPreset`) use a protocol-aware schema (`id`, `name`, `stockKind`, `protocol`, `host`, `port`, `remoteDir`, `passive`, `tlsPolicy`, `pinnedCertSha256`, `concurrency`, `timeoutMs`) persisted in `localStorage` (`iconSplitter.stockUpload.presets.v1`, validated on read per RULE 13). Users can edit fields or add additional FTP/FTPS stock presets via `+ Add stock`, and every added preset immediately appears in the **multi-upload target checkboxes** beside the `Upload` button.

### 2.7 Strict Local-Only Credential Security ("Do Not Expand It")

1. **Storage boundary**: `username` and `password` are stored **only** in the browser's IndexedDB `iconSplitter/secrets` object store under `stock-ftp-cred:<presetId>` via a dedicated `credvault.ts` built on `src/lib/idbvault.ts` (falling back to in-memory `session` storage only if IndexedDB is blocked, never `localStorage`, never `export.json`, never repo files).
2. **UI non-expansion rule**:
   - Saved credentials **never expand** or render their text in the connection card. Collapsed state displays only `Credentials saved locally` (or `Session only` / `Not set`) + `Set / Replace` and `Forget` buttons.
   - Inside the `Set / Replace` form, drafts start **blank** (existing username/password are never pre-filled back into inputs), password uses `type="password"` with no plaintext reveal toggle, saving empty inputs is a no-op (never wipes existing credentials), and closing the editor wipes draft state immediately.
3. **Log, toast & hygiene redaction**:
   - Extend `src/lib/log.ts` / `src/lib/svgsecret.ts` redaction keys with `username`, `password`, `ftpUser`, `ftpPassword`, `pass` so credentials can never enter `logstore`, copied logs, toasts, or error strings.
   - Extend `tests/secret_hygiene.test.ts` to cover FTP credential redaction in `logstore`.

### 2.8 Multi-File-Type & Multi-Stock Upload Mechanics

- **File-Type Checkboxes** (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`):
  - Checked independently in the upload bar.
  - All selected representations of an icon share the **exact same stem** (`<stem>.jpg` or `<stem>.png`, `<stem>.svg`, `<stem>.eps`, `<stem>.zip`).
  - **`ZIP` representation**: If `<stem>.zip` is checked, build `<stem>.zip` deterministically in memory via `JSZip` containing that row's verified exported representation files from `export/` (`<stem>.jpg`/`.png`, `<stem>.svg`, `<stem>.eps` — **excluding** `export.json`), verified `size > 0` before transfer (RULE 15/23).
- **Multi-Stock Target Checkboxes**:
  - Each configured stock FTP preset renders as a checkable target (`[x] Shutterstock`, etc.).
  - Clicking **`Upload`** (`Upload selected` or per-row `Upload`) validates preflight and opens an **Explicit Upload Confirmation Dialog (RULE 20)** listing:
    - Checked target stock server(s) (`name`, `protocol`, `host:port`, `remoteDir`, credential presence — never credential values).
    - Checked file formats (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`).
    - Exact count of icons, files, total bytes, and any per-row missing-format warnings (e.g., row has `JPG` + `SVG` but `EPS` is also checked → uploads `JPG` + `SVG` or flags missing `EPS` clearly without crashing other rows, RULE 4/5/9).
- **Execution & Connection Reuse**:
  - Groups transfers by target stock preset and reuses a **single authenticated FTPS control connection** per stock batch (via a short-lived loopback batch session in `tools/bridge/` or sequential batch stream) so uploading 50 icons does 1 login instead of 50 logins, reporting real-time file-by-file progress to the shared top progress header (`stock-upload-progress-mount`).

---

## 3. Planned Module & File Ownership Map (RULE 16 / RULE 18 Compliant)

Every new file is designed to stay ≤ 200 lines (hard cap 300), every function ≤ 25 lines (hard cap 30), ≤ 4 parameters, CC ≤ 10, nesting ≤ 4, and ≤ 15 hooks per component:

### 3.1 Pure Domain Logic (`src/lib/stockupload/`)
- `src/lib/stockupload/types.ts` — domain types: `ExportedItem`, `ExportedFiles`, `StockFtpPreset`, `UploadFormatFlags` (`raster`, `svg`, `eps`, `zip`), `StockUploadRecord`, `UploadPlan`.
- `src/lib/stockupload/presets.ts` — `SHUTTERSTOCK_PRESET` (`ftps.shutterstock.com:21`, Explicit TLS, `/`), preset schema validation/normalization on read (RULE 13), protocol-specific field descriptors.
- `src/lib/stockupload/credvault.ts` — local-only `{ username, password }` IndexedDB vault over `idbvault.ts` (`device` | `session` | `unreadable` | `none`, empty-save guard, `clear`), zero plaintext exposure.
- `src/lib/stockupload/discovery.ts` — pure `export/` + `export.json` discovery & verification (`discoverExportedItems`), enforcing `export` folder scope, `export.json` membership, stray-file exclusion, and missing-file reporting.
- `src/lib/stockupload/zippack.ts` — deterministic in-memory `<stem>.zip` builder (`JSZip`) from verified exported representations, excluding `export.json` (RULE 15/23).
- `src/lib/stockupload/plan.ts` — pure upload planner across `(checkedTargets × checkedRows × checkedFormats)`, computing exact transfer items, byte totals, Shutterstock filename/size advisories, and missing-format skips.
- `src/lib/stockupload/bridgeclient.ts` — typed browser client for `GET /health`, `POST /ftps/test`, and `POST /ftps/upload` against `127.0.0.1:47391` with `AbortSignal` support.

### 3.2 Local Loopback FTPS Bridge (`tools/bridge/`)
- `tools/bridge/ftps/reply.mjs` — RFC 959 single/multi-line FTP control reply parser & command framing (CRLF injection rejection).
- `tools/bridge/ftps/pasv.mjs` — `EPSV` (`229`) and `PASV` (`227`) data endpoint parser (enforcing control-host IP to prevent FTP bounce/SSRF).
- `tools/bridge/ftps/client.mjs` — `node:net` + `node:tls` Explicit/Implicit FTPS session (`AUTH TLS`, `PBSZ 0`, `PROT P`, `USER`/`PASS`, `TYPE I`, `CWD`, TLS session-reused passive `STOR`, `QUIT`, cert SHA-256 fingerprint check).
- `tools/bridge/ftps/routes.mjs` — loopback HTTP handlers for `/ftps/test` and `/ftps/upload` (session pool with idle auto-close, immediate `close` abort per RULE 7, zero credential/filename logging per RULE 20).
- `tools/bridge/server.mjs` — wire `/ftps/*` routes + `ftps: { ready: true }` in `/health` (preserving 100% compatibility with `/convert/eps`).
- `run_ftp_bridge.bat` & `run_app_ftp.bat` — Windows helper launchers alongside `run_inkscape_bridge.bat`.

### 3.3 Shared State & Cross-Tab Reuse (`src/state/`, `src/ui/`, `src/upload/`)
- `src/lib/session.ts` & `src/state/appstore.ts` — add `"stockUpload"` to `TabId` and `stockUpload: SessionUpload` selection slice (`checked`, `activeId`, `anchorId`), plus `stockUploadChecked` undo entry in `src/lib/history.ts` / `src/state/apply.ts`.
- `src/ui/Workbench.tsx` — add 6th tab `{ id: "stockUpload", label: "Upload", testid: "tab-stock-upload" }`, `<div id="stock-upload-progress-mount">`, and lazy-kept-alive `<StockUploadWorkspace>`.
- `src/upload/rowbadgestore.ts` — add external-store listener subscription so `"SVG to upload"` and `"Upload"` share live-synced row badges without code duplication.
- `src/upload/UploadMetaFields.tsx` — add optional `showAiActions?: boolean` (default `true`) so `"Upload"` renders the exact same editable metadata & copy/accept UI without Gemini Generate/Regenerate buttons (avoiding jscpd duplication).

### 3.4 `"Upload"` Tab UI & State (`src/stockupload/`)
- `StockUploadPanel.tsx` — tab shell, banners, pinned bulk bar, list, progress portal, status bar, dialogs, toast.
- `StockUploadControls.tsx` — top folder bar (`OpenFolderButton`, `↻ Rescan`, `FolderPathRow`), collapsible Stock FTP Presets card (stock dropdown, `+ Add` / `Remove`, varying FTP/FTPS fields, non-expanding local credential slot, `Test connection`), and filter/sort/badge/search bar.
- `StockUploadBulkBar.tsx` — pinned top bar: selection controls, `PREVIEW BG`, `ZOOM`, `Apply badges`, **target FTP site checkboxes**, **file-type checkboxes** (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`), and **`Upload`** / `Cancel` button.
- `StockUploadList.tsx` & `StockUploadRow.tsx` — virtual/projected checkable rows (`useRowBinding`), `StockUploadPreview.tsx` (`JPEG/PNG` → `SVG` → `EPS` badge), stem & `export/` path, available format chips, per-stock upload status chips, row badges, `Location`, `Metadata`, per-row `Upload`, and expandable local `UploadMetaFields`.
- `StockUploadConfirmDialog.tsx` — RULE 20 pre-upload disclosure modal (targets, formats, file count/bytes, missing-format notes, certificate fingerprint trust prompt when needed).
- `useStockUpload.ts`, `statemodel.ts`, `scan.ts`, `metaembed.ts`, `runupload.ts`, `presetstore.ts`, `historystore.ts`, `journal.ts`, `keystore.ts` — focused hooks & stores under `src/stockupload/`.

---

## 4. Ordered Implementation Steps (TDD — Failing Test → Implementation → Green)

Each step will follow strict TDD (RULE 8), RULE 16 size/complexity limits, and incremental verification:

### Step 1 — Credential Vault & Secret Redaction Hygiene
1. **Tests first**: `tests/stockupload_credvault.test.ts` + extend `tests/secret_hygiene.test.ts` for FTP username/password storage (`device` / `session` / `unreadable` / `none`), empty-save protection, `clear()`, and automatic log/clipboard redaction of `username`/`password`/`ftpPass`.
2. **Implement**: `src/lib/stockupload/credvault.ts` and redaction key additions in `src/lib/log.ts`.
3. **Gate**: Both test files green; confirm zero secrets in localStorage or logs.

### Step 2 — Stock FTP Presets Model & Shutterstock Default
1. **Tests first**: `tests/stockupload_presets.test.ts` covering the seeded `Shutterstock` preset (`ftps.shutterstock.com`, port `21`, `ftps-explicit`, `/`, passive `true`), varying fields across protocols (`ftps-explicit`, `ftps-implicit`, `ftp`), corrupt `localStorage` recovery (RULE 13), and guarantee that credential fields in raw JSON are stripped on read/write.
2. **Implement**: `src/lib/stockupload/types.ts`, `src/lib/stockupload/presets.ts`, `src/stockupload/presetstore.ts`.

### Step 3 — Strict `export/` + `export.json` Discovery & ZIP Builder
1. **Tests first**: `tests/stockupload_discovery.test.ts` and `tests/stockupload_zippack.test.ts`:
   - Lists ONLY items inside `export/` folders that are recorded as committed outputs in `export.json` AND physically exist in `export/`.
   - Ignores source SVGs/PNGs outside `export/` and ignores stray unrecorded files inside `export/`.
   - Reports corrupt `export.json` and recorded-but-missing files honestly without inventing replacements.
   - Supports picking either a workspace root (nested `<pair>/export/export.json`) or an `export/` folder directly.
   - Builds deterministic `<stem>.zip` in memory containing verified exported representations and never `export.json`.
2. **Implement**: `src/lib/stockupload/discovery.ts`, `src/lib/stockupload/zippack.ts`, `src/stockupload/scan.ts`.

### Step 4 — Local Loopback Explicit FTPS Bridge & Real TLS Server Tests
1. **Tests first**: `tests/bridge_ftps.test.ts` + `tests/helpers/fakeftps.mjs` (a real local Node `net` + `tls` Explicit FTPS server speaking `220`, `AUTH TLS`, `PBSZ 0`, `PROT P`, `USER`/`PASS`, `TYPE I`, `EPSV`/`PASV`, TLS data `STOR`, `226`, `QUIT` — zero external internet traffic per RULE 8 & RULE 20):
   - Tests `/ftps/test` success, wrong password (`530`), untrusted self-signed cert rejection under `strict` + SHA-256 fingerprint pin acceptance, `/ftps/upload` binary integrity across JPEG/SVG/EPS/ZIP, CRLF command-injection rejection, CORS/origin rejection (`403` for non-local origins), client-abort cleanup (RULE 7), and log output redaction (zero credentials/filenames logged).
2. **Implement**: `tools/bridge/ftps/{reply,pasv,client,routes}.mjs`, wire into `tools/bridge/server.mjs`, add `run_ftp_bridge.bat` & `run_app_ftp.bat`.

### Step 5 — Upload Planner, Batch Runner, Progress & Crash Journal
1. **Tests first**: `tests/stockupload_plan.test.ts` and `tests/stockupload_runner.test.ts`:
   - Multi-site (`Shutterstock` + custom FTP) × multi-format (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`) planning with same-stem filenames.
   - Per-item / per-site failure isolation (one failed file or missing format does not abort remaining files/sites, RULE 5/9).
   - Shared progress updates, completion sound hook, clean `Cancel` mid-batch (RULE 7), and crash-recovery journal (`interrupted` on reload, never auto-re-uploading, RULE 20).
2. **Implement**: `src/lib/stockupload/{plan,bridgeclient}.ts`, `src/stockupload/{runupload,historystore,journal}.ts`.

### Step 6 — Local Metadata Editing & Carrier Re-Embedding on Exported Files
1. **Tests first**: `tests/stockupload_metaembed.test.ts` verifying that editing `Title` / `Description` / `Tags` / `Creator` / `Copyright` on an exported item validates fields and re-embeds XMP + IPTC-IIM / RDF into existing `export/<stem>.{jpg,svg,eps}` files (without re-encoding JPEG pixels or touching source SVGs) and atomically updates `export.json`.
2. **Implement**: `src/stockupload/metaembed.ts` reusing `src/lib/upload/{meta,embed,jpeg,epsmetadata}.ts` + `UploadMetaFields` `showAiActions={false}`.

### Step 7 — App Store, Global Undo, Shared Badges & `"Upload"` Tab UI
1. **Tests first**:
   - `tests/workbench_ui.test.tsx`: 6th tab `"Upload"` (`tab-stock-upload`), tab switching, hidden keep-alive during upload.
   - `tests/stockupload_ui.test.tsx`:
     - Folder open + full path bar, exported-only list rendering.
     - Thumbnail zoom + preview fallback (`JPEG/PNG` when present, `SVG` fallback when JPEG absent, `EPS` placeholder, blob URL cleanup).
     - Row gestures (RULE 25: click = active row expanding editable metadata, checkbox/Shift/Ctrl/Q/E/header check, global undo/redo across tabs).
     - Full badges UI on top (`Badges…` catalog dialog, filter, bulk `Apply badges`) + per-row chips live-synced with `"SVG to upload"`.
     - Row `Location` copy button.
     - Stock FTP preset dropdown (`Shutterstock` default + add/edit custom stock with varying fields), local credential save/forget **never expanding username/password in DOM**, multi-FTP checkboxes, file-type checkboxes (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`), RULE 20 confirmation dialog, progress bar, and cancel.
2. **Implement**: `src/state/appstore.ts`, `src/lib/session.ts`, `src/lib/history.ts`, `src/state/apply.ts`, `src/ui/Workbench.tsx`, `src/upload/rowbadgestore.ts`, and `src/stockupload/*.tsx`.

### Step 8 — Documentation, Quality Gates & Full Verification
1. Update current contracts in `docs/current/` (all ≤ 9 KB per RULE 17/18):
   - `docs/current/README.md` (add `Stock upload` task read-pack row)
   - `docs/current/sor/OVERVIEW.md` (six modes)
   - `docs/current/sor/stock-upload.md` & `docs/current/selectors/stock-upload.md`
   - `docs/current/sor/{STORAGE,OWNERS,TESTS}.md` + area pages & invariants (`I-80` exported-only scope, `I-81` non-expanded local FTP credentials)
   - `README.md` user guide (how to launch `run_app_ftp.bat` / `run_ftp_bridge.bat` and upload to Shutterstock FTPS)
2. Run full verification gates:
   - Focused new & regression tests (`vitest run`)
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run quality:changed` (0 violations: functions ≤ 30 LOC, params ≤ 4, CC ≤ 10, nesting ≤ 4, files ≤ 300 LOC, 0 jscpd clones)
   - `npm run verify:fast` and `npm run verify`
   - Append one measured dated entry to `docs/current/QUALITY_RECHECK.md` without reading it.

---

## 5. Design Assumptions & Review Checkpoints Before Coding

Before starting Step 1 implementation, confirm if any adjustment is wanted on these defaults:

1. **Tab placement & name**: Added as the 6th rightmost tab labeled **`Upload`** (`testid="tab-stock-upload"`), right after **`SVG to upload`**, which keeps all existing preparation features unchanged.
2. **`ZIP` checkbox behavior**: Builds `<stem>.zip` in memory containing that icon's verified exported files from `export/` (`<stem>.jpg`/`.png`, `<stem>.svg`, `<stem>.eps` — never `export.json`), or uploads `<stem>.zip` directly if one is recorded and present.
3. **Metadata edits on `"Upload"`**: Clicking `Accept` on edited row metadata re-embeds XMP/IPTC/RDF directly into the existing exported files in `export/` (`jpg`, `svg`, `eps`) and updates `export.json` so uploaded files carry the edited metadata inside their bytes.
4. **Shared Row Badges**: Shares the badge catalog and `pair.id` assignments with `"SVG to upload"` so organizational badges carry straight over to `"Upload"`.
5. **Local Helper for FTPS**: Uses the existing local Node helper (`tools/bridge/server.mjs` on `127.0.0.1:47391`, zero external npm packages) so the browser app can speak real Explicit FTPS (`ftps.shutterstock.com:21`, `AUTH TLS`) safely on the user's machine while keeping credentials strictly in local browser IndexedDB secrets (`never expanded`).
