# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).

## What the app does

Browser app that detects individual icons in a sprite sheet, lets the user review, resize and exclude them, and exports them as square PNGs — as a ZIP download, into a folder (Chrome/Edge File System Access), or copied to clipboard.

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4. Production build is one self-contained `dist/index.html` (`vite-plugin-singlefile`) that runs offline with no server.

## Pipeline (single source of truth: `src/lib/`)

| Stage | Function | Input → Output |
|---|---|---|
| Load | `loadImage` (App) | File → `HTMLImageElement` (object URL, revoked on removal) |
| Analyze | `analyze(img)` | image → `Analysis` (downscaled ≤4000px, border-median background, ink mask, adaptive threshold) |
| Detect | `detect(analysis, radiusFrac)` | mask → `Box[]` in natural-image coords, reading order (rows top→bottom, left→right); auto merge radius = most stable icon count across a radius sweep |
| Layout | `squareInfo(boxes, padding)` / `cropRect(box, total)` | boxes → one shared square size (largest icon side + padding %), centred crop per icon |
| Render | `renderIcon(...)` | source + box → square canvas (background fill or transparent, high-quality smoothing, optional fixed output size) |
| Deliver | `canvasToBlob` + App export paths | canvas → blob → ZIP / folder / clipboard |

## Invariants

* **I-1 (RULE 6):** every export contains exactly the currently included boxes of currently loaded sheets; excluded indices and removed sheets never reach output.
* **I-2 (RULE 4):** "no icons detected" and "image could not be read" are distinct, honestly reported states — never a fake success.
* **I-3 (RULE 11):** exclusion is a flag over an intact `boxes` array; detection is never re-run for include/exclude toggles.
* **I-4 (RULE 15):** a blob is delivered only after canvas dims > 0, blob non-null and size > 0; failures skip the item with an error, never a corrupt file.
* **I-5 (RULE 20):** image bytes never leave the browser; no network transmission of user content.
* **I-6 (RULE 22):** export file names derive from one naming function: sanitized sheet base + deterministic index in detection order.

## Flows

* **Add sheets:** drop/select image files → non-images filtered with a message → each file loaded, analyzed, auto-detected → sheet card appears, first sheet active.
* **Review:** preview grid shows detected boxes (checkerboard background), click to exclude/include, merge-radius slider per sheet (auto = `null`), re-detect on change.
* **Export all:** for each sheet, each included box → `renderIcon` with shared `ExportOpts` → ZIP via `jszip` (or folder save / clipboard for a single sheet where supported); progress reported per item (RULE 5).

## Legacy hotspots (RULE 16.5)

* `src/App.tsx` (598 lines at adoption) — do not grow; extract sheet/preview/export components on touch.
* `src/lib/detect.ts` (306 lines at adoption) — do not grow; extract `chooseAutoRadius` / reading-order helpers on touch.

## History

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana` `docs/current/AGENT_RULES.md` (this adoption is the first doc; no archive entries yet).
