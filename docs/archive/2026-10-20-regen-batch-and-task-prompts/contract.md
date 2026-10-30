# Data model, UI contract, invariants and acceptance

Part of [the 2026-10-20 plan](design.md) (§1–3 there: problem, current behaviour,
desired behaviour). Section numbers continue from that page so existing
references (`§9`) keep working. Exact strings: [prompts.md](prompts.md); order of
work: [steps.md](steps.md).

## 4. Data model and storage

| Key | Shape | Rules |
|---|---|---|
| `iconSplitter.svg.regenBatch.v1` | `{ v: 1, count }` | int 1..9, **default 9** (one batch = one full 3×3 sheet); corrupt → 9 + note in popup |
| `iconSplitter.svg.promptTasks.v1` | `{ v: 1, tasks: { [taskId]: { choice: "main" \| "preset", presetName } } }` | per-entry validation, unknown task ids dropped, name trimmed ≤ 60, ≤ 16 entries, missing preset resolved at read time |
| `iconSplitter.svg.prompts.v1` | unchanged preset list | unchanged |
| `iconSplitter.svg.regen.v1` | unchanged | kept for the front-placement fallback only; no longer read by the confirmation |

Type changes (all additive):

```ts
// lib/svgregen.ts
export interface RegenBatchPref { count: number }
export type PromptTaskId = "svg.generate.single" | "svg.generate.batch"
  | "svg.regenerate.single" | "svg.regenerate.batch"
  | "image.edit.single" | "image.edit.batch";
export type PromptChoice = { kind: "main" } | { kind: "preset"; name: string; text: string };

// svg/runqueue.ts — a queued batch keeps its prompt, its size and its plan
export interface QueueItem {
  /* …id, ids, count, requests, label… */
  regen: RegenPlan | null;
  prompt: PromptChoice;   // generation prompt for THIS batch (main or preset)
  size: number;           // icons per request for THIS batch
}

// svg/runtypes.ts
export interface RunArgs {
  /* … */
  promptChoice: PromptChoice;             // what the pair file records as its prompt
  regenCodes: Map<string, RegenCode>;     // sourceId → {version, svgPath, code}
  regenSize: number;                      // icons per request when regen is current-svg
}
```

## 5. UI contract (additions; full copy in [prompts.md](prompts.md))

Generate SVG / regeneration confirmation:

| Handle | Kind | Meaning |
|---|---|---|
| `svg-confirm-task` | badge | the task in force: `Generate SVG · batch (4 icons)` etc. |
| `svg-confirm-task-tabs` / `svg-confirm-task-single` / `svg-confirm-task-batch` | tab row | switch the task scope shown; the active tab is the current batch's shape |
| `svg-confirm-prompt-default` | note **above** the select | `Default prompt for this task — …` |
| `svg-confirm-prompt-select` | `select` | task prompt: `main` entry (generate/image only) + saved presets |
| `svg-confirm-prompt-note` | small | what the choice does to this batch, or why it cannot be used |
| `svg-confirm-regen-size` | number input | icons per regeneration request (1..9), re-plans pages live |

Image-edit confirmation reuses `svg-img-prompt-default`, `svg-img-task-tabs`,
`svg-img-prompt-select` (existing `svg-img-prompt` textarea stays).

## 6. Invariants proposed for the current pages when the code lands

* **I-74** — A regeneration request carries at most the configured
  `regenPerRequest` icons (1..9), one composite, and the current SVG code of
  every icon it carries; a request never mixes the regeneration preset with the
  main prompt, and an icon without a readable current SVG never enters a
  regeneration plan.
* **I-75** — Returned SVGs are matched to sources by manifest name (`<title>`)
  first and declared position second; duplicates, unknown blocks and missing
  positions are reported per icon, never guessed, and empty cells never produce
  a version.
* **I-76** — A confirmed batch's prompt text, prompt label and per-request size
  are frozen in the queued item; later edits or deletions of the preset or the
  settings cannot change what that batch sends.
* **I-77** — Each of the six prompt tasks remembers its own last chosen prompt;
  a popup preselects it and shows it above the picker; a stored preset that no
  longer exists falls back with a visible note, never silently.

## 7. Explicitly unchanged

* Discovery, approval, list gestures, filters and sorting.
* Versioned saving, review status, undo timeline, inflight journal and the
  no-automatic-retry rule.
* The image-edit composite, its review gate and its own count setting.
* `iconSplitter.svg.prompts.v1` bounds and the shared preset bar in the prompt
  window.
* Provider request shape (`chat/completions` with one `image_url` part) and the
  streaming/stall/retry contract.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Long prompts (many codes) push cost/latency up or get truncated | explicit size ceiling, named refusal, per-request control in the popup, 1..9 clamp |
| A model answers fewer SVGs than positions in a batch | positions reported missing per icon; the request is recorded as partially failed, never back-filled |
| Titles drift from names (`icon-name` vs `icon-name.svg`) | `sameName` already ignores case and extension; the contract states the exact name; the popup previews the exact text |
| Silent fallback hid missing code | removed: excluded and named before send (3.1) |
| Queue/frozen prompt regressions | prompt text + size frozen in `QueueItem` (I-76) with tests |
| Six tasks become six confusing controls | one shared picker component, the header says which task and which default, tabs are labelled single/batch |
| Stored preset deleted later | validated at read, falls back with a visible note (I-77) |

## 9. Acceptance criteria

1. Nine checked rows at the default 9 per regeneration request produce exactly
   ONE confirmed page holding all nine icons with their nine codes. Lowering the
   control to 4 re-plans the same selection into 3 pages (4 + 4 + 1), each page
   showing its own grid, manifest, sheet and full prompt containing exactly its
   icons' codes.
2. The answer's SVGs land on the right pairs by title; a deliberately swapped
   title, a duplicate title and a missing position each produce their named
   problem and no wrong file.
3. Regeneration with size 1 behaves exactly as today (same prompt text, same
   versions, same review status).
4. A row without a readable current SVG is excluded before send and named.
5. The generation popup offers the presets, applies one to the batch only, and
   leaves the stored main prompt untouched.
6. Each of the six tasks remembers its own last choice; the popup shows
   `Default prompt for this task — …` above the picker; single and batch do not
   share a default.
7. One request's tokens/cost are recorded once and split per pair; no key,
   prompt or image bytes reach the log, journal or pair file (RULE 20).
8. `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
   `npm run verify:fast` and `npm run verify` are green; the touched current
   pages and selectors are updated in the same implementation change.

## 10. Open questions (with the default this plan assumes)

1. **Should a regeneration request still send the image?** Assumed yes (the
   sheet is the same one generation sends, so the model can correct the drawing
   against the reference). Alternative — code-only requests — is a later
   optimisation, not this change.
2. **Batch size default?** Settled by the user: one regeneration batch carries
   up to **9** icons (the full 3×3 sheet), so 9 is the default and the maximum;
   only the user lowering the control makes a smaller batch.
3. **Should the single-icon regeneration keep the old main-prompt fallback?**
   Assumed no — one contract for both shapes, an unreadable code is a named
   exclusion.
4. **Do upload metadata prompts join the task model?** Assumed later; the
   registry is extensible, this change covers the six SVG/image tasks.
