# SVG builder — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) >
class fragment (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## T. SVG builder — `src/builder/*` (verified 2026-11-07)

Prefix is `builder-`. The panel root carries `svg bld`, so the shared tab look applies
and `.bld-*` styles cannot leak into another tab.

Shell and source bar:

| Test id | Element | Notes |
|---|---|---|
| `tab-builder` | nav button, visible text `SVG builder` | after `tab-upload`, before `tab-stock-upload` |
| `builder-shell` | shell wrapper | `hidden` while another tab is open; the same node returns to the tab |
| `builder-panel` | panel root | a supported browser with no scan yet |
| `builder-panel-unsupported` | panel root | no File System Access API; carries `builder-unsupported` |
| `builder-unsupported` | note + `Try the folder picker anyway` | the browser cannot open folders |
| `builder-root-empty` | note + `builder-open-folder-empty` | supported, nothing picked |
| `builder-source` | source-bar container | the shared furniture |
| `builder-open-folder` | green `Open folder` | the one way in (I-44) |
| `builder-rescan` | `↻ Rescan` | hidden before a folder is picked; its label is the busy words |
| `builder-scope-copy` | text | "Approved SVGs only · recursive · N icons" / "no folder picked" |
| `builder-folder-path` | read-only path row | the picked folder's complete path (I-46) |
| `builder-audit` | text | one line: files · SVG files · approved · not listed · corrupt pair files · unreadable |
| `builder-toast` | `role="status"` line | one transient sentence; absent when there is nothing to say |

The library rail (P1):

| Test id | Element | Notes |
|---|---|---|
| `builder-library` | rail section, `aria-label="Approved icons"` | absent while no folder is picked |
| `builder-library-empty` | note | picked, but nothing approved: says how many pairs were not approved |
| `builder-search` | `type="search"` input | name, folder or tag |
| `builder-search-clear` | text button | resets search + folder chip together |
| `builder-facet-folder` | chip per folder, `aria-pressed` | toggles that folder; label `<folder> <count>` |
| `builder-icon` | row (one per icon) | `data-icon-id`; `title` carries path, version and tag source |
| `builder-icon-name` | row text | the pair's own name, separators opened up |
| `builder-no-match` | note | a filter matched nothing (never an empty rail pretending to be the library) |

The artboard (P2):

| Test id | Element | Notes |
|---|---|---|
| `builder-artboard` | `<section aria-label="Sheet preview">` | the sheet's own `<svg>` canvas, scaled for the screen only |
| `builder-artboard-size` | text | `1000 × 800` — the artboard's real pixel size |
| `builder-zoom` | text | the on-screen scale, e.g. `76%` |
| `builder-capacity` | text | `n / capacity used` |
| `builder-canvas` | `<svg>` | one viewBox at the artboard size; the export writes the same geometry |
| `builder-paper` | `<rect>` | the sheet background (transparent export differs here) |
| `builder-banner` | `<g>` | present only when a banner position is set |
| `builder-cell` | `<g>`, one per grid position | `data-cell` = index, `data-icon-id` = placed icon or `""` for a hole |
| `builder-cell-icon` | `<g>` | the sanitised artwork, positioned by the layout |
| `builder-cell-caption` | `<text>` | the icon's own name, honouring `captions`/`captionCase` |
| `builder-cell-refused` | `<g>` + `data-refusal` | the icon exists but cannot be drawn; the kind says why |
| `builder-cell-loading` | `<text>` | the artwork is still being read (`…`) |
| `builder-overflow` | `role="status"` note | the grid had to shrink; it states the percentage |

The sheet controls (P3) — every field is clamped by `lib/builder/config`:

| Test id | Element | Notes |
|---|---|---|
| `builder-controls` | `<section aria-label="Sheet controls">` | groups + one honest note about what P4 adds |
| `builder-controls-sheet` / `-grid` / `-captions` | group containers | the three groups |
| `builder-width`, `-height`, `-padding` | number inputs | artboard, 256–4096 / 0–200 |
| `builder-paper` (colour input) | `type="color"` | note: the artboard's `<rect>` uses `builder-paper` too; the input is `builder-paper` inside `builder-controls` |
| `builder-columns`, `-rows` | number inputs | 1–16 each |
| `builder-gap-x`, `-gap-y` | number inputs | 0–200 |
| `builder-box` | number input | icon box, 8–400 |
| `builder-caption-case` | `<select>` | `As written` / `UPPER` |
| `builder-caption-size` | number input | 4–40 |
| `builder-captions` | checkbox | show captions |
| `builder-controls-note` | text | says recipes/locks are not here yet |

The recipe (P4):

| Test id | Element | Notes |
|---|---|---|
| `builder-recipe` | `<section aria-label="Icon recipe">` | mode, its own fields, the seed, two actions |
| `builder-recipe-mode` | `<select>` | similar / filtered / random |
| `builder-threshold` | number input | similar mode only, 0–100 |
| `builder-recipe-folder`, `builder-recipe-tag` | selects | filtered mode only |
| `builder-seed` | number input | positive; the same seed reproduces the sheet |
| `builder-reroll` | button `↻ New sheet` | new seed → a different sheet |
| `builder-clear` | text button | empties every cell; the recipe is untouched |
| `builder-recipe-note` | text | shortfall, repetition, stale locks, scoring basis — in one sentence |

Export (P5):

| Test id | Element | Notes |
|---|---|---|
| `builder-export` | `<section aria-label="Export the sheet">` | |
| `builder-png-scale` | `<select>` | options state the real pixels (`2× — 2000×1600`) |
| `builder-download-svg`, `-png`, `-zip` | buttons | local downloads, no disk access |
| `builder-commit` | button `Save to builder/` | disabled without a folder; its label is the busy words |
| `builder-export-note` | text | where files go, or why they cannot yet |
| `builder-export-last` | `role="status"` | what landed — and why the rest did not |

Later phases add `builder-meta-*`, `builder-recipe-*`, `builder-stage`,
`builder-artboard`, `builder-cell-{n}`, `builder-<section>-*` controls, `builder-export-*`
each is added here in the same change that introduces it (RULE 17).
