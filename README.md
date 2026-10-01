# Icon Splitter

A browser app with two modes:

- **Sheet editor** — detects individual icons in a sprite sheet / icon sheet,
  lets you review, resize and exclude them, and exports the result as PNG
  files (download as ZIP, save to a folder in Chrome/Edge, or copy to
  clipboard).
- **Batch folders** — recursively scans a folder tree for `*_AI` icon sheets,
  shows them in a review list with per-file status tracking, and splits the
  selected ones into a timestamped output tree. Scan/process settings can be
  saved as named presets.

The app is built with **React + Vite + TypeScript + Tailwind CSS** and compiles
into a **single self-contained HTML file** (`dist/index.html`) that runs in any
modern browser — no server, no Python, no installation required.

---

## Prerequisites

| Tool | Version | Where to get it |
|------|---------|-----------------|
| [Node.js](https://nodejs.org/) (LTS) | 20.19+ or 22.12+ | https://nodejs.org/ |
| npm | comes bundled with Node.js | — |
| A modern browser | Chrome / Edge / Firefox | — |
| [PyCharm](https://www.jetbrains.com/pycharm/) (optional) | any recent version | only needed if you want to edit the code |

> This is **not** a Python project — Node.js is the only runtime needed.
> PyCharm is used purely as the editor/IDE.

---

## Quick start on Windows (batch files)

Double-click these files in the project folder, in order:

| File | What it does |
|------|--------------|
| `install_dependencies.bat` | Checks that Node.js is present and runs `npm install` |
| `run_app.bat` | Builds the app and **opens it in your default browser** as a standalone browser app (no server needed) |
| `run_dev_server.bat` | Starts the live-reload dev server at http://localhost:5173/ and opens the browser (use this while editing code; press `Ctrl+C` in the window to stop) |

Typical first run:

```
1. Double-click  install_dependencies.bat
2. Double-click  run_app.bat
```

After `run_app.bat` finishes, the app lives in `dist\index.html` — you can copy
that one file anywhere and open it directly in a browser.

---

## Manual setup (any OS)

From the project root:

```bash
# 1. Install dependencies (creates node_modules/)
npm install

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
   npm install
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

## Project rules (code quality)

Every change to this codebase must follow the code-quality rules in
[`docs/current/AGENT_RULES.md`](docs/current/AGENT_RULES.md) (24 rules — size,
complexity, testing, docs and behaviour gates, adopted from the sister project
`Process-Images-in-Areana`). Before every push run the verification lanes:

```bash
npm run verify        # types + lint + quality gate + tests + coverage + build
npm run hooks:install # optional: enforce it automatically via a pre-push hook
```

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
│   ├── main.tsx             # React bootstrap (renders Shell)
│   ├── App.tsx              # Sheet editor UI
│   ├── ui/Shell.tsx         # Tab shell (Sheet editor / Batch folders)
│   ├── ui/batch/            # Batch UI: panel, folders, presets, settings,
│   │                        # review list, process bar + scan/process flows
│   ├── batch/               # Batch domain: naming, scan, process, status,
│   │                        # presets, FS boundary, review-state reducer
│   ├── lib/detect.ts        # Icon detection on the sheet
│   └── lib/render.ts        # Cropping / resizing / export logic
├── tests/                   # Vitest — real logic incl. fake-FS batch runs (RULE 8)
├── tools/                   # RULE 16 quality gate + pre-push check
├── docs/                    # Rules + verification docs (see docs/README.md)
├── install_dependencies.bat # Windows: npm install
├── run_app.bat              # Windows: build + open in browser
└── run_dev_server.bat       # Windows: live-reload dev server
```

## Batch folders — how it works

1. Open the **Batch folders** tab and pick a **source folder** (Chrome/Edge).
   The app scans it recursively for `*_AI.png`-style sheets and links each to
   its `<base>` reference image (e.g. `icon_AI.png` → `icon.png`).
2. Review the list: thumbnail, file name, relative path and status per row.
   Use the checkboxes (or Select all / Deselect all) to choose what to
   process. Each row's 📋 Path button copies its location — browsers cannot
   open File Explorer directly.
3. Press **Process selected**. Every run rescans first; files whose reference
   image is missing ask whether to skip them or continue anyway. Output lands
   in `<source>/_split_output/<month>/<timestamp>/…` (or your custom
   destination), existing files are never overwritten, and a `<base>.json`
   status file next to each reference remembers what was processed.
4. Save your folder + settings setup as a **preset** to reuse it later; the
   last-used preset reloads automatically.

## Notes

- The production build (`npm run build`) inlines all JS/CSS into
  `dist/index.html` via `vite-plugin-singlefile`, which is why the app can run
  by just opening that file — perfect for use as a portable browser app.
- Saving directly to a folder only works in Chromium browsers (Chrome/Edge);
  in other browsers use the ZIP export. Batch folder picking likewise needs
  Chrome/Edge.
