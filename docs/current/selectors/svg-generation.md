# Generate SVG — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

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

Filters: `svg-filter-generation` (all / not generated / generating / generated
/ failed), `svg-filter-review` (all / pending / approved / declined / needs-review),
`svg-sort` (date / name / generation / review / cost), `svg-search` (matches the
file name too), `svg-shown` ("Showing N of M"), `svg-clear-filters`.

Bulk bar (`svg-bulk`):

| Test id | Element | Notes |
|---|---|---|
| `svg-check-all` | header checkbox | checked / unchecked / **indeterminate**; scope = the filtered list |
| `svg-selected-count` / `svg-scope` | text | "N selected", "across N approved sources" |
| `svg-select-visible` / `svg-deselect` | buttons | scope = what the filters show |
| `svg-thumb` | `input[type=range]` | the ONE zoom value: in px, **48–800** step 4; it sizes BOTH previews, the row's minimum height and the previews column (inline `--svg-thumb` on `svg-panel`); `svg-thumb-value` is the live readout. Same range, same rule and the same shared layout as Selection V2's `v2-thumb` (I-55 — one implementation, `lib/zoom` + `ui/PairedThumbs`) |
| `svg-bg` | swatch group | **preview background**, app-side only — presets `svg-bg-white` / `svg-bg-black` / `svg-bg-gray` / `svg-bg-green` / `svg-bg-red` (each `aria-pressed`), `svg-bg-custom` (`input[type=color]`, `aria-label="Custom preview background"`), `svg-bg-value` (live label, follows the choice) |
| `svg-estimate` | text | token estimate for the selection |
| `svg-generate-selected` | button | "✦ Generate selected" — unchanged: arms first (`Confirm SVG generation`), then queues/sends all checked rows, including rows with no SVG; **stays enabled while a run is in flight** (I-53), disabled only at 0 selected |
| `svg-regenerate-selected` | button | "↻ Regenerate selected (N)" — N counts only checked rows whose `row.newest !== null`; disabled at 0. The shared confirmation is titled "Confirm SVG regeneration" and previews/sends only those rows, excluding checked rows with no generated SVG. Bulk regeneration appends behind a run in flight (I-53) |
| `svg-needs-review-selected` / `svg-approve-selected` / `svg-decline-selected` | buttons | review the selection (needs-review = yellow warning, regenerated — new review); disabled at 0 |
| `svg-cancel-run` / `svg-batch-progress` | while running | cancellation + per-batch progress; the progress line carries the same ticking `svg-bulk-elapsed` as the strip |

The image batch action and Stop control are [owned by AI-source image edits](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

Rows (`svg-rows`, `role="listbox"`, rows in `svg-list`):

| Test id | Element | Notes |
|---|---|---|
| `svg-row-{sourceId}` | row `role="listitem"` | keyed by the stable pair id, never a row index |
| `svg-check-{sourceId}` | checkbox | `aria-label="Select {base}"` |
| `svg-ai-{sourceId}` | thumbnail | the approved AI image (`<img>` in the same `svg-thumb` square box, `object-fit: contain`); missing → placeholder of the same size |
| `svg-prev-{sourceId}` | inline preview | the newest valid SVG, rendered INLINE in an open shadow root (`el.shadowRoot.querySelector("svg")`); square frame, the same `svg-thumb` px box as the AI thumbnail beside it; `data-version` = the version Copy hands over; empty (no SVG yet) shows "No SVG", an un-previewable file shows "Preview failed" + `data-error` (e.g. `not well-formed XML`) |
| `svg-prev-frame-{sourceId}` | frame around the SVG preview | `data-bg` = the chosen colour; class `contrast` when the frame needs the light outline (black artwork under 3:1); the inline host is a child of it, so the colour is what the artwork is painted on; the AI thumbnail is never inside it |
| `svg-location-{sourceId}` / `svg-copy-{sourceId}` | buttons | "Location" copies the **folder of the file the row names** (I-56: the same path `svg-target-{id}` shows, minus the file name — `…\<piece>\split_04`); "Copy" puts that version's SVG source on the clipboard. Neither is disabled by the folder's depth, and neither ever copies a file path |
| `svg-code-{sourceId}` / `svg-history-{sourceId}` | buttons | the code dialog and the **version chooser** (I-54); disabled with no SVG / no recorded version |
| `svg-generate-{sourceId}` / `svg-needs-review-{sourceId}` / `svg-approve-{sourceId}` / `svg-decline-{sourceId}` | buttons | per-row Generate or Regenerate + review: needs-review (⚠ yellow, regenerated — new review) near approve/decline; approve/decline disabled until a version exists; regeneration automatically sets needs-review |
| `svg-status-{sourceId}` | badge | "Not Generated" / "Generating" / "Generated" / "Failed" / "Unknown" (a request whose outcome was never confirmed — never shown as Failed); its `title` is the row error, e.g. "outcome unknown — request req\_… ; it has not been resent." |
| `svg-review-{sourceId}` | badge | pending / approved / declined / needs-review (regenerated — new review, yellow) |
| `svg-usage-{sourceId}` | text | version, tokens and the cost as reported / **Estimated** ("no cost reported" when unknown); the `title` carries the audit line (model · currency · pricing version · basis) |
| `svg-target-{sourceId}` | text | the SVG this row owns: the newest version's real path, or — while nothing exists yet — the path generation will write ("2026-10/…/split\_01/icon\_…\_01.svg"). Never the pair file's name; the doubled folder prefix bug (svgPath is already root-relative) is fixed by this handle's rule |
| `svg-persist-{sourceId}` | text | "Pair file saved" / "Not generated yet" / "Pair file unreadable — SVGs on disk are kept"; the `title` names the pair's own file ("architecture/fog\_AI.svg.json" — the JSON record BESIDE the SVG, not a second extension of it, I-41); `error` class on failure |
| `svg-problem-{sourceId}` | text | the row's scan status when a file of a **listed** source needs attention: "Reference missing" / "Unreadable file" (several reasons joined by " · "); its `title` is the full per-file reason ("no AI result (court\_AI.png) beside architecture/court.png"). An unreadable file or a missing reference is a status on the row, never a removal — but a missing **AI image** means there is no row at all (I-31): that source appears in `svg-warn-excluded` instead |

Image regeneration row controls, in-flight state, and version chips are [documented separately](svg-image-edits.md#image-regeneration-actions-and-row-feedback).

List chrome: `svg-row-count` (visible rows), `svg-running-count`,
`svg-queued-count` ("N next attempt" — rows waiting in a queued batch, I-53),
`svg-attention-count` (rows needing attention), `svg-empty` ("No approved
source matches these filters."), `svg-footer-summary` (`shownLabel`).

Status badge while a row waits in the queue: `svg-status-{sourceId} .svg-badge`
reads "Next attempt" with class `queued` (grey); the row's own status is back the
moment the batch is dropped (I-53). `svg-generate-{sourceId}` while a run is in
flight queues that source FIRST, with no dialog (idle: the dialog as before).

Queue (waiting batches, I-53): `svg-queue` is absent when nothing waits; otherwise
`svg-queue-count` ("N queued — they start as soon as the run in flight ends.
Adding more never interrupts it."), `svg-queue-line-{n}` (1-based, "#n · <first
file> + N more · N images · N requests") and `svg-queue-drop-{n}` ("× Drop", drops
exactly that batch — the run in flight is untouched). `svg-confirm-generate` reads
"Add to queue" while a run is in flight and `svg-confirm-queue-note` explains why.

Run record (I-58): `svg-run-record` wraps the batch strip and the queue and sits
BELOW the list; absent when nothing ran and nothing waits.

The [persistent progress header and cancel flow](#s1-persistent-progress-header--srcsvgsvgprogressheaderts-2026-10-11) are mounted above the tabs. `svg-shell` is the Generate SVG tab's parked wrapper (`hidden` on other tabs, never unmounted).

Batch strip (`svg-batch`, the request in flight and every finished request;
it stays after the run ends so the record is readable): `svg-batch-composite`
(the contact sheet actually sent), `svg-batch-id`, `svg-batch-grid`
("request 2 of 3 · 2×2 grid · 4 image(s)"), `svg-batch-counts` ("N saved · N
failed · N missing"), `svg-batch-elapsed` (the ticking "elapsed m:ss" of the
request in flight, next to Cancel — the visual proof that a long generation is
alive; "(ended)" once the run stops), `svg-batch-reports` with one
`svg-batch-report-{index}` per finished request (its own counts, elapsed,
tokens and cost; class `failed` when that request failed and `unknown` when its
outcome was never confirmed), `svg-batch-cancel` (only while something is in
flight).

Dialogs:

| Test id | Notes |
|---|---|
| `svg-confirm` | confirm-before-send backdrop (nothing is sent by opening it); `svg-confirm-title` is "Confirm SVG generation" or "Confirm SVG regeneration"; `svg-confirm-generate` says "Generate now" / "Regenerate now" while idle and "Add to queue" during a run, with `svg-confirm-cancel` / `svg-confirm-close` |
| `svg-confirm-mode` | badge | "Generation batch now" vs "Regeneration now" — clearly says which prompt path this batch uses (2026-10-09) |
| `svg-confirm-main-prompt` | note | generation only: "Uses the main currently loaded prompt" — main prompt not reloaded in popup |
| `svg-confirm-regen-preset` / `svg-confirm-regen-note` / `svg-confirm-regen-label` | regeneration only: dropdown of saved prompts applied to full batch, plus note |
| `svg-confirm-full-prompt` | `pre` | **full prompt that will be sent** for current request page: generation = `batchPrompt`/`singlePrompt` (manifest + order line + main prompt), regeneration = `currentSvgPrompt(presetText, stem, code)` (preset + Icon name line for title detection + current SVG code verbatim). One per request; regeneration loads code via `readSvgText` |
| `svg-confirm-full-prompt-note` | small | explains what full prompt contains |
| `svg-confirm-full-prompt-loading` | note | shown while SVG code loads for regeneration preview |
| `svg-confirm-count` / `svg-confirm-requests` | the selected images and the total request count with the per-request size ("4 × 4 max" — the user's size, at every tier; "· prompt “{name}”" appended for regeneration) |
| `svg-confirm-model` / `svg-confirm-sampling` / `svg-confirm-timeout` | the provider+model, the sampling values that will be sent (e.g. "no temperature · 32 000 max tokens · effort Medium") and the stall window that will really be used ("600s stall (medium floor)") |
| `svg-confirm-streaming` | the streaming fact: "on — a live request is never cut, however long it runs" |
| `svg-confirm-queue-note` | shown only while a run is in flight: "confirming adds these N image(s) to the queue", so the user knows the run in flight is not interrupted (I-53) |
| `svg-confirm-limit` / `svg-confirm-problem` | the tier note ("effort medium raises the stall window to 300s … the batch itself is sent as configured") or `null` when the tier raises nothing; the refusal when the plan cannot be mapped — `svg-confirm-generate` is disabled and nothing is sent; regeneration with no saved prompts shows problem and disables confirm |
| `svg-batch-page` / `svg-batch-prev` / `svg-batch-next` | the page label ("batch\_1\_2 · Request 1 of 2") and pagination, one page per request |
| `svg-batch-grid` / `svg-batch-empty` / `svg-batch-items` | that page's grid size, its empty cells (partial last request) and its ordered "position — name" filenames |
| `svg-composite-img` / `svg-composite-meta` | the page's own contact sheet (built in memory on first view, cached) and its layout line |
| `svg-composite-building` / `svg-composite-error` | the honest in-progress and could-not-build states |
| `svg-code-dialog` | the SVG source: `svg-code-block`, `svg-code-missing`, `svg-code-select`, `svg-code-copy`, `svg-code-close`, `svg-code-done`, plus `svg-code-preview` → `svg-code-art` (the same document, drawn) and `svg-code-preview-note` |
| `svg-history-{sourceId}` | button | opens the **version chooser** (I-54); disabled when the pair has no recorded version |
| `svg-history-dialog` | the version chooser: `svg-history-title`, `svg-history-shown` ("Showing v2 of 3 recorded versions — choosing another one keeps all of them"), `svg-history-note` (why a choice could not be saved; absent when it could), `svg-history-table`, `svg-history-v{n}` (one tile per version, class `shown` on the one the row shows), `svg-history-status-{n}`, `svg-history-art-{n}` (that version's own artwork, 96×96), `svg-history-cost-{n}` (cost + Estimated/reported label and the pricing-version line), `svg-history-use-{n}` ("Use this version"; disabled for an unusable tile or the one already shown), `svg-history-code-{n}`, `svg-history-close`, `svg-history-done` |

The image-edit confirmation and return-review dialogs are [documented separately](svg-image-edits.md#image-edit-confirmation-preview-and-review).

Restart recovery: `svg-inflight` (the note about requests with no confirmed
outcome, shown while `iconSplitter.svg.inflight.v1` has entries) with
`svg-inflight-note` (how many, their request ids and files, and "Nothing has
been resent"), `svg-inflight-retry` (opens the normal confirmation for exactly
those sources — the only way to resend, always a deliberate user action) and
`svg-inflight-dismiss` (acknowledges the note and clears the journal).
[Image-edit interruption](svg-image-edits.md#image-edit-interruption-and-status) has separate sent/unknown and lost-review handles.

Shared surfaces: `svg-warn-{noteId}` (`pairfile` — the pair files that could not
be parsed, I-43 / `problems` — the
listed sources that need attention, with the first reasons spelled out /
`excluded` — the approved sources **not** listed, grouped by kind with the first
reasons spelled out ("4 approved source(s) are not listed — 2 with no AI image
on disk, 2 duplicate records." — a source outside the split output is reported
as `outside-split` and never offered, I-38), so a reference image is never mistaken for a
missing row (I-31) / `unreadable` — the files that could not be read this scan /
save failure),
`svg-toast` (`role="status"`), `svg-busy`, `svg-statusbar` with
`svg-status-totals` (visible tokens + cost, "—" when unknown),
`svg-status-progress`, `svg-status-running`. The image batch's `svg-busy`
message is [documented with image-edit status](svg-image-edits.md#image-edit-interruption-and-status).
Undo of a review gesture goes through the [global history bar](shared.md#o-global-history-bar-reset-actions-verified-2026-10-01).

## S1. Persistent progress header — `src/svg/SvgProgressHeader.tsx` (2026-10-11)

Pinned above tab header, portalled to `#svg-progress-mount` in Workbench, visible on every tab while a run is in flight or completed until dismissed:

| Test id | Element | Notes |
|---|---|---|
| `svg-progress-mount` | mount div in Workbench | above nav, `position:relative`, z-index 55 |
| `svg-progress-header` | bar container | `complete` class when done |
| `svg-progress-title` | strong | "Generating SVGs · N images" or "SVG batch complete" |
| `svg-progress-file` | span | current filename while running, or "N results saved · ready for review" when complete |
| `svg-progress-thumb` | img/span | current AI thumbnail (via `useSideThumbs`) |
| `svg-progress-track` / `svg-progress-fill` | divs | progress bar track and its fill |
| `svg-progress-completed` | span | "8 completed / 24" |
| `svg-progress-remaining` | span | "16 remaining" or "0 remaining" |
| `svg-progress-percent` | span | "33%" / "100%" |
| `svg-progress-cancel` | button | "✕ Cancel batch" — opens confirmation |
| `svg-progress-review` | button | "→ Review results" — switches tab to Generate SVG |
| `svg-progress-dismiss` | button | X dismisses completed bar |
| `svg-cancel-dialog` | backdrop dialog | cancel confirmation |
| `svg-cancel-current` | div | currently generating image line: thumbnail + "Currently generating · image 9 of 24" + filename |
| `svg-cancel-stats` | div | "8 completed · kept" / "16 remaining · stopped" |
| `svg-cancel-keep` / `svg-cancel-confirm` / `svg-cancel-close` | buttons | Keep running / Cancel batch / X close |

Cancel flow: `svg-progress-cancel` → `svg-cancel-dialog` with current thumbnail, counts, note "Unsent requests will be removed..." → `svg-cancel-confirm` calls `cancelRun` (drops queue, aborts, keeps saved), `svg-cancel-keep` closes dialog (Esc also).

## S. Regenerate SVG — per-batch prompt in confirmation (2026-10-09 revised, `src/svg/SvgConfirm.tsx`)

First-time generation uses the main currently loaded prompt shown in `svg-prompt-zone`.
Regeneration no longer has a global window in the main toolbar. The prompt is chosen
**per-batch in the confirmation popup** before anything is sent.

`RegenSettingWindow` (`src/svg/RegenSetting.tsx`) remains as fallback for the front-placement
path (a row's Regenerate while a run is in flight — no dialog, first in queue) and its
storage (`iconSplitter.svg.regen.v1`) is still honoured there.

Confirmation popup handles (regeneration mode):

| Handle | Kind | Notes |
|---|---|---|
| `svg-confirm-mode` | badge | "Generation batch now" (first generation, uses main prompt) vs "Regeneration now" (regeneration, uses chosen preset) |
| `svg-confirm-main-prompt` | small note | shown only for generation — names that main prompt is used, not reloaded |
| `svg-confirm-regen-preset` | `select` | shown only for regeneration — dropdown of saved SVG prompts (`iconSplitter.svg.prompts.v1`), applies selected prompt to full batch |
| `svg-confirm-regen-note` | small | regeneration note: what chosen preset does, or "No saved prompts yet — save one in the prompt window" |
| `svg-confirm-regen-label` | label | "Regeneration prompt" (aria for the select) |
| `svg-confirm-problem` | p | when no presets, says why confirm is disabled |

Generation popup shows `svg-confirm-main-prompt` and no preset dropdown.
Regeneration popup shows `svg-confirm-regen-preset` + `svg-confirm-regen-note` and hides main-prompt note.
`onConfirm` receives the selected preset name (`string`) for regeneration, `null` for generation.

Legacy global window handles (still rendered only when `RegenSettingWindow` is used directly, not in main prompt zone):

| Handle | Kind | Notes |
|---|---|---|
| `svg-regen` | container | the whole row, label "Regenerate SVG from" — now only in fallback contexts |
| `svg-regen-mode` | `select` | main / current-svg — fallback only |
| `svg-regen-preset` | `select` | saved prompt list — fallback only |
| `svg-regen-note` | `small` | fallback note |
