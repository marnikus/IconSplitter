# Regeneration prompt per batch in popup — first generation uses main prompt

Date: 2026-10-09 · Area: Generate SVG tab (`src/svg/`), lib (`src/lib/svgregen.ts`)

## Problem

Currently regeneration prompt is a global setting in the main window:
`RegenSettingWindow` above the prompt window holds `mode` + `presetName`
(`iconSplitter.svg.regen.v1`). To regenerate with a different prompt the user
must reload/change the prompt in the main window every time.

User asks:

* Apply different prompt to regeneration and first generation without
  reloading prompt in main window every time.
* Ask what prompt to use for regeneration only in popup window before applying.
  Add drop list and apply not a main prompt in regeneration but the prompts
  was selected to full batch.
* For first time generation it selecting main current loaded prompt.
* In popup it clearly say generation batch now or regeneration now.
  In regeneration also see the list of prompt to choose from for current
  generation.

## Current behaviour

* `RegenSettingWindow` (`src/svg/RegenSetting.tsx`) lists mode `main` vs
  `current-svg` and, in the latter, the SVG prompt presets (`iconSplitter.svg.prompts.v1`).
  Choice persisted via `regenstore.ts`.
* `runplan.ts` `perRequestOf`/`planOf`/`guard` call `resolveRegen()` which reads
  that global setting.
* `runcontrol.ts` `startRun` also calls `resolveRegen()` at run start, so a
  batch queued while preset deleted is refused.
* `SvgConfirm.tsx` shows title "Confirm SVG generation" vs "regeneration"
  but no prompt selector; `onConfirm: () => void`.
* `QueueItem` holds `ids, count, requests, label` only.
* `Dialog` holds `ids, operation`.
* First generation and regeneration both go through same confirm dialog,
  distinction only by title.

## Desired behaviour

### First generation (operation = generate)

* Confirmation popup clearly says "Generation batch now" (or "Confirm SVG generation"
  plus a badge "Generation batch now").
* Uses main current loaded prompt (`model.prompt`) — the prompt shown in main
  window's prompt window. No dropdown.
* Shows a note: using main prompt.
* Full batch uses that same main prompt.

### Regeneration (operation = regenerate)

* Confirmation popup clearly says "Regeneration now" (or "Confirm SVG regeneration"
  plus badge).
* Shows a dropdown list of prompts to choose from for current generation:
  the saved SVG prompt presets (`iconSplitter.svg.prompts.v1`).
  Testids: `svg-regen-prompt-select` or `svg-confirm-regen-preset`.
* Selected prompt applied to full batch (all icons in that regeneration batch
  share same prompt text + their own current SVG code).
* Does NOT reload prompt in main window — main window's main prompt stays
  untouched. The popup selection is per-batch; it may optionally be saved as
  last-used regen preset for next popup default, but never overwrites main prompt.
* If no presets saved, show honest message and disable confirm (RULE 4).
* Request size for regeneration remains 1 icon per request (each carries its
  own SVG code).

### Main window

* Remove `RegenSettingWindow` from `SvgPromptZone` — main window now only
  shows the main prompt window (for first generation). Regeneration prompt
  selection lives only in popup.
* Keep `regenstore` for backward compat but new flow uses per-batch preset
  stored in `QueueItem`.

## Data model changes

### lib/svgregen.ts (pure)

* Keep existing `RegenSetting`, `RegenPlan`, `parseRegen`, `regenPlanOf`,
  `requestSizeFor`, `currentSvgPrompt`, `regenLabelOf`.
* Add helper `regenPlanFromPreset(preset: PromptPreset | null): RegenResult`
  that builds a `current-svg` plan from a single preset (or refusal if null/blank).
* `requestSizeFor` already returns 1 for current-svg — no change.

### src/svg/types.ts

* Extend `QueueItem`:
  ```ts
  regen: RegenPlan | null  // null = main prompt (first generation), non-null = regeneration plan for this batch
  ```
* Extend `Dialog` confirm variant:
  ```ts
  { kind: "confirm"; ids: string[]; operation: SvgOperation; regenPreset?: string } // or regenPlan
  ```
  Simpler: keep operation, and for regenerate, store `regenPresetName` selected
  at confirmation time. For queue, store resolved `RegenPlan`.

* Alternatively, keep Dialog minimal and let SvgConfirm manage selection state
  and pass selected preset to `onConfirm(presetName)`.

### src/svg/runqueue.ts

* `queueItem(ids, requests, label, regen: RegenPlan | null)` — add regen field.
* `Replan` should also recompute regen? No, regen stays same per batch; when
  dropping id from batch, regen stays.
* `queuedIds` unchanged.

### src/svg/runplan.ts

* Change signatures to accept explicit regen plan:
  ```ts
  planOf(ctx, ids, regen: RegenPlan): BatchPlan[]
  perRequestOf(ctx, regen: RegenPlan): number
  guard(ctx, ids, regen: RegenPlan | null): string | null
  ```
  If regen is null → main plan. If regen is current-svg → size 1.
* For backward compat, overload that reads global setting when regen not supplied,
  but new code passes explicit.

### src/svg/SvgConfirm.tsx

* Props: add `presets: PromptPreset[]`, `prompt: string` (main prompt), and
  `onConfirm: (regenPresetName: string | null) => void` where null = generation
  (main prompt), non-null = regeneration preset name.
* State: `selectedPreset` initialized to first preset or last used (from regenstore).
* Render:
  * Header badge: `data-testid="svg-confirm-mode"` with text "Generation batch now"
    or "Regeneration now".
  * For generate: note "Using main prompt (currently loaded)" plus maybe preview.
  * For regenerate: dropdown `data-testid="svg-confirm-regen-preset"` listing
    presets, plus note "Selected prompt will be applied to full batch".
  * Facts still show selected images, requests, etc. but requests computed from
    selected regen (1 for regen).
* Validation: if regenerate and presets empty → show `svg-confirm-problem`
  "No saved prompts — save one in the prompt window first" and disable confirm.
  If selected preset blank → problem.

### src/svg/actions.ts

* `requestGenerate(ids, placement, operation)` now creates dialog with operation
  only; dialog component will handle preset pick.
* `confirmGenerate` signature becomes `(regenPresetName: string | null) => void`
  — reads dialog, resolves regen plan via `regenPlanFromPreset` or main, then
  enqueues batch with that plan.
* `regenerateSelected` still filters to eligible ids, but now opens confirm
  dialog with operation regenerate; selection of preset happens in dialog.
* `regenerateNext` (front placement, no dialog) — uses last saved regen setting
  or main? For simplicity, use global `resolveRegen()` fallback so row's quick
  regenerate while running still works.

### src/svg/runcontrol.ts

* `enqueueBatch(ctx, ids, placement, regen: RegenPlan | null)` — pass regen to queueItem.
* `startRun` reads `item.regen` instead of `resolveRegen()`. If null, use MAIN_PLAN.
  If regen is current-svg, validate preset still exists? Use stored text directly
  so deletion after queueing does not break; but we store preset text in plan,
  so safe.
* `labelOf`, `requestsOf` now take regen into account for request count.
* Logging includes regen label.

### src/svg/SvgPanel.tsx & SvgDialogs.tsx

* Pass presets and main prompt to SvgConfirm via SvgDialogs.
* `svgPromptWindowOf` still provides presets.
* Remove RegenSettingWindow from SvgPromptZone — main prompt zone now only
  PromptWindow.

### UI_SELECTORS.md

* Add new handles:
  * `svg-confirm-mode` — badge with "Generation batch now" / "Regeneration now"
  * `svg-confirm-regen-preset` — select for regeneration prompt
  * `svg-confirm-main-prompt` — note for generation using main prompt

### Invariants

* I-64 amended: regeneration prompt is chosen per batch in confirmation popup,
  not globally in main window. First generation always uses main current loaded prompt.
* I-65 remains for preset list sharing, but regen window moves out of main.
* Generation batch: prompt = main prompt, request size = configured.
* Regeneration batch: prompt = selected saved preset + current SVG code, request size = 1,
  applied to full batch.

## Verification (TDD)

1. Write failing test `svg_confirm_regen_prompt.test.tsx`:
   * generate operation shows mode "Generation batch now", no dropdown, confirm calls with null.
   * regenerate operation shows mode "Regeneration now", dropdown with presets, selecting preset calls onConfirm with preset name.
   * regenerate with no presets shows problem and disables confirm.
   * request count for regenerate is ceil(n/1)=n, for generate ceil(n/4).

2. Write failing test for `runqueue` extended with regen field — enqueue preserves regen.

3. Write failing test for `runplan` with explicit regen param — perRequest 4 for main, 1 for current-svg.

4. Update existing `svg_confirm.test.tsx` to pass presets and new onConfirm signature.

5. Update `svg_regen.test.ts` to test new helper `regenPlanFromPreset`.

6. Run `npm run verify:fast` after each step, keep green.

## Steps

1. Extend `svgregen.ts` with `regenPlanFromPreset`.
2. Extend `QueueItem` and `queueItem`.
3. Update `runplan.ts` to accept explicit regen.
4. Update `SvgConfirm.tsx` to show mode badge and dropdown for regenerate.
5. Update `actions.ts` + `runcontrol.ts` to pass regen through queue.
6. Remove RegenSettingWindow from SvgPromptZone.
7. Update SvgDialogs, SvgPanel wiring.
8. Update UI_SELECTORS, SYSTEM_OF_RECORD, docs.
9. Run full verification, ensure RULE 16/18.

## Risks

* Front placement (row Regenerate while running) skips dialog — must still have a regen plan.
  Use global resolveRegen fallback for that path, or last selected preset stored in regenstore.
* Existing tests for regen UI will need update — they currently assert regen window in main.
  Those tests become obsolete; replace with confirm popup tests.
* Queue persistence is session-only, so storing preset text (not just name) is safer against deletion.
