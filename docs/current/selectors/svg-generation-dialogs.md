# Generate SVG — dialogs, recovery and regeneration confirm

Selector priority and object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [Generate SVG selectors](svg-generation.md).

## Dialogs

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

## S. Regenerate SVG — per-batch prompt in confirmation (2026-10-09 revised, `src/svg/SvgConfirm.tsx`)

First-time generation uses the main currently loaded prompt shown in `svg-prompt-zone`.
Regeneration no longer has a global window in the main toolbar. The prompt is chosen
**per-batch in the confirmation popup** before anything is sent.

`RegenSettingWindow` (`src/svg/RegenSetting.tsx`) remains as fallback for the front-placement
path (a row's Regenerate while a run is in flight — no dialog, first in queue) and its
storage (`iconSplitter.svg.regen.v1`) is still honoured there.

## Confirmation popup handles (regeneration mode)

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

## Legacy global window handles (still rendered only when `RegenSettingWindow` is used directly, not in main prompt zone)

| Handle | Kind | Notes |
|---|---|---|
| `svg-regen` | container | the whole row, label "Regenerate SVG from" — now only in fallback contexts |
| `svg-regen-mode` | `select` | main / current-svg — fallback only |
| `svg-regen-preset` | `select` | saved prompt list — fallback only |
| `svg-regen-note` | `small` | fallback note |
