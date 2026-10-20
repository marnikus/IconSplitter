# Batch SVG regeneration, popup prompt pickers and task-scoped prompt defaults

Date: 2026-10-20 · Area: Generate SVG tab (`src/svg/`), shared UI (`src/ui/`),
lib (`src/lib/svgregen.ts`, `src/lib/promptpresets.ts`), storage (`src/state/`)
· Status: **plan only — no code in this change** (RULE 17: design in the archive,
current pages stay true until the code lands).

Companion files: [contract.md](contract.md) (data model, UI handles, invariants,
risks, acceptance), [prompts.md](prompts.md) (exact prompt text and copy),
[steps.md](steps.md) (ordered, test-first implementation plan).

## 1. Problem — three requests, one sentence each

**P1 — regeneration is one icon per request.** Today every SVG regeneration sends
exactly one icon with its own current SVG code (`lib/svgregen.requestSizeFor`
returns `1` for `current-svg`; `SvgConfirm` hard-codes `perRequest = 1` for
`operation === "regenerate"`). The AI-source image edit already works the other
way: one confirmed square carries up to 16 icons and the answer is split back to
per-pair versions. The user wants regeneration to work the same way — *send
several icons' old SVG code plus the prompt in one request, get several SVGs
back and match them by title.*

**P2 — the Generate SVG popup cannot pick a prompt.** `SvgConfirm` shows a fixed
note (`svg-confirm-main-prompt`): "Using main prompt (currently loaded)". Only
the regeneration path has a preset dropdown. The user wants the generation popup
to offer the saved presets too.

**P3 — no task memory and no visible default.** Prompt choice is either the one
global main prompt or one global `iconSplitter.svg.regen.v1` setting. A single
icon and a batch of nine share the same choice, no popup says which prompt is the
default in force for *this* task, and the last choice made in a popup is
forgotten. The image-edit popup edits the *shared main* prompt textarea
(`panelbits.tsx` → `g.setPrompt`), so tuning an image prompt silently changes the
SVG generation prompt.

## 2. Current behaviour that the plan builds on (facts, with owners)

| Fact | Owner |
|---|---|
| `RegenPlan = {kind:"main"} \| {kind:"current-svg", presetName, presetText}` | `src/lib/svgregen.ts` |
| `requestSizeFor(imagesPerRequest, plan)` → 1 for `current-svg`, else the configured 1..9 | `src/lib/svgregen.ts` |
| Per-request text: single regen = `currentSvgPrompt(preset, stem, code)`; otherwise main prompt | `src/svg/regenprompt.ts` |
| One request = one composite PNG + one prompt; answer split by title, then position | `src/svg/runsend.ts`, `src/svg/runbatch.ts`, `src/lib/svgextract.ts` |
| Regeneration saves `review: "needs-review"`, never replaces; usage split per icon | `src/svg/runbatch.ts`, `src/lib/svgusage.ts` |
| Image-edit batch, normalized cells, explicit review | `src/lib/svgimgbatch.ts`, `src/svg/imgbatchrun.ts` |
| Presets: one validated list, bounded 50 × 8000 chars | `src/lib/promptpresets.ts`, `src/state/presetstore.ts` |
| Stored regen choice | `src/svg/regenstore.ts` (`iconSplitter.svg.regen.v1`) |
| Queue item carries `regen`, so a queued batch keeps its prompt | `src/svg/runqueue.ts`, `src/svg/runcontrol.ts` |

## 3. Desired behaviour

### 3.1 Batch regeneration (P1)

* **New setting — icons per regeneration request.** Integer 1..9, **default 9**:
  one batch fills the largest square sheet this app builds (3×3 = 9 cells, the
  same ceiling `imagesPerRequest` has), so a nine-icon regeneration is ONE
  request. It is stored under `iconSplitter.svg.regenBatch.v1`, independent of
  `imagesPerRequest` (first generation) and of the image-edit count. Lowering it
  splits the same selection into more requests; 1 keeps today's behaviour
  exactly.
* **Plan.** A regeneration selection of N icons becomes
  `ceil(N / regenPerRequest)` requests, built by the existing `planBatches`
  (same grid, same empty-cell rule, same ordered manifest). The confirmation's
  pager, the queue's request count and the runner all read that one plan
  (RUN-1, unchanged).
* **One request carries** one composite sheet of the request's icons (their
  MAIN AI images, exactly as generation does today) **and one prompt**: the
  chosen preset text, a numbered `position — name` manifest, the current SVG
  code of *every* icon in the request, and a response contract that fixes the
  count and forbids titles other than the manifest names. Exact text in
  [prompts.md](prompts.md).
* **Matching is by title, never by appearance or luck.** The existing
  `extractSvgBlocks` + `matchBlocks` already resolve a block by `sameName`
  against the manifest and fall back to the declared position. A block with
  neither is reported, a duplicate is reported, a missing position is reported
  per icon; none of them is ever guessed (RULE 15 spirit). The regen contract
  additionally requires each answer's `<title>` to be the manifest name.
* **Eligibility is decided once, before sending.** Regeneration needs a readable
  current SVG. Today a single icon with no readable code silently falls back to
  the main prompt inside the run (`regenprompt.regenTextOf` → `mainTextOf`).
  With batches that fallback would mix two prompts in one request, so:
  * the confirmation resolves each selected row's newest valid version and reads
    its code while it builds the preview (the code is already loaded there);
  * rows without a readable current SVG are **excluded from the plan and named**
    in the popup before anything is sent (fail closed);
  * the runner receives the same resolved codes (`RunArgs.regenCodes`) and
    refuses a request whose code map is incomplete instead of degrading it.
  This removes the silent fallback; a first generation is what "Generate
  selected" is for.
* **Size guard.** Codes are large. A request whose packed prompt exceeds
  `REGN_PROMPT_MAX_CHARS` (60 000) or whose single code exceeds
  `REGN_CODE_MAX_CHARS` (20 000) is refused in the popup with the reason and the
  suggestion to lower the per-request count; nothing is truncated silently.
* **Saving, cost, status.** Unchanged and per pair: each matched SVG becomes the
  next version (`_v2`, `_v3`, … never overwritten) with `review:
  "needs-review"`, the same request-level tokens/cost recorded once and split
  evenly across the request's icons, and the batch reference
  (`batchId`, `position`, `compositeHash`, `manifest`) written into each pair
  file so a version is traceable to its request (RULE 22). No manual review
  step: SVG text is validated deterministically and versions are additive, so
  the image-edit review gate is not needed here.
* **Failures and Stop are per request, never per batch.** A failed or stalled
  request keeps its own outcome row, marks only its own icons, and is never
  retried automatically (unchanged). Stop blocks unsent requests; a request
  already sent still lands.
* **Front-placement path** (a row's Regenerate while a run is in flight, no
  dialog) keeps working: it queues a single-icon regeneration using the stored
  defaults (task default prompt + stored regen size, which is 1 icon anyway).

### 3.2 Preset picker in the Generate SVG popup (P2)

* The generation confirmation gains the same **prompt select** the regeneration
  confirmation has. Its first entry is `Main prompt (currently loaded)`; the
  rest are the saved presets (`iconSplitter.svg.prompts.v1`).
* Choosing a preset affects **this batch only**. The stored main prompt is never
  rewritten, and the resolved preset *text* travels in the queue item, so the
  previewed prompt is the sent prompt even if the preset is renamed or deleted
  afterwards.
* The exact text that will be sent stays visible in `svg-confirm-full-prompt`
  (already built from the request plan).
* No saved presets → the select shows only `Main prompt (currently loaded)` plus
  an honest hint that presets are saved in the prompt window.

### 3.3 Task-scoped prompt defaults and one shared picker (P3)

A **prompt task** is the unit that remembers a prompt choice. Six tasks:

| Task id | Shown as | Prompt sources |
|---|---|---|
| `svg.generate.single` | Generate SVG · single icon | main prompt or any saved preset |
| `svg.generate.batch` | Generate SVG · batch | main prompt or any saved preset |
| `svg.regenerate.single` | Regenerate SVG · single icon | saved presets only |
| `svg.regenerate.batch` | Regenerate SVG · batch | saved presets only |
| `image.edit.single` | AI source image · single icon | main prompt or any saved preset |
| `image.edit.batch` | AI source image · batch | main prompt or any saved preset |

* **The shape decides the task**: one selected icon = the `*.single` task, two or
  more = the `*.batch` task. The popup names the task in its mode badge
  ("Generation batch now · 4 icons" / "Generation now · 1 icon").
* **Remembered default.** Each task stores its last chosen prompt. Opening a
  popup preselects that task's stored default (falling back to the main prompt
  for generation tasks and to the first saved preset — or an honest refusal —
  for regeneration tasks). Changing the selection in a popup immediately
  becomes that task's new default; it is *not* applied to the other shape's task.
* **The message the user asked for** sits directly **above the prompt select**:
  `Default prompt for this task — “Thin stroke” (Regenerate SVG · batch)`.
  When the default is the main prompt: `Default prompt for this task — main
  prompt (currently loaded)`. When a stored preset no longer exists:
  `Default prompt “Thin stroke” is gone — using main prompt; pick another`.
* **Single vs batch are two tabs in the picker** (`Single icon` / `Batch`), with
  the task matching the current selection active. The other tab is inspectable
  and editable (so a user can prepare the batch default before selecting nine
  icons), and carries the note that it is not used by the current batch. The
  confirm button always uses the active tab's value.
* **One shared component** (`src/ui/TaskPromptPicker.tsx` + a small store)
  renders the header message, the two tabs and the select in the Generate SVG
  confirmation, the regeneration confirmation and the image-edit confirmation,
  so the three popups cannot drift (RULE 10, RULE 24).
* **Editing text in a popup.** If the task's choice is the main prompt, the
  existing editable textarea keeps writing the main prompt. If a preset is
  chosen, the text is shown read-only (the preset owns it) with an explicit
  "Load into the main prompt editor" action — a popup can no longer mutate the
  shared prompt by accident.

