# SVG to upload — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

**Detail pages:** [filters, bulk bar, rows, status](upload-list.md) · [settings and metadata dialogs](upload-dialogs.md).

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

Progress header and cross-tab shell handles: [shared process progress](../sor/process-progress.md#handles).

Embedded JPEG/EPS carriers, repair and independent upload test page: [stock file metadata](../sor/upload-file-metadata.md).

Optional identity inputs (2026-10-22), owned by `UploadMetaRights.tsx`:
`upload-meta-creator-{id}` and `upload-meta-copyright-{id}` are labeled text
inputs under the active row's metadata fields. Blank by default, user-entered
only, not AI-generated; use `upload-meta-accept-{id}` to persist/re-embed edits.
They retain their values when descriptive metadata is regenerated.

Global **✓ Accept metadata (N)**: `upload-meta-accept-selected` accepts existing
metadata for checked icons only (invalid drafts stay unaccepted, no paid calls).
[Acceptance handles](upload-list.md#global-metadata-acceptance).
