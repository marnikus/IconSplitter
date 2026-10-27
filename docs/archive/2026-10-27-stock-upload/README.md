# New tab "Upload" — sending exported packages to stock sites

Status: **plan only**. No production code, no tests and no current-behaviour page
changed in this pass beyond the plan itself. Written 2026-10-27.

This is a **new feature**, not a performance pass: a sixth tab that lists what
"SVG to upload" already exported and sends those files to stock sites over
FTPS. It reuses that tab's behaviour wherever the user asked for a clone, and
adds exactly one new capability: delivery.

---

## 1. What the user asked for

A new tab, labelled **Upload**, for uploading images to stock sites. These parts
must behave as in **SVG to upload**:

1. **The list contains only already exported files.** A row exists only when the
   file was named as exported in `export.json` **and** lives in that pair's
   `export/` folder — the root folder is parsed under that rule.
2. **Row controls:** Location button, editable metadata fields, badges (with the
   full badge UI also available on top), the name and the path of the file.
3. **Top widgets:** badge controls; FTP presets for different stock sites where
   all fields may vary, as a drop list of sites with their FTP settings plus a
   selection; the whole bar pinned to the top; zoom for thumbnails; **Apply
   badges**; an **Upload** button that uploads to several FTP sites at once
   (checkbox per added site).
4. **Open folder and the full path stay on top**, exactly as before.
5. **One FTP connection for now:** Shutterstock, as documented in
   <https://submit.shutterstock.com/help/en/articles/10617392-how-do-i-upload-content-via-ftps>.
6. **One or several file types per upload**, each selected by a checkbox —
   JPEG/PNG, SVG, EPS, ZIP — where all files of one image representation share
   the same name.
7. **Username and password are saved locally only**, and that stays the whole
   scope.

Acceptance standards inherited from the two earlier response passes: the list
must stay responsive at 1,000 and 5,000 rows, the selection gestures must be the
shared RULE 25 contract, and every state the UI shows must be true.

---

## 2. Research: what this tab is, and what constrains it

### 2.1 The export package is already the source of truth

`src/lib/upload/export.ts` defines one `export.json` per icon inside
`<pair-folder>/export/`. It is written **last** by the commit
(`src/upload/exportcommit.ts`), so it names only files that were verified and
written. Its `outputs` block is exactly three slots — `svg`, `jpg`, `eps` — each
`{ path, bytes, hash } | null`, and `ARTIFACT_EXTS` is `["svg", "jpg", "eps"]`.
`planDownload` (`src/lib/upload/download.ts`) already turns those records into
the file list a download would copy. There is **no** PNG and **no** ZIP in a
package today, and `record.settings`/`record.metadata` record what was embedded.

Consequence: the new tab needs no new discovery rule of its own. "Exported" =
`record.outputs[ext] !== null`, and "in the export folder" is checkable from the
record's own path (`<pair-dir>/export/<stem>.<ext>`).

### 2.2 A browser cannot speak FTPS

Browsers removed FTP support years ago and expose no API that opens an FTP or
FTPS control connection; `fetch` speaks HTTP(S) only. Nothing in the app can
reach `ftps.shutterstock.com:21` by itself. The repository already solves the
same class of problem for Inkscape: `tools/bridge/server.mjs` is a loopback-only
Node helper on `127.0.0.1:47391` that the page calls for work the browser cannot
do, with a strict origin allowlist and a log that records method, status,
duration and byte counts — never content. **The upload path must be a second
route on that same bridge.** This is the single largest architectural decision in
this plan and the one most worth confirming before implementation (§12).

### 2.3 Shutterstock's own rules, which the UI must not contradict

From the contributor help pages (fetched 2026-10-27):

| Rule | Value |
|---|---|
| Host / port | `ftps.shutterstock.com`, **21** |
| Security | **Explicit FTP over TLS** (AUTH TLS) |
| Login | contributor e-mail **or** username, plus the account password |
| Accepted media | JPEG, TIFF, EPS (vector); PSD and layered TIFF refused |
| Vector | EPS **8 or 10** only, **4–25 MP** measured on the artwork's bounding box |
| Size limits over FTPS | JPEG ≤ 50 MB, EPS ≤ 100 MB, TIFF ≤ 4 GB |
| Metadata over FTPS | **none** — FTPS moves media only |
| CSV metadata | uploaded **afterwards**, on the Submit page, never over FTPS |
| CSV columns | `Filename, Description, Keywords, Categories` (+ `Illustration`, `Mature Content`, `Editorial`) |

Three consequences that shape the design:

- **PNG and SVG are not Shutterstock formats.** The user asked for
  JPEG/PNG, SVG, EPS and ZIP checkboxes; the preset must therefore carry the
  formats a site accepts, and a format the selected site does not take must be
  **shown as unavailable with the reason** rather than silently dropped.
- **ZIP is not accepted by Shutterstock** (nor by Adobe Stock for vectors). The
  ZIP checkbox exists in the UI because the user asked for one and because a
  preset may allow it, but for Shutterstock it is disabled with the reason. It
  never becomes a silent no-op.
- **Metadata cannot travel by FTPS.** It travels *inside* the files (our exports
  already embed XMP/IPTC/DC — `docs/current/sor/upload-file-metadata.md`) or as a
  CSV the user applies on the Submit page. The tab may generate that CSV, but it
  must never claim the files themselves were tagged after the user edits a field
  (§5, D9).

### 2.4 What "same name for one representation" already guarantees

`stemOf` (`src/lib/upload/export.ts`) turns `fog_AI.svg` into `fog`, and every
artifact of that package is written as `<stem>.svg` / `<stem>.jpg` /
`<stem>.eps` — the rule `planDownload` relies on. So the "files have the same
name" requirement is a property of the existing commit, not something the upload
path has to invent; the planner **asserts** it and refuses a row whose record
disagrees instead of renaming.

### 2.5 The privacy promise this feature touches

`docs/current/sor/OVERVIEW.md` currently says: *"Provider requests are opt-in
exceptions to local processing (RULE 20); no automatic website upload occurs."*
That sentence is a promise about the whole app, and this tab is the first thing
that would contradict it. RULE 20 allows an external send only with **informed
consent**, so the feature must:

- never upload anything without a user action that names the sites and the file
  count, and states that the files leave the machine;
- show that confirmation at the moment of sending, not once per session;
- log the send (site, file count, bytes, outcome) and nothing about credentials;
- amend that OVERVIEW sentence and RULE 20's own wording in the same change that
  introduces the tab — the doc gate is not the place to discover a broken
  promise.

### 2.6 What the two response passes already built, and must be reused

The last three passes established machinery that a new list must not
re-implement. The new tab is required to use it from its first commit:

| Need | Existing owner |
|---|---|
| Row selection gestures, aria-current, roving tabindex, scroll | `src/ui/checkedrows.ts` + `src/ui/rowpresentation.ts` |
| Delta history / one entry per gesture | `src/lib/selectiondelta.ts`, `src/lib/history.ts`, `src/ui/rowgesture.ts` |
| Slice selectors so one patch renders one panel | `src/state/useAppState.ts` (`useAppSlice`) |
| Counts without O(rows × affected) scans | `src/svg/panelcounts.ts` |
| Badge catalog + per-row assignment + apply-to-checked | `src/lib/upload/rowbadge.ts`, `src/upload/rowbadgestore.ts` |
| Open folder + full path | `src/ui/FolderBar.tsx`, `src/ui/pickroot.ts`, `src/lib/knownroots.ts` |
| Zoom value + box fitting | `src/lib/zoom.ts`, `src/ui/ZoomSliderBase.tsx` |
| Thumbnails from a folder handle | `src/selection/thumbs.ts` (`useSideThumbs`) |
| Preview a document in an isolated shadow root | `src/svg/SvgPreview.tsx`, `src/lib/svgpreview.ts` |
| Content-keyed preview caching, window-gated drawing | planned in `docs/archive/2026-10-26-upload-response-v2/README.md` (D1/D5) |
| Verified, never-overwrite writes; honest end line | `src/lib/upload/download.ts`, `src/upload/downloadactions.ts`, `src/lib/fs.ts` |
| Local-only secrets | `src/lib/keyvault.ts`, `src/lib/idbvault.ts` (IndexedDB `secrets`) |
| Loopback helper | `tools/bridge/server.mjs` |

The consequence is a hard rule for this feature: **the new tab ships with the
good list path from day one** — memoized rows, content-keyed derivation,
window-gated previews, zero per-render hashing. Building it on the old eager
pattern and "optimising later" would repeat the 2026-10-26 findings.

---

## 3. Scope boundaries

In scope:

- sixth tab, its own persisted session slice and selection;
- export-only discovery, per-row file verification, per-row state;
- badge UI on the bar and on rows, sharing the existing store;
- stock preset list (drop list) with per-site FTP fields, stored locally;
- per-run format checkboxes and site checkboxes;
- one target site (Shutterstock) end to end through the loopback bridge;
- a local upload log (which files went where, when, and what the site answered);
- CSV generation for the Submit page (optional, on demand).

Out of scope in v1, stated so nobody assumes it:

- any site other than Shutterstock as a *working* connection (the preset model
  is there; only one preset ships enabled);
- automatic submission for review, category selection, or anything that needs
  the contributor web session;
- resumable transfers, parallel connections, bandwidth shaping;
- watching the folder for new exports (manual **Rescan**, like every other tab);
- sort/filter UI beyond badge filtering and name order (v1 sorts by name);
- writing anything into the user's folder — this tab never creates an `export/`
  file, a ZIP on disk, or a lock file.

---

## 4. Data model

All of it lives in `src/lib/stock/` (pure) and `src/stock/` (React + I/O), the
same split every other area uses.

### 4.1 Discovery (`src/lib/stock/discover.ts`)

```ts
discoverExports(root: DirHandleLike): Promise<StockDiscovery>
```

- walks the tree once (`readDirTree`, the same reader the upload tab uses);
- considers **only** files named `export.json` whose parent folder is named
  `export` (case-insensitive) and whose parent's parent is a pair folder
  (`dirPath !== ""` handled: root-level pairs use `export/` directly);
- parses with `parseExportRecord` — a corrupt record is an **exclusion with a
  reason**, never a row and never a guess (RULE 4/13);
- keeps records that are committed: `timestamps.committedAt !== null`,
  `status ∈ {processed, partial}`, and at least one non-null `outputs` slot;
- for every named output: the path must resolve inside that same `export/`
  folder (a record naming `../../x` is refused with a reason), and the file must
  exist in the walk;
- every other file inside `export/` is ignored — that is the user's rule, and it
  is also what makes superseded artifacts invisible;
- the row id is `record.pair.id`, the same stable id the SVG-to-upload tab uses,
  so badges and history agree across the two tabs.

Output: `rows: StockRowSource[]`, `excluded: { id, reason }[]`, `audit`.

### 4.2 Verification (`src/lib/stock/verify.ts`)

Each named file gets a state, computed **cheaply first**:

| State | Meaning | Cost |
|---|---|---|
| `named` | record names it, file exists in the walk | 0 reads |
| `size` | on-disk bytes == `outputs[ext].bytes` | 0 reads (the walk carries sizes) |
| `hash` | full content hash matches `outputs[ext].hash` | 1 read per file, **on demand** (before an upload, or when the user asks) |
| `changed` | size differs, or hash differs | — |
| `missing` | named but not in the walk | — |

`changed` and `missing` are **blocking** for that file: the package no longer
matches what the commit verified, and uploading it would ship a file nothing
checked. The row stays visible, says which file and why, and offers **Rescan**.

Hashing 1,000 JPEGs on mount would cost more than the whole list; so `hash` is
produced by the run planner for the files it is about to send (and cached by
`(path, size)`), not by the scan.

### 4.3 Row (`src/lib/stock/row.ts`)

```ts
interface StockRow {
  id: string;                 // record.pair.id
  base: string;               // record.pair.base — the display name
  dirPath: string;
  exportDir: string;
  record: ExportRecord;       // committed, authoritative
  files: Partial<Record<ArtifactKind, StockFile>>;  // jpg | svg | eps
  /** Formats this package can send: verified files ∩ kinds the row really has. */
  available: ArtifactKind[];
  meta: StockMetaView;        // record.metadata + read-back truth flags
  /** Per-site outcome of the last successful upload of this exact content. */
  sent: Record<string, SentStamp>;
  /** record.metadata differs from the draft the user edited here. */
  metaDraft: boolean;
  blocked: StockBlock[];      // missing/changed files, disallowed artist rules
}
```

`ArtifactKind` = `"jpg" | "png" | "svg" | "eps"`; `zip` is not a kind of file in a
package — it is a **transport choice** (§5.5).

### 4.4 Local persistence — five keys, each with one owner

| Key | Store | Contents |
|---|---|---|
| `iconSplitter.stock.presets.v1` | localStorage | site presets and their non-secret fields, plus which sites are ticked |
| `iconSplitter.stock.sent.v1` | localStorage | bounded (`MAX_SENT = 4000`) map `pairId → { siteId: { at, files, formatSet, remoteName } }` |
| `iconSplitter.stock.settings.v1` | localStorage | zoom, preview background, last chosen formats |
| `iconSplitter.upload.rowBadges.v1` | localStorage | **shared** with SVG to upload (same catalog, same pair-keyed assignments) |
| `secrets` / `stock:<siteId>` | IndexedDB via `createIdbKeyVault` | `{ user, password }` for that site |

Credentials are written **only** through `lib/idbvault` (`createIdbKeyVault`);
they never enter localStorage, the session snapshot, `export.json`, a log entry,
a toast, or the CSV. A read failure is reported as `unreadable`, never as "no
credentials" (the 2026-10-07 field bug, `docs/current/sor/topics/secret-store.md`).

---

## 5. Design

### D1 — The tab is a list of committed packages, not a scanner of the folder

Discovery reads `export.json` and nothing else. A file that exists in `export/`
but is not named by the record never becomes a row, a thumbnail or an upload
candidate. This is the user's rule, and it is the only rule that keeps the tab
honest after a partial commit or a manual copy.

### D2 — One row model, one derivation, one projection

The list, the counts, the filters and the run plan all read the **same**
`StockRow[]`. `visibleRows(rows, filter, sort)` is memoized on a content key
(rows revision + filter + sort + badge revision), per the 2026-10-26 upload
redesign (D6). Counts come from `panelcounts`, not from per-consumer scans.
Rows are `memo`'d on a stable row object and stable action identities; the
active row alone is cloned (the SVG-to-upload pattern).

### D3 — Preview: the exported file itself, window-gated

The preview shows **the file that will be uploaded**, which is the whole point
of this tab. Resolution order per row: `jpg` → `png` → `svg`.

- JPEG/PNG: one `getFile()` + `URL.createObjectURL`, cached per
  `(rootToken, path, bytes, mtime)` in a bounded LRU, revoked on eviction and on
  root change. Rendered with `<img loading="lazy" decoding="async">`.
- SVG: `useSvgText` + `SvgPreviewBox` (sanitized, shadow-rooted, RULE 20) — the
  shared path, not a copy.
- **Only rows inside ~1.5 viewports are read** (the round-3 D5 window, with the
  same "all rows" fallback when `IntersectionObserver` is missing). A 1,000-row
  mount therefore opens ~40–60 files, not 1,000.
- The box is `zoomBoxFit(thumb, ratio)` from a **cached** ratio; a zoom step
  re-renders previews only and reads nothing.

This tab never runs `prepareExportSvg`, never re-renders a document and never
writes a file — it displays what the export already produced.

### D4 — Badges are shared, not duplicated

The badge catalog and the per-pair assignments are the **same store** as SVG to
upload (`iconSplitter.upload.rowBadges.v1`), because a badge is a statement
about one icon, not about one tab. The bar gets the same controls the other tab
has (open catalog, apply-to-checked, filter), and rows get the same chips +
"+ Badge" menu. Both tabs share the history entry type, so undoing a badge
change made in one tab updates the other (I-73's guarantee, still one store).

### D5 — Stock presets are data

```ts
interface StockPreset {
  id: string;               // "shutterstock"
  label: string;            // "Shutterstock"
  host: string;             // ftps.shutterstock.com
  port: number;             // 21
  security: "explicit-tls" | "implicit-tls" | "plain";
  loginField: "email" | "username";
  remoteDir: string;        // "" = the account root
  formats: ArtifactKind[];  // what the site accepts: ["jpg", "eps"]
  zip: boolean;             // does the site take archives?
  docs: string;             // the help URL shown next to the preset
}
```

Built-in `shutterstock` = `{ host: "ftps.shutterstock.com", port: 21,
security: "explicit-tls", loginField: "email", remoteDir: "", formats: ["jpg",
"eps"], zip: false }`. Every field is editable in the preset editor, and a
preset can be added by hand for a site that is not built in — "all fields may
vary" is honoured by making the shape the whole surface. A malformed stored
preset drops itself (RULE 13) and never blocks the tab.

The run only ever addresses presets the user has ticked; the ticked set is what
the Upload button counts ("Upload to 2 sites").

### D6 — Formats are checkboxes, and the intersection is computed, never assumed

The bar has one checkbox per kind (JPEG, PNG, SVG, EPS, ZIP). For each
`(row, site)` pair the plan takes

```
send(row, site) = checkedKinds ∩ row.availableKinds ∩ site.formats
```

- empty → the pair is **skipped with a reason** in the run report
  ("Shutterstock takes JPEG/EPS; this package has SVG only");
- a checked kind no row can send is reported once ("no selected package has a
  PNG export") instead of failing per row;
- a checked kind the site does not take is shown **disabled with the reason** on
  the preset row, before the run;
- ZIP, when both allowed and checked, wraps that row's other sent files into
  `<stem>.zip` in memory (JSZip is already a dependency, used by Single sheets)
  and sends the archive instead of the loose files. It never lands on disk.

### D7 — Transport: a loopback bridge route, with an honest fallback

`tools/bridge/server.mjs` gains:

- `GET /health` → adds `ftp: { ok, version }` so the tab can say whether
  delivery is possible on this machine;
- `POST /ftp/upload` → one file per request:
  - headers: `x-stock-host`, `x-stock-port`, `x-stock-security`,
    `x-stock-dir`, `x-stock-user`, `x-stock-pass`, `x-file-name`;
  - body: the raw bytes (streamed, `content-length` required);
  - answer: `{ ok, bytes, ms, remoteName, code, message }`, with `code:
    "exists"` when the remote listing already has the name;
  - the bridge **never logs the user, the password or the file name**; its log
    line is method, status, bytes and duration, exactly like the converter;
  - the bridge **never writes the credentials anywhere** and keeps them only for
    the duration of one request;
  - the origin allowlist stays `localhost`/`127.0.0.1`/`null`, unchanged.

`src/lib/stock/ftpclient.ts` wraps that route: one request per file, sequential,
with an `AbortSignal`; a failure is a per-file outcome, never a thrown run.

**When the bridge is absent** the Upload button does not pretend: it says
"Uploading needs the local helper — run `node tools/bridge/server.mjs`" and
offers the one thing the browser *can* do: **Download the selected files**
(reusing `downloadactions`, which is verified and never overwrites).

Rejected alternatives are listed in §9 with the reason each was dropped.

### D8 — One run: plan, send, report

```
planStockRun(rows, checkedIds, sites, kinds) → StockRunPlan
  { jobs: { rowId, siteId, files: PlannedFile[] }[], skipped: { rowId, siteId?, reason }[], totals }
```

- `PlannedFile = { from, remoteName, kind, bytes, hash }` — `from` is the
  verified on-disk path, `remoteName` is the shared stem + the real extension;
- the planner hashes the files it will send (`hash` state promoted from `size`),
  and refuses a file that changed since the scan;
- execution is a single sequential loop (one connection at a time — the bridge
  keeps it simple and the server friendlier), one `AbortController` for the
  whole run, progress per file on the existing progress surface;
- **never overwrite**: an `exists` answer fails that file with the reason and a
  per-run "Replace remote file" switch that is **off** by default and says what
  it does when turned on;
- **the button opens one confirmation that names the sites, the exact number of
  files and the fact that they leave this machine** — the RULE 20 consent for
  this action, asked at the moment of sending;
- the end line is one honest sentence: `sent 12 files to Shutterstock — 3
  skipped (no JPEG), 1 refused (already there)`, plus one log entry per site;
- `sent` stamps are written only for files the bridge confirmed, keyed by the
  file's hash, so the row can say "this exact content is already on
  Shutterstock" and the Upload button can offer to skip it next time.

Uploading is **not** an undoable gesture: it is an external side effect, and
RULE 12's timeline covers app state. The selection that led to it *is* undoable.
This is stated in the UI's hint line so nobody expects Ctrl+Z to un-send a file.

### D9 — Metadata: read-back truth, editable draft, CSV for the Submit page

The row shows `record.metadata` — what the shipped files actually carry
(`title`, `description`, `tags`, `creator`, `copyright`, validation state), with
a `carried by <stem>.jpg` line so the source of the value is never a mystery.

Editing a field here writes a **draft** for that pair (`metaDraft = true`), which
is:

- shown as "edited — not in the exported files yet";
- **not** uploaded as if it were in the files: the files are sent byte for byte
  as committed;
- delivered the one way Shutterstock accepts: a generated
  `<batch>.csv` (`Filename, Description, Keywords, Categories, Illustration`)
  the user applies on the Submit page after the upload. The CSV is built from
  the *draft* when one exists and from the record otherwise, and says which in
  its own file name (`-draft.csv` / `-exported.csv`);
- carried into the next export when the user re-exports in SVG to upload — this
  tab never writes the export record (one owner per value, RULE 3).

Default for a row whose draft differs from the record: **the upload is allowed**
(the files are real and verified); the run report says which rows went with
older embedded metadata. That is the honest reading of "the tab uploads what was
exported".

### D10 — The bar is one sticky control strip

Top to bottom, pinned (`position: sticky` in the tab's scroll container, so it
behaves like the existing upload bar):

1. **Open folder** + full path — the shared `FolderBar` components, unchanged.
2. **Badges**: open catalog, apply to checked, filter.
3. **Stock sites**: the drop list of presets with a checkbox each; a preset's
   fields open in a small editor; credentials are entered per site in that
   editor and shown as "saved on this device", never echoed.
4. **Formats**: JPEG / PNG / SVG / EPS / ZIP checkboxes, disabled with reasons
   when the ticked sites refuse them.
5. **Zoom** + preview background (shared slider).
6. **Upload (N)** — disabled with the reason when: no rows checked, no site
   ticked, missing credentials, no verified file, or no bridge.

The row keeps: checkbox, preview, name, **path**, **Location**, metadata fields
(editable, expanded for the active row), badges, per-file state, per-site "sent"
state.

### D11 — Performance contract from the first commit

Nothing here is "measured later"; the constraints are the ones the 2026-10-26
pass proved:

- mount reads one `export.json` per pair and **no file bytes** (window-gated
  previews are the only reads);
- one commit for the first paint of the list, then ordered chunks of ≤ 400 rows
  for large lists;
- every row element memoized on a stable row; the active row alone is cloned;
- zoom, format checkboxes and site ticks re-render previews and the bar, never
  the rows;
- no per-render hashing, no per-render settings objects, no whole-list scans in
  components;
- the run never blocks the list: it is async per file with progress and cancel.

### D12 — No new tab-level state machine

The tab's state is `{ root, rows, filter, sort, run }` plus the shared selection
slice — the same shape as SVG to upload. There is no second store, no watcher,
no background loop. A rescan replaces rows; a run replaces `run`; both are
explicit user actions.

---

## 6. Ordered steps

Each step is TDD: the failing test is named first. Gates after every step:
`npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`; `npm run verify`
before the push.

**Step 0 — Tab skeleton (no behaviour)**
Test: `tests/stock_tab.test.tsx` — the tab bar has six tabs, the sixth is
"Upload", clicking it logs `open-tab` and renders `stock-root-empty`; a stored
session with `tab: "stockUpload"` restores it; `TAB_IDS` and `parseSession`
round-trip (unknown tab falls back, RULE 13). Change: `TabId`, `TAB_IDS`, the
`stockUpload` session slice (checked/activeId/anchorId), `Workbench` lazy panel,
`listtargets` `CheckableList`.

Places that assume five tabs and must move in this same step (found by grep, not
by guessing): `src/ui/Workbench.tsx` (`TABS`), `tests/workbench_ui.test.tsx`,
`tests/log_ui.test.tsx`, `tests/scroll_top.test.tsx`, and the prose in
`docs/current/{README.md, sor/shared.md, selectors/shared.md,
sor/topics/UI_INVENTORY.md}` plus `sor/OVERVIEW.md`'s "five-mode" framing.

**Step 1 — Discovery and verification (pure)**
Tests: `tests/stock_discover.test.ts` — a fixture root with pair folders, one
commit, one partial, one corrupt record, one record naming a file that is not
there, one stray file in `export/`, one `export.json` outside an `export/`
folder, one record naming `../escape.jpg`. Expect: only the committed, fully
named, in-folder packages become rows; every other case is an exclusion with its
reason; no read of a media file. `tests/stock_verify.test.ts` — `named` →
`size` → `hash` / `changed` / `missing` promotion, and hash on demand only.

**Step 2 — The list, on the good path**
Tests: `tests/stock_list.test.tsx` — 1,000 rows mount with **zero** media reads;
row renders at mount are one per row; a row click / ArrowDown / checkbox change
does **0** media reads, 0 preview renders outside the window, and one history
entry; badge filter and name sort keep hidden checks. Change: `useStock`,
row model, `StockList`, `StockRow`, memoized rows, content-keyed
`visibleRows`, `panelcounts` counters, ordered chunking.

**Step 3 — Window-gated previews**
Tests: `tests/stock_preview.test.tsx` — with a fake `IntersectionObserver`
window of 40 rows, mount opens ≤ 60 files; scrolling in 40 more opens 40 more; a
row that never intersects opens none; zoom changes re-render previews, read
nothing, and keep the box identical (no layout shift); JPEG/PNG use an object
URL revoked on unmount/root change; SVG goes through `SvgPreviewBox` in a shadow
root; missing/changed files show the right chip, not a broken image.

**Step 4 — Badges shared with SVG to upload**
Tests: `tests/stock_badges.test.tsx` — a badge created in either tab appears in
both; assignment toggled in one is visible in the other after one store
notification; apply-to-checked touches exactly the checked ids; one history
entry; filter by one/all/none. Change: bar controls wired to the existing
store/dialog components (no second catalog).

**Step 5 — Presets and credentials**
Tests: `tests/stock_presets.test.ts` — the built-in Shutterstock preset matches
the documented fields; a stored preset with junk drops itself; a hand-added
preset round-trips; `formats`/`zip` drive the checkbox availability.
`tests/stock_credentials.test.tsx` — saving writes only through the IDB vault
(nothing in localStorage/localStorage dumps, session snapshot or logs); an empty
password save does not destroy the stored one; a failed read reports
`unreadable`; the field never echoes the stored value.

**Step 6 — Run planner (pure)**
Tests: `tests/stock_plan.test.ts` — the `(row, site)` intersection matrix
(jpg-only package on an EPS/JPEG site sends jpg; svg-only package is skipped with
a reason; a checked kind no row has is reported once); `remoteName` is the
shared stem + real extension, and a record whose artifacts disagree on the stem
is refused, never renamed; ZIP wraps the row's other files and is refused where
the site/preset does not allow it; a `changed` file aborts that file only.

**Step 7 — Bridge route and client**
Tests: `tests/stock_ftpclient.test.ts` (fake fetch) — one request per file,
streamed body, no credential in any log line or thrown message, `exists` → the
refusal path, `AbortSignal` stops after the current file, a bridge that answers
non-JSON is a failed file with the status text. `tools/bridge/ftp.test.mjs`
(node, no network: a stub TLS server on loopback) — a successful STOR, a refused
login, an existing name, a cancelled transfer, and a log line that contains no
user, password or file name.

**Step 8 — The run: progress, cancel, report, sent stamps**
Tests: `tests/stock_run.test.tsx` — 3 rows × 2 sites with one refused and one
skipped produces the exact report sentence; cancel mid-run stops after the
current file and keeps finished files stamped; a re-run on unchanged content
offers "skip already sent" and skipping is the default; nothing is written to
the user's folder at any point (fake FS asserts an empty write log).

**Step 9 — CSV for the Submit page**
Tests: `tests/stock_csv.test.ts` — the header is exactly
`Filename,Description,Keywords,Categories,Illustration`; one row per uploaded
file, filename matching the sent name; draft rows marked; a description under
five words or a keyword count outside 7–50 is reported as a warning, not
silently accepted; the file name says `-draft` or `-exported`.

**Step 10 — Budgets, docs, browser lane**
Turn the Step 2 baseline into budgets (below), add
`tools/stock-upload-bench.mjs` (Playwright, `SELECTION_BROWSER_TOOLS` like the
existing bench), write the SOR pages, selectors, owners/storage/tests entries,
router rows, invariants (I-80…I-85) and the archive results section.

---

## 7. Acceptance criteria

### 7.1 Behaviour

1. A row exists **iff** a committed `export.json` names the file and it sits in
   that pair's `export/`; stray files, superseded artifacts and other folders
   never appear.
2. A row whose named file is missing or changed says so and cannot be uploaded
   until it is resolved (rescan or re-export in the other tab).
3. Selecting rows uses the shared RULE 25 contract, one history entry per
   gesture, undo across tabs (I-73), and the selection survives tab switches and
   rescans by id.
4. Badges are the same catalog and the same assignments in both tabs.
5. The formats sent for a `(row, site)` are exactly
   `checked ∩ available ∩ site.formats`; every empty intersection is reported
   with its reason; no file is ever renamed.
6. Shutterstock accepts EPS 8/10 only and 4–25 MP; the preset shows those rules
   and the run warns before sending an EPS outside them (a warning, never a
   block — the file is the user's).
7. Credentials never leave the device: IndexedDB only, never in a log, a toast,
   a CSV, `export.json`, the session snapshot or the URL.
8. With no bridge, Upload explains the requirement and offers Download; it
   never reports a success it did not have.
9. Nothing is written into the user's folder by this tab, ever.

### 7.2 Response budgets (1,000 / 5,000 rows, same harness as the 2026-10-26 pass)

| Metric @1,000 | Budget |
|---|---|
| mount, media-file reads | **0** |
| mount, `export.json` reads | exactly 1 per row |
| mount React | ≤ 700 ms (rows are lighter than SVG to upload: no document parse) |
| preview window on mount | ≤ 60 file reads |
| row click / ArrowDown / checkbox | ≤ 10 ms each, 0 media reads |
| zoom step | ≤ 50 ms, 0 reads, 0 parses |
| format/site checkbox | 0 row renders |
| badge toggle | ≤ 60 row renders, one localStorage write |

| Metric @5,000 | Budget |
|---|---|
| mount | completes ≤ 4 s, no commit over 250 ms |
| preview window | ≤ 60 reads regardless of row count |
| row click / arrow / checkbox | ≤ 15 ms |
| run start latency (plan built) | ≤ 300 ms for 500 selected rows |

Browser lane (`tools/stock-upload-bench.mjs`): mount-to-first-paint, zoom step
p95 ≤ 50 ms, row click p95 ≤ 50 ms — reported separately, since this sandbox has
no Chromium.

### 7.3 Gates

`npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
`npm run verify:fast`, `npm run verify`, `tests/docs_navigation.test.ts` (router
rows exist for the new tab, every current page < 9 KB, links valid), and the
new `tools/bridge` node test.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **The bridge is refused by the user** (it must be started per machine) | The plan states the constraint up front and ships the Download fallback; the alternative (a hosted server holding contributor credentials) is worse and is not built |
| Credentials in transit over loopback HTTP | Loopback only, origin allowlist, never logged, never persisted by the bridge, cleared after one request; localhost listeners are the same trust boundary the Inkscape bridge already relies on |
| A wrong `remoteDir` renames nothing but lands files somewhere unexpected | Preset shows the resolved remote path in the confirm line; empty means the account root, and the first real upload's answer is reported verbatim |
| Duplicate uploads across runs | `sent` stamps keyed by content hash + a default "skip already sent"; never-overwrite for the remote name |
| A 100 MB EPS on a slow link blocking the tab | Sequential per-file transfer with progress, cancel, and no UI work on the transfer path; the list stays interactive |
| Site rules drift (formats, limits) | The preset carries them as data with the help URL beside each; a stale value is a one-line preset edit, never a code change |
| The two tabs disagree about a package (one says fresh, one says stale) | Both read the same `export.json` and the same `outputs` hashes; staleness is computed by the same `staleOf`, not re-invented |
| Metadata edits silently "uploaded" | D9: edits are drafts, files go as committed, the CSV is the delivery route, and the run report says which rows went with older embedded metadata |
| ZIP checksum/format mistakes | ZIP is built by the existing JSZip dependency, in memory, only for presets that accept it; Shutterstock's preset refuses it up front |
| The tab contradicts the documented "no automatic website upload" promise | D8's consent confirmation, the OVERVIEW/RULE 20 wording amended in the same change, and a test that a run cannot start without the confirm |
| A sixth tab bloating the shell | The panel is lazy on first visit (same `visited` pattern as today's upload tab) and mounts nothing while hidden |
| Docs gates (router < 5 KB) | The router row is added by tightening the existing upload row, and `docs_navigation` runs before the commit |

---

## 9. Rejected alternatives

| Alternative | Why not |
|---|---|
| Do the FTPS transfer in the browser | No Web API opens FTP/FTPS; browsers removed FTP entirely. Not a library problem |
| A hosted relay that receives files and credentials | Sends contributor passwords to a third party; contradicts RULE 20 and the user's "local only" |
| A browser extension | A second deliverable, its own permissions and store review, for one route |
| Generate a FileZilla/WinSCP script and tell the user to run it | Not "upload from the app"; two tools to keep in sync; no per-file result to report |
| Reuse the export record as the upload ledger | It describes the *file on disk*, not delivery; mixing them would make a re-export look like a re-upload |
| Upload from the SVG-to-upload tab directly | That tab is about producing packages; delivery is a different verb with a different success condition, and the user asked for its own tab |
| ZIP everything and upload one archive | Shutterstock refuses archives, and per-file results would be lost |
| Virtualize the list | The established decision stands: every row is mounted, no hidden controls |
| Put the upload on the undo timeline | It cannot be undone; showing it as undoable would be a lie (RULE 4) |

---

## 10. Test plan (files)

| File | Covers |
|---|---|
| `tests/stock_tab.test.tsx` | sixth tab, session slice, lazy panel, empty state |
| `tests/stock_discover.test.ts` | export-only discovery, exclusions, path escape |
| `tests/stock_verify.test.ts` | named/size/hash/changed/missing promotion |
| `tests/stock_list.test.tsx` | mount, gestures, filters, chunking, budgets |
| `tests/stock_preview.test.tsx` | window, object URLs, SVG shadow path, chips |
| `tests/stock_badges.test.tsx` | shared store, apply, history, filter |
| `tests/stock_presets.test.ts` | built-in + stored presets, RULE 13 |
| `tests/stock_credentials.test.tsx` | IDB-only, empty save, unreadable read |
| `tests/stock_plan.test.ts` | intersection matrix, stems, ZIP rules |
| `tests/stock_ftpclient.test.ts` | one request per file, aborts, `exists` |
| `tools/bridge/ftp.test.mjs` | stub TLS server: STOR, login, exists, cancel, log |
| `tests/stock_run.test.tsx` | report sentence, cancel, stamps, no folder writes |
| `tests/stock_csv.test.ts` | exact header, filenames, warnings, draft marker |
| `tests/stock_perf_budgets.test.tsx` | §7.2 as failing-first budgets |

Every test uses the real modules (RULE 8) and the repo's fixture helpers
(`tests/helpers/{binfakefs,pairfile,svgpair,quiet,selectionload}.ts`). The
existing upload fixtures must be extended to write real `export.json` +
artifact bytes, which is the one shared helper this feature needs.

---

## 11. Documentation and gate work (same change as the code)

- `docs/current/sor/stock-upload.md` — behaviour, current-page contract;
- `docs/current/selectors/stock-upload.md` — every `data-testid` (bar, sites,
  formats, rows, previews, run dialog, report);
- `docs/current/sor/invariants/upload.md` — **I-80…I-85** (defined when built,
  not before): export-only rows; verified files only; local-only credentials;
  never overwrite; one honest run report; no folder writes;
- router row in `docs/current/README.md` (six tabs, under the 5 KB cap),
  `sor/OWNERS.md` + `owners/upload.md`, `sor/STORAGE.md` + `storage/upload.md`,
  `sor/TESTS.md` + `tests/upload.md`, `docs/HISTORY_INDEX.md`, and one blind
  dated `QUALITY_RECHECK.md` entry per pass.

---

## 12. Decisions this plan makes, and the ones worth confirming

Made here (changeable in one place if the answer differs):

1. Tab id `stockUpload`, label **Upload**; sixth position after "SVG to upload".
2. Badges are **shared** with SVG to upload (one store, one meaning).
3. The transfer runs through the existing loopback bridge, with Download as the
   no-bridge fallback.
4. Metadata edits are drafts; files are sent as committed; the CSV is the
   delivery route for edits.
5. Never overwrite by default; "skip already sent" is on by default.
6. Uploads are not on the undo timeline.

Worth a word from the user before implementation:

- **Is a local helper acceptable?** Nothing else can reach FTPS from a page.
  If not, the honest v1 is "prepare + download", which is a much smaller tab.
- **ZIP for Shutterstock** is refused by the site; keep the checkbox (disabled,
  with the reason) or drop it for this preset?
- **PNG** exists in the request but not in packages; keep the checkbox visible
  (disabled until a package has one) or hide it?
- **CSV** target: Shutterstock's four required columns include `Categories`,
  which our metadata model does not have. Default one category for all rows,
  or leave the column empty?

---

## 13. Status

- [x] Research: export contract, site rules, transport constraint, reuse map
- [x] Redesign: D1–D12, ordered Steps 0–10, budgets, risks, rejected options
- [ ] Implementation — not started (this pass is documentation only)

No file under `src/`, `tests/` or `tools/` was modified.
