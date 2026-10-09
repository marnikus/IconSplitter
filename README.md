# Icon Splitter

A browser app that detects individual icons in a sprite sheet / icon sheet,
lets you review, resize and exclude them, and exports the result as PNG files
(download as ZIP, save to a folder in Chrome/Edge, or copy to clipboard).

It has six modes (tabs across the top):

* **Single sheets** — the original workflow: upload sheets, review detection,
  export icons.
* **Batch folders** — point the app at a folder tree of `*_AI` sheets and let
  it scan, review, split and write everything in one pass, preserving your
  folder hierarchy (see below). Batch mode requires **Chrome or Edge**.
* **Selection** — review every original next to its `_AI` result, approve or
  decline each pair, and keep every decision in the pair's **own** JSON file,
  beside its images (`<name>.svg.json` — the file also records the SVGs
  generated from that pair; filters by month/date range, sorting, search,
  hotkeys A/D). Also Chrome/Edge only.
* **Selection V2** — the same review data in a denser, table-like layout:
  a full-width list where every row shows the original and the AI result side
  by side, a thumbnail zoom slider (48–240 px, remembered between sessions),
  checkboxes with select-all, and **Approve selected** / **Approve visible
  list** for bulk decisions. A second layout switches to the large
  side-by-side comparison. Also Chrome/Edge only.
* **Generate SVG** — for the pairs Selection approved, sends the AI image
  (alone, or as one square contact sheet of up to 9) to Requesty's
  OpenAI-compatible chat endpoint with your own API key, and writes one
  validated, versioned `<name>.svg` beside each AI image and records each
  version — prompt, model, token usage, cost, validation and review state — in
  that pair's own `<name>.svg.json` next to it (the same file that holds the
  pair's approval: no separate global metadata file exists). Nothing is
  uploaded anywhere else and the key never leaves the browser. Also Chrome/Edge
  only.
* **SVG to upload** — takes the chosen, approved SVG version of each icon and
  builds its upload-ready package beside the sources: an artboard fitted to
  the artwork as it ships (or pinned to a size, or scaled to N megapixels)
  with the chosen background and stroke width, conceptual metadata from the model,
  SVGO-optimised SVG, a 15.1 MP JPEG, an optional EPS and a per-icon
  `export.json`. Nothing is uploaded to any website by the app. Also
  Chrome/Edge only.

The app is built with **React + Vite + TypeScript + Tailwind CSS** and compiles
into a **single self-contained HTML file** (`dist/index.html`) that runs in any
modern browser — no server, no Python, no installation required.

> **AI agents** working in this repository: read [`AGENTS.md`](AGENTS.md) first —
> pinned environment, exact commands, what to read per task, hard limits.

---

## Prerequisites

| Tool | Version | Where to get it |
|------|---------|-----------------|
| [Node.js](https://nodejs.org/) (LTS) | **22.12.0** pinned in `.nvmrc` (20.19+ or 22.12+ supported, enforced by `.npmrc`) | https://nodejs.org/ |
| npm | 10+ (`packageManager` in `package.json`) | comes bundled with Node.js |
| A modern browser | Chrome / Edge / Firefox | batch mode needs Chrome or Edge |
| [PyCharm](https://www.jetbrains.com/pycharm/) (optional) | any recent version | only needed if you want to edit the code |

> This is **not** a Python project — Node.js is the only runtime needed.
> PyCharm is used purely as the editor/IDE.

---

## Quick start on Windows (batch files)

Double-click these files in the project folder, in order:

| File | What it does |
|------|--------------|
| `install_dependencies.bat` | Checks that Node.js is present and runs `npm ci` (clean install from `package-lock.json`) |
| `run_app.bat` | Builds the app and **opens it in your default browser** as a standalone browser app (no server needed) |
| `run_dev_server.bat` | Starts the live-reload dev server at http://localhost:5173/ and opens the browser (use this while editing code; press `Ctrl+C` in the window to stop) |
| `run_inkscape_bridge.bat` | Starts the **Inkscape EPS helper** on http://127.0.0.1:47391 (optional — see below); keep its window open while exporting |
| `run_app_inkscape.bat` | Builds the app, starts the helper and opens the app **through it** (`http://127.0.0.1:47391/`) — the no-fuss way to use the Inkscape converter |

Typical first run:

```
1. Double-click  install_dependencies.bat
2. Double-click  run_app.bat
```

After `run_app.bat` finishes, the app lives in `dist\index.html` — you can copy
that one file anywhere and open it directly in a browser.

---

## Inkscape EPS converter (optional)

The **SVG to upload** tab writes EPS with its built-in writer by default (an
EPS 10 subset document that the app also *executes* through a PostScript stack
checker before it is written, so a file Illustrator would refuse is reported
as a partial export instead). The export settings offer a second converter, **Inkscape CLI (local helper)**,
which hands the prepared SVG to a real Inkscape on your machine — for stocks
whose EPS checks are stricter than the built-in subset.

1. Install Inkscape 1.x from https://inkscape.org (or set `INKSCAPE_PATH`
   to its `inkscape.com`).
2. Start the helper: `run_inkscape_bridge.bat` (any OS:
   `node tools/bridge/server.mjs [--port 47391] [--inkscape <path>]`). It
   binds **127.0.0.1 only**; its log names method, status, duration and byte
   counts — never your artwork or file names.
3. In the export settings pick **EPS converter → Inkscape CLI (local
   helper)**. The helper row shows the live state (`helper running · Inkscape
   1.3.2`, or what to do), **Check** re-probes, and the URL is editable.
4. Export as usual. If the helper is down the batch says so up front and
   those rows land **Partial** — the SVG and JPEG still commit.

`run_app_inkscape.bat` opens the app from the helper's own address, so the
browser never has to cross origins (Chrome's Private Network Access rules
for `file://` pages do not apply). Opening `dist\index.html` directly also
works: the helper answers the preflight for `file://` and `localhost` pages.

---

## Manual setup (any OS)

From the project root:

```bash
# 1. Install dependencies from the lockfile (creates node_modules/)
npm ci
# (or `npm run setup` = npm ci --prefer-offline --no-audit --no-fund)

# 2a. Run as a browser app (production build, no server)
npm run build
# then open dist/index.html in your browser

# 2b. Or run the dev server with live reload
npm run dev
# then open http://localhost:5173/
```

---

## Running it from PyCharm

1. **Open the project** — PyCharm → *File → Open…* → select the `IconSplitter`
   folder → *Trust Project*.
   (No interpreter setup is needed; if PyCharm asks for a Python interpreter,
   just skip it.)
2. **Install dependencies** — open PyCharm's built-in terminal
   (*View → Tool Windows → Terminal*) and run:
   ```bash
   npm ci
   ```
   (Or simply run `install_dependencies.bat` from Explorer once.)
3. **Run the app** — pick one of these:
   - **As a browser app:** run `npm run build` in the terminal, then
     right-click `dist/index.html` in the Project panel → *Open In → Browser*.
   - **As a dev server:** right-click `package.json` in the Project panel →
     *Show npm Scripts*, then click the ▶ button next to `dev`; or create a
     run configuration via *Run → Edit Configurations… → + → npm*
     (Command: `run`, Scripts: `dev`). Open http://localhost:5173/ in your
     browser. The page live-reloads on every code change.
4. *(Optional)* PyCharm will suggest installing the TypeScript/JS plugins if
   they are disabled — accept, to get full editing support.

---

## Batch mode (Chrome / Edge only)

Switch to the **Batch folders** tab to process a whole directory tree of
sheets in one go.

1. **Choose source folder** — the app walks the folder recursively, keeps your
   relative paths, and collects every `*_AI` image with a numeric tail
   (`*_AI_7`, `*_AI_9_01`, …). Each source
   gets a status file `<base>.json` next to its reference image, tracking
   `unprocessed / processed / changed / missing / deleted` per record.
2. **Review** — a table shows thumbnails, filenames, relative paths and
   status. Tick rows, use **Select All**, or **copy a file path** when you'd
   rather open the file yourself (browsers can't launch Explorer directly).
   Missing reference files are called out up front.
3. **Presets** — every split setting (padding, size, transparency, ignore
   list, destination) is saved per named preset; the last-used preset and the
   chosen folders are remembered for the next session.
4. **▶ Split selected** — only `*_AI` images are split; their reference image
   is copied untouched into every output sub-folder. Results land in
   `<destination>/YYYY-MM/YYYY-MM-DD_HH-mm-ss/<your-folder-layout>/…`, one
   `split_NN/` folder per source. The default destination is
   `<source>/_split_output`, or pick a custom folder.

Nothing is ever overwritten: if an output name already exists, a `_v02`,
`_v03`, … suffix is used instead, and existing files in your source tree stay
untouched. The app re-scans before every run, so files added, changed or
removed between runs are detected and reported.

> Batch mode uses the browser's File System Access API, which today only
> Chrome and Edge support. Firefox/Safari users can still use Single sheets
> mode (ZIP export).

---

## Undo, redo and the last session

`Ctrl+Z` undoes the newest reversible action from **any** tab, `Ctrl+Shift+Z`
(or `Ctrl+Y`) redoes it, and the toolbar above the tabs names what each will do
("Undo: Approve 3 pairs") and stays disabled when there is nothing to do. One
bulk action is always one history entry, so undoing a bulk approve restores all
of its pairs at once.

Reversible: decisions (approve / decline / **reset to pending**), checkbox
selection, filters, sort, date range, view prefs, and the sheets export
settings. Not reversible, and never reported as such: batch processing, ZIP or
clipboard export, picking a folder, and switching tabs.

The last session — active tab, folders' review state, filters, sort, selected
and checked rows, thumbnail zoom, sheets settings — is restored on the next
start. A folder or file that has since disappeared is reported, never hidden.

## Selection V2 (Chrome / Edge only)

The **Selection V2** tab reviews the same pairs as **Selection**, but as a
fast bulk-review table. Both tabs share one root folder and the same decisions:
each approval is written to the pair's own `<name>.svg.json` beside its images,
so a folder keeps its approvals when it is renamed, moved or opened on its own.
An older `review-decisions.json` at the root is still **read** as a fallback for
pairs that have no file of their own, and is never written again.

1. **Choose source folder** (or **↻ Rescan**) — the folder is walked
   recursively; every `name.ext` is paired with its `name_AI.ext`. Files
   without a partner stay visible as **AI result missing** / **Original
   missing** instead of disappearing.
2. **Zoom** — drag the `ZOOM` slider to set the maximum thumbnail height in
   pixels (48–240, default 84). Row height and both thumbnails resize while
   you drag, the aspect ratio is preserved, and the value is remembered the
   next time you open the app.
3. **Select** — tick individual rows, use the header checkbox (it shows a
   mixed state when only some rows are ticked), **Select visible** or
   **Deselect all**. Selection is independent of the review status and
   survives filtering and sorting; rows hidden by a filter are counted and
   never changed behind your back.
4. **Approve in bulk** — **✓ Approve selected (n)** or **✓ Approve visible
   list (n)**. The count is part of the button, the button asks you to confirm
   before writing, and the whole batch produces a single message such as
   `12 pairs approved · 2 skipped (incomplete or gone)`.
5. **Decide one by one** — click a row to make it the *active* row (highlighted
   with a violet bar), then press **A** to approve or **D** to decline. With
   **Next pending after a decision** on, the active row jumps to the next
   unreviewed pair; **↑ / ↓** move it manually.
6. **Filter and sort** — date mode (All / Month / Range with From and To),
   status, pairing (complete or missing pair), sort by created date, status,
   filename or path, and **× Clear filters**.
7. **Comparison layout** — switch to *Comparison* for a large side-by-side
   view of the active pair with dimensions, format, size and path per side.

Decisions are written to the pair's own `<name>.svg.json` beside its images. If
a file cannot be written, that decision stays in memory, a warning names the
pairs involved, and **↻ Retry write** saves exactly those pairs once the folder
is writable again — no other file is touched.

---

## Project rules (code quality)

Every change to this codebase must follow the code-quality rules in
[`docs/current/AGENT_RULES.md`](docs/current/AGENT_RULES.md) (24 rules — size,
complexity, testing, docs and behaviour gates, adopted from the sister project
`Process-Images-in-Areana`). Before every push run the verification lanes:

```bash
npm run verify:fast   # every commit: types + lint + gate + one suite run + build
npm run verify        # before push: adds the standalone test lane (what the hook runs)
npm run hooks:install # optional: enforce the full gate automatically via a pre-push hook
```

Both run through `tools/verify.mjs` (node — no bash needed on Windows).

Current behaviour and invariants are documented in
[`docs/current/SYSTEM_OF_RECORD.md`](docs/current/SYSTEM_OF_RECORD.md); the
verification workflow lives in
[`docs/current/CODE_VERIFICATION.md`](docs/current/CODE_VERIFICATION.md); the
doc map is [`docs/README.md`](docs/README.md).

## Project structure

```
IconSplitter/
├── index.html               # Entry HTML (Vite)
├── package.json             # Dependencies & npm scripts (dev/test/verify)
├── vite.config.ts           # Vite config (single-file build enabled)
├── src/
│   ├── main.tsx             # React bootstrap
│   ├── App.tsx              # Single-sheets UI
│   ├── ui/Workbench.tsx     # Mode shell — sheets / batch / selection / V2 tabs
│   ├── batch/               # Batch mode (store, process, presets, UI)
│   ├── selection/           # Selection review (state, decision IO, V1 UI)
│   ├── selectionv2/         # Selection V2 (list review, bulk bar, zoom)
│   ├── lib/                 # Pure logic: detect, render, naming, scan, fs,
│   │                        # statefile, presets, output plan, batchsplit
│   ├── lib/render.ts        # Cropping / resizing / export logic
│   └── lib/upload/          # SVG to upload: prepare, bake, stroke expand, EPS converters (epsconv/), export record
├── tests/                   # Vitest — real detect/render/batch logic (RULE 8)
├── tools/                   # RULE 16 quality gate + verify runner + bridge/ (the Inkscape helper)
├── docs/                    # Rules + verification docs (see docs/README.md)
├── design/                  # UI handoff templates (SPEC.md contract: design/README.md)
├── AGENTS.md                # AI-agent bootstrap: pins, commands, reading protocol
├── install_dependencies.bat # Windows: npm ci
├── run_app.bat              # Windows: build + open in browser
├── run_app_inkscape.bat     # Windows: build + Inkscape helper + open the app through it
├── run_inkscape_bridge.bat  # Windows: the Inkscape EPS helper alone
└── run_dev_server.bat       # Windows: live-reload dev server
```

## Notes

- The production build (`npm run build`) inlines all JS/CSS into
  `dist/index.html` via `vite-plugin-singlefile`, which is why the app can run
  by just opening that file — perfect for use as a portable browser app.
- Saving directly to a folder only works in Chromium browsers (Chrome/Edge);
  in other browsers use the ZIP export.
