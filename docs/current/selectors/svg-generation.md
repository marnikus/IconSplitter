# Generate SVG — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

**Detail pages:** [filters, bulk bar, rows](svg-generation-list.md) · [queue, run record, progress header, status](svg-generation-run.md) · [dialogs, restart recovery, regeneration confirm](svg-generation-dialogs.md) · [image-edit controls](svg-image-edits.md).

## P. Generate SVG — `src/svg/*` (verified 2026-10-01)

Source: `SvgControls.tsx`, `SvgBulkBar.tsx`, `SvgList.tsx`, `SvgRow.tsx`,
`SvgThumbs.tsx`, `SvgBatchStrip.tsx`, `SvgDialogs.tsx`, `SvgPanel.tsx`.

Source bar (always rendered — `svg-open-folder` is the one way in whether or not
a root is loaded; `svg-root-empty` / `svg-unsupported` are the two empty states
and stay distinct):

| Test id | Element | Notes |
|---|---|---|
| `svg-open-folder` | green `Open folder` button | the same shared control as the Selection tabs (I-44), offered whether or not a root is loaded (I-30); `svg-root-empty`'s button is `svg-open-folder-empty` |
| `svg-folder-path` | read-only path row | the picked folder's **complete path**, full-width below the bar, whole value in its `title`, text only — captured from the clipboard when picked (I-35) and bound to that folder's handle (`lib/rootstore`, IndexedDB `iconSplitter/rootpaths`, identity via `isSameEntry`, I-63); the old name-keyed `iconSplitter.rootpaths.v1` is never read. When no path was captured, the row shows the folder name and *full path not captured* (I-46/I-59) |
| `svg-rescan` | `↻ Rescan` | re-walks the root, keeps rows and the prompt |
| `svg-scope-copy` | text | "recursively, both files present, decision = approved" |
| `svg-audit` | text | the whole picture the list was checked against, one line (I-33): "Audit — 30 files · 13 AI sources · 14 references excluded · 2 missing files · 2 duplicates removed → 13 rows". The same line is the scan log's detail |
| `svg-count-{eligible,generated,approved,failed}` | counter chips | live counts |

Connection profiles (`src/svg/SvgConnections.tsx`; 2026-10-16):

| Test id | Element | Notes |
|---|---|---|
| `svg-connection-row` | connection controls | quick-switch and name/kind/add/remove row |
| `svg-connection-select` | the quick-switch dropdown | lists saved setups (`name · kind`); switching swaps the live base+model and re-resolves caps |
| `svg-connection-name` / `svg-connection-kind` | name input / kind select | text generation (SVG) ↔ image generation |
| `svg-connection-add` / `svg-connection-remove` | + New / ✕ Remove | adds a Sunburst image connection; removal disabled at one |

Image-only settings in this card are [documented with the AI-source edit controls](svg-image-edits.md#image-connection-settings).

Prompt + provider card:

| Test id | Element | Notes |
|---|---|---|
| `svg-prompt` | `textarea` | `aria-label="Generation prompt"`; `svg-prompt-reset` restores the documented default; `svg-prompt-window` wraps the window. The shared preset bar (2026-10-09): `svg-preset-list`, `svg-preset-quick-load`, `svg-preset-delete`, `svg-preset-name`, `svg-preset-save` — the same handles and rules as the metadata prompt, over the SVG preset list |
| `svg-provider` | text | provider name + "OpenAI-compatible" |
| `svg-limits` | text | the values that will really be used: "\{stall label} · N retries · N per request" — the label names its tier floor ("600s stall (high floor)") and the per-request size is **exactly what the user configured** (no tier ever shrinks it); the `title` carries the tier note |
| `svg-per-request` | `input[type=number]` | images per request, 1–9 — the size that is really sent, at every reasoning tier |
| `svg-timeout` | `input[type=number]` | the **stall window** in **seconds**, 5–900, default 120: the longest silence between bytes; there is no total-duration limit. Clamped at the moment of change; the tier floor can raise the effective window, which `svg-limits` and `svg-confirm-timeout` then show |
| `svg-retries` | `input[type=number]` | retries per request, 0–5, default 2, for failures the provider **confirmed**; a stall is never retried — its outcome is unknown |
| `svg-model` | `input` | the model id (verified default `openai/gpt-6.1-sol`) |
| `svg-key-state` | button | masked key, with the honest state AND its origin: "API key secured locally" / "API key kept for this session only" / "Storage could not be read" / "No API key yet"; opens the editor |
| `svg-key-mask` / `svg-key-note` | two rows of `svg-key-state` | the masked key (ellipsised) on its own line above "GPT 6.1 Sol · excluded from Git · logs · exports" — never side by side, so they cannot overlap. The note states what a reload does: a device key says "local only · excluded from Git · logs · exports"; a key storage refused says "browser storage refused it — paste again after a reload"; an unreadable store says "this device's storage is unreadable here (private mode?)" |
| `svg-key-forget` | button | shown only while a key is in hand; deletes the stored key from this device (the one deliberate way to clear it) |
| `svg-key-input` / `svg-key-save` / `svg-key-cancel` | editor | `input[type=password]`, `aria-label="Requesty API key"`; `svg-key-save` is `disabled` while the field is empty (an empty Save never erases the stored key) |

The provider card (`svg-provider-card`) is **minimizable**: `svg-provider-toggle`
is a link in the header with `aria-expanded` and `aria-label`
("Minimize model settings" / "Restore model settings"). Minimized, only the
header stays — provider, limits (`svg-limits`) and the toggle — and the choice
is remembered locally (RULE 6), so a restart opens the card the way it was left.

Sampling (`SvgSampling.tsx`) — only what the selected model accepts is offered:

| Test id | Element | Notes |
|---|---|---|
| `svg-temperature` | `input[type=number]` | 0–2, step 0.1; **absent** on a reasoning model, which shows `svg-temperature-off` ("Not supported by this model") instead |
| `svg-max-tokens` | `input[type=number]` | clamped to the model's range (family default 1 000–200 000, or the model list's `max_output_tokens`) |
| `svg-effort` | `select` | Low / Medium / High / Extra High; the empty option is the provider default. `xhigh` (Extra High) only on the models that accept it |
| `svg-caps` | text | the token field, both ranges and where the limits came from (model list / family / default) |
| `svg-param-note` | warning | what a model change reset, and why; dismissable |
| `svg-refresh-models` | button | re-reads `GET /v1/models` (cached 24 h) and re-resolves the limits |
