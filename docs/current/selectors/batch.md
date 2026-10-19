# Batch folders — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## L. Batch panel — `src/batch/*`

Primary header controls:

| Test id | Visible text | Notes |
|---|---|---|
| `batch-root` | `Choose source folder…` → `Root: {name}` | opens directory picker (`picker.ts`); Chrome/Edge File System Access; label mirrors state (RULE 24) |
| `batch-rescan` | `↻ Rescan` | re-walks root; gated on handle + permission (the row testid changed from the old `batch-refresh` — verified in `BatchSourceBar.tsx` 2026-10-15) |
| `batch-process` | `▶ Split selected` | disabled when 0 selected (RULE 4) |
| `batch-cancel` | `✕ Stop` | shown only while busy; sets the stop signal |
| `batch-dest` | `Choose destination…` | custom destination picker; null ⇒ `<root>/_split_output` |

Status + warning surfaces:

| Test id | Element | Notes |
|---|---|---|
| `fs-warning` | amber banner | File System Access unsupported (non-Chromium); honest degrade |
| `ref-warnings` | amber paragraph | references missing for one or more sources |
| `batch-busy` | fixed overlay | present only while a batch runs; message inside (RULE 5) |
| `batch-toast` | bottom toast | green/rose; text is the assertion target (RULE 2, RULE 4) |

PresetBar — `preset-bar` panel:

| Test id | Control | Range / values |
|---|---|---|
| `preset-name` | preset name text input | current preset label |
| `preset-save` | button `Save` | persists under `name.trim() || preset.name` |
| `preset-list` | preset `<select>` | list of saved presets; first option is the `Load preset…` placeholder |
| `preset-delete` | button `Delete` | removes preset by trimmed name |
| `batch-padding` | range 0–25 | per-side padding %, shared with sheets |
| `batch-size` | select | 0 (auto) / 128 / 256 / 512 / 1024 / 2048 |
| `batch-transparent` | checkbox | transparent background on/off |
| `batch-ignore` | comma list | directories/files skipped by the walk |

Review window (scan table) — `scan-table` panel:

| Test id | Element | Notes |
|---|---|---|
| `select-all` | button in header | toggles every eligible row; label reflects state (RULE 24) |
| `row-select-{relPath}` | per-row checkbox | `relPath` is the scan-relative path |
| `row-open-{relPath}` | per-row `copy path` button | clipboard-path fallback for "Open in Explorer" (honest, RULE 2) |
| `batch-row-locate-{relPath}` | per-row "📍 Location" button | processed rows with a session output folder: copies `<dest base>\<outRel>` (splits folder); hidden after a reload (archive/2026-10-15-row-location) |
| `batch-bulkbar-pin` | sticky wrapper of the split controls bar | pins the bar to the top while rows scroll (`position: sticky` in `.app-main`; archive/2026-10-16-pinned-bulkbar) |

Restart access (I-66) — `BatchPanel.tsx` `GrantBar` (verified 2026-10-15):

| Test id | Visible text | Notes |
|---|---|---|
| `batch-grant-bar` | `The browser needs your OK to re-open "<name>" — previews are already restored.` | shown only while the restored root's permission is `"prompt"`; boot itself never prompts |
| `batch-grant` | `Restore access` | the one click; spends the user gesture on `requestPermission`, then scans; a refusal stays honest (toast + bar stays) |

Preview staleness (I-68): `batch-preview-count-{relPath}` carries
`data-stale="true"` plus a `⟳` marker while the stored record was rendered
under other settings; Preview re-renders stale rows, Regenerate overwrites them.

Bulk bar (selection actions) — `BatchBulkBar.tsx` (verified 2026-10-15):

| Test id | Visible text | Notes |
|---|---|---|
| `batch-selected-count` | `N selected` | live count of checked rows |
| `batch-preview` | `◉ Preview splits` → `◍ Previewing…` | renders previews for checked rows, skipping rows whose stored preview is current |
| `batch-regenerate` | `↺ Regenerate splits` | force=true — re-renders AND overwrites the stored record, even when one exists |
| `batch-warning-selected` / `batch-approve-selected` / `batch-decline-selected` | `⚠ Warning selected` / `✓ Approve selected` / `✕ Decline selected` | bulk review decisions |
| `batch-zoom` | thumb-size slider | `batch-thumb` range input |

Preview results (row level): `batch-preview-count-{relPath}` (e.g. `4 icons`),
`batch-preview-strip-{relPath}`, `batch-preview-thumb-{relPath}-{n}`.

Semantic fallbacks: button/select/input role + visible text; `row-*` ids use
the data `relPath`, so tests should build handles from the scanned entry.
