# SVG to upload — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

## R. SVG to upload — `src/upload/*` (verified 2026-10-07)

Source: `UploadControls.tsx`, `UploadBulkBar.tsx`, `UploadList.tsx`,
`UploadRow.tsx`, `UploadMetaFields.tsx`, `UploadSettingsDialog.tsx`,
`UploadPreview.tsx`, `UploadPanel.tsx`. The panel root carries both `svg` and
`up` classes, so the whole Generate SVG look applies; `.up-*` CSS adds the row
grammar with the expandable metadata detail, the package-status badge colours
and the settings dialog's inherited/overridden markers.

Source bar (always rendered — `upload-open-folder` is the one way in;
`upload-root-empty` / `upload-unsupported` are the two empty states):

| Test id | Element | Notes |
|---|---|---|
| `upload-open-folder` | green `Open folder` button | the shared control (I-44), offered whether or not a root is loaded; `upload-root-empty`'s button is `upload-open-folder-empty` |
| `upload-folder-path` | read-only path row | the picked folder's **complete path**, full-width below the bar (I-46) |
| `upload-rescan` | `↻ Rescan` | re-walks the root (busy label while scanning) |
| `upload-scope-copy` | text | "Approved SVGs only · recursive · N icons" |
| `upload-audit` | text | the scan's one audit line: rows · SVG files · pairs not listed · corrupt pair files |
| `upload-count-{icons,processed,partial,failed,stale}` | counter chips | live counts; a failed run counts even with record null |

Metadata prompt panel (`upload-prompt-panel`, its own section beside the Gemini
card — never inside it) and the provider card:

| `upload-prompt-copy` | text | "Metadata prompt · saved locally · default/custom" |
| `upload-prompt-reset` | link | restores the documented default prompt |
| `upload-prompt` | `textarea` | the EDITABLE prompt the one confirmed request carries and the export record names |
| `upload-prompt-note` | note | stored locally · the validator still enforces the default prompt's rules |
| `upload-preset-list` | `select` | saved prompt presets ("Pick a saved prompt (N saved)") |
| `upload-preset-quick-load` / `upload-preset-delete` | buttons | act on the picked preset; disabled until one is picked |
| `upload-preset-name` / `upload-preset-save` | input + button | Save as: a named snapshot of exactly the editor's text |
| `upload-settings-open` | button | opens the global-defaults settings dialog — it lives in the bulk bar BESIDE THE ZOOM controls (`upload-bulk-right`) |
| `upload-bulk-right` | container | the bulk bar's action half: preview background, zoom, export settings, progress, the bulk actions |
| `upload-provider-card` | card | minimizable via `upload-provider-toggle` (`aria-expanded`) |
| `upload-provider` / `upload-limits` | text | "Gemini · metadata generation" / "{timeout}s timeout · N retries · N parallel" |
| `upload-provider-grid` | grid | Model, Endpoint (full-width row), Timeout, Retries, Parallel — one contained grid |
| `upload-model` / `upload-endpoint` | `input` | the model id (verified default `gemini-3.1-flash-lite`) and the base URL |
| `upload-provider-check` | row | the model check: `upload-model-check` + `upload-model-state` |
| `upload-model-check` | `button` | asks the provider's own model list; never substitutes the configured id |
| `upload-model-state` | `p[data-state]` | the check's one line: `idle` / `checking` / `found` / `missing` / `failed` |
| `upload-timeout` / `upload-retries` / `upload-concurrency` | `input[type=number]` | clamped at the moment of change (5–900 s, 0–5, 1–8) |
| `upload-key-state` | button | masked key, with the honest state AND its origin: "Gemini API key secured locally" / "Gemini key kept for this session only" / "Storage could not be read" / "No Gemini API key yet"; opens the editor |
| `upload-key-mask` / `upload-key-note` | rows of `upload-key-state` | the masked key above "stored in IndexedDB · masked in the UI · redacted from logs · excluded from exports"; a session-only key says "browser storage refused it — paste again after a reload", an unreadable store says "this device's storage is unreadable here (private mode?)" |
| `upload-key-forget` | button | shown only while a key is in hand; deletes the stored key from this device (the one deliberate way to clear it) |
| `upload-key-input` / `upload-key-save` / `upload-key-cancel` | editor | `input[type=password]`, `aria-label="Gemini API key"`; `upload-key-save` is `disabled` while the field is empty (an empty Save never erases the stored key) |
| `upload-provider-note` | note | endpoint · the key travels in the `x-goog-api-key` header only · each icon's image is sent only inside the one request you confirm · nothing is ever uploaded automatically |

Filters: `upload-filter-status` (all / processed / partial / failed / cancelled /
stale / not exported), `upload-filter-metadata` (all / empty / generating /
generated / invalid / accepted / interrupted), `upload-sort` (name / package
status / metadata state), `upload-search`, `upload-shown` ("Showing N of M"),
`upload-clear-filters`.

Bulk bar (`upload-bulk`):

| `upload-check-all` | header checkbox | checked / unchecked / **indeterminate**; scope = the filtered list |
| `upload-selected-count` / `upload-scope` | text | "N selected", "across N approved SVGs" |
| `upload-select-visible` / `upload-deselect` | buttons | scope = what the filters show |
| `upload-thumb` | `input[type=range]` | the ONE zoom value: 48–800 px step 4, display-only (never the output scale); `upload-thumb-value` is the live readout |
| `upload-bg` | swatch group | preview background: `upload-bg-{white,black,gray,green,red}` (`aria-pressed`), `upload-bg-custom` (`input[type=color]`), `upload-bg-value` |
| `upload-estimate` / `upload-progress` | text | the selection line, or "{kind} {done}/{total}" while a run is in flight |
| `upload-apply-settings` | button | pins the current defaults onto the selection — ONE undoable `uploadSettings` entry |
| `upload-meta-selected` | button | "✦ Generate metadata (N)" — N = selected icons with NO metadata text yet; the paid request never replaces existing text (disabled at 0 selected; at N = 0 the status line says why nothing was sent) |
| `upload-meta-regenerate-selected` | button | "↻ Regenerate metadata (N)" — N = selected icons whose metadata is non-null; opens an exact-request confirmation/previews for only those rows, excluding empty rows (disabled at 0 eligible rows) |
| `upload-export-selected` | button | "⇪ Export selected" — generates the missing metadata first (accepted as it lands), then exports the WHOLE selection; with nothing to generate it exports immediately (disabled at 0 selected) |
| `upload-download-selected` | button | "⤓ Download all (N files)" — N = the committed SVG/JPG/EPS files of the SELECTION; opens the browser's folder dialog and copies them there under their artifact names, never overwriting (disabled at 0 selected; the `title` says so). The toast/log line: "Saved N files (M icons) to <folder> · k kept (already there) · j icons not exported yet" |
| `upload-cancel-run` | button | aborts the in-flight run; finished results are kept |

List (`upload-list`): `upload-row-count`, `upload-running-count` ("N in flight"),
`upload-attention-count` ("N need attention"), `upload-rows` (role `listbox`),
`upload-row-{pairId}`, `upload-empty`, `upload-footer-summary`.

Row (`upload-row-{id}`):

| `upload-check-{id}` | checkbox | selects the row (session-persisted, not undoable) |
| `upload-prev-{id}` + `upload-prev-{id}-frame` | preview | the approved SVG inline in a shadow root, inside the coloured frame (`data-bg`); the box comes from the shared zoom rule |
| `upload-target-{id}` | text | the row's source path (the approved SVG) |
| `upload-export-path-{id}` | text | "export → {pair-folder}/export · approved v{N}" — the folder, not the file name, so a renamed artifact (2026-10-08: the package is named after the ICON, `fog.svg`, not `fog_AI.svg`) never moves this line |
| `upload-status-{id}` | cell | the package badge (Processed / Partial / Failed / Stale / the stage while running) + the redacted error + the auto-fix note |
| `upload-note-{id}` | small | (2026-10-08) the amber `.svg-note` "EPS auto-fixed: …" line from `record.tools.eps.fixes` — present only when the EPS writer adjusted something on its own (a rounded `<rect>` drawn as an exact outline); the row stays Processed, nothing is asked |
| `upload-meta-cell-{id}` | cell | the metadata-state badge + tags/tokens |
| `upload-settings-{id}` / `upload-settings-pinned-{id}` | cell | the effective settings, one line, plus "inherits defaults" / "N fields overridden" |
| `upload-meta-{id}` / `upload-settings-btn-{id}` / `upload-location-{id}` / `upload-export-{id}` | buttons | the row's Metadata / Settings / Location / Export — Location copies the export folder path with the same code the Generate SVG tab's Location uses (`lib/copypath`) |
| `upload-detail-{id}` | detail | the ACTIVE row's expandable area with the metadata fields |

Metadata fields (`upload-detail-{id}`, empty until generated):
`upload-meta-empty-{id}` (with `upload-meta-gen-{id}`), the editable fields
`upload-meta-title-{id}` / `upload-meta-description-{id}` (2026-10-08: both
hints read "ONE phrase … sentence case, no period"; Accept rewrites the
field to that phrase at once) /
`upload-meta-tags-{id}` (each with its live count), the per-field copy buttons
`upload-copy-{title,description,tags}-{id}`, the validation line
`upload-meta-validation-{id}`, and the actions row `upload-meta-state-{id}`
/ `upload-meta-usage-{id}` / `upload-meta-detail-{id}` /
`upload-meta-regen-{id}` / `upload-meta-accept-{id}` (disabled when accepted
and unedited).

Settings dialog (`upload-dialog-backdrop`, `role="dialog"`):
`upload-dialog-scope` (the global-defaults vs per-icon wording),
`upload-set-{padding,stroke,mp,quality}` (`input[type=number]`, clamped on
change; `upload-set-stroke` is "Stroke width (px)" since 2026-10-08 — the
number typed is the number written in the file, and the row cell reads
`2 px`), `upload-set-{optimize,eps}` (checkboxes), the background
(`upload-set-bg-transparent` — the default, a checkerboard swatch —
`upload-set-bg-{white,black,gray,green,red}` + `upload-set-bg-custom` +
`upload-set-bg-value`, which reads `transparent` or the hex), the stroke
colour (2026-10-08: `upload-set-stroke-color-artwork` — a diagonal-cut
swatch — `upload-set-stroke-color-{white,black,gray,green,red}` (`black` is
the default: ONE global `stroke="#000"` in the file) +
`upload-set-stroke-color-custom` + `upload-set-stroke-color-value`, which
reads the hex or `artwork`; its marker is `upload-set-marker-stroke-color`),
every swatch carrying `aria-pressed`, the per-field marker
`upload-set-marker-{field}` ("inherited" / "overridden", icon scope only),
`upload-set-reset` (icon scope: deletes the override — one undoable entry),
`upload-set-close`. The row's settings cell `upload-settings-{id}` names the
background (`transparent` or the hex) and appends `· stroke #hex` when a
stroke colour is pinned.
The EPS converter row (2026-10-09) is `upload-set-eps-converter` (`<select>`
whose options ARE the registry: `builtin` "Built-in (PostScript subset)",
`inkscape` "Inkscape CLI (local helper)"; marker
`upload-set-marker-eps-converter`; choosing one never toggles
`upload-set-eps`). Only for `inkscape` the helper row `upload-eps-helper`
renders: `upload-eps-helper-url` (the helper URL, saved as typed when valid),
`upload-eps-helper-check` (re-probes) and the state line
`upload-eps-helper-state` — `helper running · Inkscape 1.3.2` (class `ok`),
or the reason + fix (class `warn`): `… not reachable — … run_inkscape_bridge.bat`
/ `the Inkscape helper is running but Inkscape was not found — install
Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH`. The probe runs when the
row appears and on Check. Before a batch that wants Inkscape EPS, one probe
runs: when the helper is not usable the toast (`upload-toast`) says
`EPS: <reason> — N rows will be partial · <fix>` up front and again on the
batch's final line. `upload-set-expand` (checkbox) is "Expand strokes
to fills". The row's settings cell reads `eps off · builtin` /
`eps on · inkscape` and appends `· strokes → fills` when expansion is on.
The artboard row (2026-10-08) is `upload-set-artboard` (`<select>`: Content /
the square presets / Custom), its hint `upload-set-artboard-note`, and — only
for Custom — `upload-set-artboard-w` / `upload-set-artboard-h` (numbers,
clamped on change) with the reduced-gcd ratio `upload-set-artboard-ratio` and
the megapixel readout `upload-set-artboard-mp`. `upload-set-mp` is NEVER disabled (2026-10-08): with a pinned
artboard the checkbox `upload-set-mp-match` ("same size as the artboard",
default checked) offers the choice, typing a megapixel value unticks it in the
same gesture, and `upload-set-mp-note` says what the JPEG will really be
(`the JPEG is the artboard itself: 1024×576 px — untick for a bigger file` vs
`rendered from the vectors at this resolution, at the artboard's aspect
ratio`). With a `content` artboard the checkbox is not rendered at all.
Under the artboard select (2026-10-09, I-62): `upload-set-mp-scale` (checkbox
"scale to", disabled with a pinned artboard), `upload-set-mp-target` (number
1–64 step 0.1, disabled while the box is off; the artboard's megapixels, NOT
the JPEG's `upload-set-mp`) and `upload-set-mp-scale-note` (`the artboard
(icon + padding) is scaled to 5 MP · strokes keep their px` / `the pinned size
decides the megapixels`); the row's settings cell appends `· artboard 5 MP`
while it applies.

Metadata confirmation (`upload-meta-backdrop`, `role="dialog"`): the exact
request — `upload-meta-provider`, `upload-meta-endpoint`,
`upload-meta-prompt` (the exact prompt that WILL be sent, read-only, wrapping),
the auth/retries facts, the images the request will carry
(`upload-preview-strip`, one `upload-preview-{id}` with its own
`upload-preview-caption-{id}`, `upload-preview-count`,
`upload-preview-busy` while they render, `upload-preview-none` when none could
be), `upload-meta-confirm` (sends; disabled until the previews are ready;
label matches Generate vs Regenerate) / `upload-meta-dismiss` /
`upload-meta-cancel`. The title `#upload-meta-title` reads "Generate metadata
for N icons" or "Regenerate metadata for N icons"; when opened by "⇪ Export
selected", it also says "…, then export N". Regeneration's note states that a
returned answer replaces current text and is never auto-accepted; review it and
fix validation errors before accepting, while provider failure preserves it. The
extra note `upload-meta-then-export` states
the accept-as-it-lands rule before anything is paid for.

Banners: `upload-warn-excluded`, `upload-warn-corrupt`,
`upload-warn-unreadable`, `upload-warn-interrupted` (a metadata request in
flight at restart — never resent automatically).

Status bar (`upload-statusbar`): `upload-status-counts`
("N processed · N partial · N failed · N stale"), `upload-status-provider`
("Gemini · {model}"), the key state, `upload-status-meta` /
`upload-status-export` ("… in flight").

Shared surfaces: `upload-toast` (`role="status"`), `upload-busy`. Undo of a
settings gesture goes through the global bar handles `hist-undo` / `hist-redo`
(§O).
