# Implementation plan — ordered slices, test-first

Part of [the 2026-10-20 plan](design.md). Each slice is a coherent commit with a
witnessed failing test first (RULE 8/16), its own verification gate and the doc
updates it owns (RULE 17). No slice sends anything to a provider from a test.

## Slice 0 — pure library, no UI (≈1 commit)

**Files:** `src/lib/svgregen.ts`, `src/lib/prompttasks.ts` (new), tests
`tests/svgregen_batch.test.ts`, `tests/prompttasks.test.ts`.

1. `REGN_PER_REQUEST_MIN/MAX/DEFAULT` (1..9/4), `clampRegenPerRequest`.
2. `parseRegenBatch` / `serializeRegenBatch` — tolerant (RULE 13).
3. `regenBatchPrompt(presetText, items, codes)` and the delegating
   `currentSvgPrompt` (text in [prompts.md](prompts.md)); `regenRecordText`.
4. Size ceilings `REGN_CODE_MAX_CHARS`, `REGN_PROMPT_MAX_CHARS` and
   `regenPromptProblem(...)` returning a named reason or `null`.
5. `requestSizeFor(imagesPerRequest, plan, regenPerRequest)` — current-svg uses
   the regen size, main the generation size.
6. `prompttasks.ts`: `PromptTaskId`, `TASK_LABELS`, `taskOf(operation, count)`,
   `parsePromptTasks`, `serializePromptTasks`, `resolveTaskPrompt(task, entry,
   presets)` → `{choice, stale, problem}`.

**Tests:** prompt text for 1 and 4 icons; size clamp and ceiling refusals; the
record text never contains a code; task resolution incl. a deleted preset and a
corrupt payload.

**Gate:** `npx vitest run tests/svgregen_batch.test.ts tests/prompttasks.test.ts
tests/svg_regen.test.ts tests/svg_regenprompt.test.ts` then `npx tsc --noEmit`.

## Slice 1 — storage and reading codes once (≈1 commit)

**Files:** `src/svg/regenprefs.ts` (new), `src/state/prompttasksstore.ts` (new),
`src/svg/regencodes.ts` (new), tests `tests/svg_regenprefs.test.ts`,
`tests/svg_prompttasks_store.test.ts`, `tests/svg_regencodes.test.ts`.

1. `loadRegenPref()/saveRegenPref(count)` → `iconSplitter.svg.regenBatch.v1`.
2. `loadPromptTasks()/saveTaskChoice(task, entry)` →
   `iconSplitter.svg.promptTasks.v1`.
3. `loadRegenCodes(root, rows, ids)` → `Map<sourceId, {version, svgPath, code |
   null}>`: newest valid version per row, `readSvgText`, one honest failure per
   icon; never throws. This becomes the single reader used by the confirmation
   and the runner (today `SvgConfirmFullPrompt.loadCodes` duplicates it).

**Tests:** corrupt/absent keys, out-of-range counts, code map completeness for a
mixed selection, an unreadable file.

**Gate:** the slice tests plus `npx tsc --noEmit`.

## Slice 2 — plan, queue and runner carry the batch (≈1–2 commits)

**Files:** `src/lib/svgregen.ts` (done), `src/svg/runqueue.ts`,
`src/svg/runplan.ts`, `src/svg/runcontrol.ts`, `src/svg/regenprompt.ts`,
`src/svg/runtypes.ts`, `src/svg/runsend.ts`, `src/svg/actions.ts`,
`tests/svg_queue_regen_batch.test.ts`, `tests/svg_regenprompt.test.ts`,
`tests/svg_runner.test.ts`.

1. `QueueItem` gains `prompt: PromptChoice` and `size: number`; `queueItem(...)`
   takes them; a replan on drop keeps them (I-76).
2. `perRequestOf(c, regen, regenSize)` and `planOf` take the batch's size.
3. `requestTextOf` builds the batch regeneration text from `RunArgs.regenCodes`
   and the plan's items; an incomplete map is a `payload` failure for that
   request only, never a silent main-prompt fallback. `record` uses
   `regenRecordText`.
4. `startRun` passes `promptChoice`, `regen` and `regenSize` from the queue item,
   and the codes loaded once for that item; `regenerateNext` (front placement)
   uses the stored defaults.
5. `confirmGenerate(choice)` enqueues with the size the popup showed, so a later
   settings change cannot move a queued batch.

**Tests:** 9 icons at 4 → 3 requests of 4/4/1; the prompt of request 2 contains
exactly positions 5–8; a queued item keeps its preset text after the preset is
deleted; a request whose code is missing fails alone; size 1 equals today's
text.

**Gate:** the slice tests, `tests/svg_queue_ui.test.tsx`,
`tests/svg_confirm_regen_prompt.test.tsx`, `npx tsc --noEmit`, `npm run lint`.

## Slice 3 — the popup: picker, default message, tabs, size control (≈2 commits)

**Files:** `src/ui/TaskPromptPicker.tsx` (new, small components),
`src/svg/SvgConfirm.tsx` (splits again if it passes RULE 18 size: the picker and
the plan hook move to `SvgConfirmPicker.tsx` / `SvgConfirmPlan.ts`),
`src/svg/SvgConfirmFullPrompt.tsx` (one combined prompt per page),
`src/svg/SvgDialogs.tsx`, `src/svg/panelbits.tsx`,
`tests/svg_confirm_task_prompt.test.tsx`, `tests/svg_confirm_regen_batch.test.tsx`.

1. `SvgConfirm` props gain `regenSize`, `taskDefaults`, `onTaskDefault`,
   `onConfirm(choice, size)`.
2. Render order inside the modal: title → `svg-confirm-mode` → `svg-confirm-task`
   → **default message** → tabs → prompt select → notes → facts → pager →
   full prompt → actions.
3. Regeneration with size > 1: pager pages show their own manifest and one
   combined prompt block; the codes come from Slice 1's loader, with a loading
   note while they read.
4. Size input re-plans live, clamps 1..9, persists, and disables confirm while
   the plan is refused.
5. Excluded rows are listed above the pager with the reason from
   [prompts.md](prompts.md).
6. Generation popup offers the same select, with `Main prompt (currently
   loaded)` first; the chosen preset's text is what the full-prompt preview
   shows and what the queue item carries.

**Tests:** each of the six tasks preselects its own stored default; choosing
another value updates the store and the header; switching tabs shows the other
task's default and never changes the current batch; a deleted preset disables
confirm with the named problem; the size control changes the page count; the
full-prompt preview contains exactly the page's codes.

**Gate:** slice tests plus `tests/svg_confirm.test.tsx`, `npm run lint`,
`npm run quality:changed`.

## Slice 4 — image-edit popup joins the same picker (≈1 commit)

**Files:** `src/svg/SvgImgConfirm.tsx`, `src/svg/imgprepare.ts`,
`src/svg/SvgDialogs.tsx`, `tests/svg_img_confirm_task_prompt.test.tsx`.

1. Replace the ad-hoc `PromptBlock` select with `TaskPromptPicker`
   (`svg-img-prompt-default`, `svg-img-task-tabs`, `svg-img-prompt-select`),
   tasks `image.edit.single` / `image.edit.batch`.
2. Main-prompt choice keeps the editable textarea (still writes the main prompt);
   preset choice makes it read-only with "Load into the main prompt editor".
3. The guard that compares `prepared.prompt` with `m.prompt` becomes a comparison
   with the resolved task prompt, so a preset batch is not refused.

**Gate:** slice tests plus `tests/svg_img_confirm_layout.test.tsx`,
`tests/svgimgedit.test.ts`.

## Slice 5 — remove the dead fallback and finish the docs (≈1 commit)

1. Delete the silent main-prompt fallback in `regenprompt.regenTextOf`; keep
   `RegenSettingWindow` only for the front-placement path (or delete it if that
   path now reads `promptTasks`, and say so).
2. Update current pages in the same commit: `sor/svg-generation.md` (behaviour),
   `sor/svg-generation-results.md` (regeneration section), `sor/invariants/svg.md`
   (I-74…I-77), `sor/storage/svg.md` (two new keys), `selectors/svg-generation-
   dialogs.md`, `selectors/svg-image-edits.md`, `sor/tests/svg.md`,
   `sor/OWNERS.md`, and — if a page passes 9 KB — its `-<part>` sibling plus the
   router row (RULE 18).
3. Append one measured entry to `QUALITY_RECHECK.md` without reading it.
4. Remove `RegenSetting.tsx` if unused and update `sor/OWNERS.md`.

**Gate:** `npm run verify:fast`, then `npm run verify` before push.

## Test inventory (all new, all real modules — RULE 8)

| File | Proves |
|---|---|
| `tests/svgregen_batch.test.ts` | prompt text, record text, ceilings, size resolution |
| `tests/prompttasks.test.ts` | task ids/labels, `taskOf`, parse/resolve, stale preset |
| `tests/svg_regenprefs.test.ts` | count key validation |
| `tests/svg_prompttasks_store.test.ts` | task store validation and per-entry drop |
| `tests/svg_regencodes.test.ts` | one code reader, mixed selection, unreadable file |
| `tests/svg_queue_regen_batch.test.ts` | frozen prompt/size in a queued item |
| `tests/svg_confirm_regen_batch.test.tsx` | pager at 4/4/1, per-page prompt, exclusions |
| `tests/svg_confirm_task_prompt.test.tsx` | default message, tabs, six-task memory |
| `tests/svg_img_confirm_task_prompt.test.tsx` | image popup uses the shared picker |

Existing tests that must be updated, not deleted: `svg_confirm.test.tsx`,
`svg_confirm_regen_prompt.test.tsx`, `svg_regen_ui.test.tsx`,
`svg_regenprompt.test.ts`, `svg_runner.test.ts`, `svg_queue_ui.test.tsx`.

## Definition of done

* All acceptance criteria in [contract.md §9](contract.md#9-acceptance-criteria) hold.
* No provider call from tests; no key, prompt body or image bytes in logs,
  journals, pair files or the new stores (RULE 20).
* RULE 16 gates met for every new file (≤ 300 lines, components/functions small)
  and RULE 18 sizes respected; `npm run quality:changed` is clean.
* The three popups show one identical picker, and the message above it names the
  default for the task in force.
* Every touched current page and selector handle is updated in the same commit.
