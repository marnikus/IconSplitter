# Batch SVG Regeneration & Per-Task / Single-vs-Batch Default Prompt Selection — Design & Implementation Plan

Date: 2026-10-20 · Area: Generate SVG (`src/svg/`), SVG to upload (`src/upload/`), Shared UI (`src/ui/`), State (`src/state/`), Domain logic (`src/lib/`)
**Status: IMPLEMENTED & VERIFIED (Phases A–D complete; all 6 verification lanes green).**

---

## 1. Problem Statement & Root-Cause Audit

### 1.1 Feature 1 — SVG Regeneration Is Hard-Locked to One-by-One (`perRequest = 1`)

While **AI-source image regeneration** (`src/svg/SvgImgConfirm.tsx` + `src/svg/imgprefs.ts` + `src/svg/imgprepare.ts` + `src/svg/imgbatchrun.ts`) already supports both **single-icon** (`1`) and **multi-icon batch** (`2..16`, default `4`) regeneration in a single request, **SVG regeneration** in the `Generate SVG` tab still forces **1 icon per request**:

1. `src/lib/svgregen.ts` (`requestSizeFor`, line 79) hardcodes:
   ```ts
   export function requestSizeFor(imagesPerRequest: number, plan: RegenPlan): number {
     return plan.kind === "current-svg" ? 1 : clampImagesPerRequest(imagesPerRequest);
   }
   ```
2. `src/svg/SvgConfirm.tsx` (`useConfirmPlan`, line 154) hardcodes `p.operation === "regenerate" ? 1 : clampImagesPerRequest(p.config.imagesPerRequest)` with no batch-size control in the regeneration dialog.
3. `src/svg/regenprompt.ts` (`requestTextOf`, line 25) attaches current SVG code **only** when `items.length === 1`:
   ```ts
   const only = items.length === 1 ? items[0] : undefined;
   if (args.regen.kind === "current-svg" && only !== undefined) return regenTextOf(...);
   ```
4. **Consequence:** Regenerating 20 icons sends 20 separate API calls instead of e.g. 5 batch calls of 4 icons each, adding latency and overhead when applying the same fix prompt across a set of generated SVGs.

**Two additional defects uncovered during the code audit that must be resolved in this design:**

* **Audit Finding A — Preview vs. Send SVG Version Drift:**
  `src/svg/SvgConfirmFullPrompt.tsx` (line 85) previews `previewTargetOf(row)` (`chosenVersion(versions, preferred)`, honouring a user's version-chip choice per `I-54`), whereas `src/svg/regenprompt.ts` (line 37) reads `newestValid(versions)` and ignores `preferred`. If the user switched a row's active version to `v1` via chip, the confirmation popup previews `v1` while the runner transmits `v2` — violating `RULE 20` / `I-19` (previewed payload must equal sent payload). Both paths must read `chosenVersion(meta?.versions ?? [], meta?.preferred)`.
* **Audit Finding B — Stale `<title>` Inside Input SVGs & Title Matching Safety (`src/lib/svgextract.ts`):**
  Existing `.svg` files on disk frequently have either **no `<title>`** or a **stale/different `<title>`** (e.g. `<title>old 1</title>`). Furthermore, in `src/lib/svgextract.ts`:
  * `resolvePosition` (line 95) silently fell through to numeric heading position when `block.title` was non-null yet did not match any manifest entry.
  * When two returned blocks claimed the same `<title>`, `matchBlocks` kept the first block rather than quarantining the ambiguous duplicate title.
  * If two icons in the same batch come from different `split_NN` subfolders and share the same base `stem` (e.g. `split_01/icon_AI.png` and `split_02/icon_AI.png`), raw `source.stem` collides unless disambiguated within the batch manifest.

---

### 1.2 Feature 2 — `Confirm SVG generation` Popup Cannot Select Saved Presets

In `src/svg/SvgConfirm.tsx` (`PromptChooser`, lines 105–107):
* When `operation === "regenerate"`, the modal shows a dropdown of saved presets (`svg-confirm-regen-preset`).
* When `operation === "generate"`, the modal renders **only static copy** (`"Using main prompt (currently loaded) — applied to full batch."`) with **no preset selector**. Users must close the dialog, go back to the toolbar prompt window, load a preset into the main editor, and re-open confirmation.

---

### 1.3 Feature 3 — No Task × Single/Batch Prompt Memory, Cross-Task Clobbering, and No Default Indicator Across Popups

In real icon production workflows, **every task AND single-vs-batch scope requires a distinct prompt** (for example, `DEFAULT_SVG_PROMPT` starts with `"Create 4 split SVG icons..."`, which fails or splits a single icon into 4 parts when used on 1 single icon; multi-icon image grid edits require grid-layout instructions while single-icon image edits redraw one icon; first generation differs from fix/regeneration; SVG prompts differ completely from `SVG to upload` Gemini metadata prompts):

1. **`SvgConfirm.tsx` (`Generate SVG` & `Regenerate SVG`):**
   * `generate` has no preset selector and cannot remember different prompts for **1 single icon** vs **several icons in batch**.
   * `regenerate` initializes `selected` to `presets[0]?.name ?? ""` on every open (`useSelectedPreset`, line 66) — forgetting the user's last choice every single time and treating single-icon and batch regeneration identically.
   * Row front-of-queue shortcut while running (`src/svg/actions.ts` line 212 → `regenerateNext`) ignores `operation === "generate"` vs `"regenerate"` and reads obsolete `iconSplitter.svg.regen.v1`.
2. **`SvgImgConfirm.tsx` + `src/svg/panelbits.tsx` (`AI Source Image Regeneration`):**
   * `<Select testid="svg-img-preset" value="" ...>` always resets to `"" ("— pick a saved prompt —")` every time the dialog opens.
   * Selecting a preset calls `g.setPrompt(preset.text)` (`panelbits.tsx` line 21), **overwriting the main Generate SVG editor prompt (`iconSplitter.svg.prompt.v1`)** so switching between AI image editing and SVG generation corrupts the other task's prompt!
   * Single-icon image edit (`multi === false`) and composite grid batch image edit (`multi === true`) overwrite the same single prompt string.
3. **`UploadMetaDialog.tsx` (`SVG to upload` — `Generate metadata` & `Regenerate metadata`):**
   * Renders only a read-only `<textarea value={g.prompt}>`, offering **no saved preset selector** from `iconSplitter.upload.prompts.v1`, no separate remembered defaults between **Generate metadata** and **Regenerate metadata**, and no distinction between **1 single icon** vs **several icons in batch**.
4. **No Visible Active Default Indicator:**
   * None of the popups displays a status line **above the prompt list** explicitly stating **which prompt is currently chosen as default right now for this specific task and single/batch scope**.

---

## 2. Complete Task × Scope Matrix Across All Tabs

Across all 6 tabs of the application:
* `Single sheets`, `Batch folders`, `Selection`, and `Selection V2` are 100 % local pixel/review tools with no prompts or provider dialogs.
* `Generate SVG` owns **3 confirmation tasks** (`Generate SVG`, `Regenerate SVG`, `Regenerate AI source image`) backed by `iconSplitter.svg.prompts.v1`.
* `SVG to upload` owns **2 confirmation tasks** (`Generate metadata`, `Regenerate metadata`) backed by `iconSplitter.upload.prompts.v1`.
* Every task distinguishes **`single`** (1 icon per request / 1 selected icon) from **`batch`** (multiple icons).

This yields **10 orthogonal, non-interfering task slots (`PromptTaskId`)**:

| # | Tab | Task Key (`PromptTaskId`) | Human-Readable Task Label (shown in popup message) | Preset Store Key | Requires Saved Preset? |
|---|---|---|---|---|---|
| 1 | `Generate SVG` | `svg-generate:single` | `SVG generation · single icon` | `iconSplitter.svg.prompts.v1` | No (`Main editor prompt` allowed) |
| 2 | `Generate SVG` | `svg-generate:batch` | `SVG generation · batch (multiple icons)` | `iconSplitter.svg.prompts.v1` | No (`Main editor prompt` allowed) |
| 3 | `Generate SVG` | `svg-regenerate:single` | `SVG regeneration · single icon` | `iconSplitter.svg.prompts.v1` | Yes (or blocks confirm with honest note) |
| 4 | `Generate SVG` | `svg-regenerate:batch` | `SVG regeneration · batch (multiple icons)` | `iconSplitter.svg.prompts.v1` | Yes (or blocks confirm with honest note) |
| 5 | `Generate SVG` | `svg-image:single` | `AI source image · single icon` | `iconSplitter.svg.prompts.v1` | No (`Main editor prompt` allowed) |
| 6 | `Generate SVG` | `svg-image:batch` | `AI source image · batch (multiple icons)` | `iconSplitter.svg.prompts.v1` | No (`Main editor prompt` allowed) |
| 7 | `SVG to upload` | `upload-generate:single` | `Metadata generation · single icon` | `iconSplitter.upload.prompts.v1` | No (`Main editor prompt` allowed) |
| 8 | `SVG to upload` | `upload-generate:batch` | `Metadata generation · batch (multiple icons)` | `iconSplitter.upload.prompts.v1` | No (`Main editor prompt` allowed) |
| 9 | `SVG to upload` | `upload-regenerate:single` | `Metadata regeneration · single icon` | `iconSplitter.upload.prompts.v1` | No (`Main editor prompt` allowed) |
| 10 | `SVG to upload` | `upload-regenerate:batch` | `Metadata regeneration · batch (multiple icons)` | `iconSplitter.upload.prompts.v1` | No (`Main editor prompt` allowed) |

### Scope Resolution Rule (`single` vs `batch`)

* **Composite-capable tasks (`svg-generate`, `svg-regenerate`, `svg-image`):**
  ```ts
  const scope: PromptScope = ids.length > 1 && perRequest > 1 ? "batch" : "single";
  ```
  * Clicking a row's single-item button (`ids.length === 1`) → `single`.
  * Checking 1 row + clicking bulk button (`ids.length === 1`) → `single`.
  * Checking `N >= 2` rows with `perRequest >= 2` → `batch`.
  * Lowering `perRequest` inside the popup to `1` (one-by-one mode) dynamically transitions `scope` to `single`, automatically switches to the `single` task's remembered default prompt, updates the default message above the dropdown live (`RULE 24`), and updates the outgoing full prompt preview immediately. Raising `perRequest` back to `>= 2` switches right back to `batch` and its remembered batch prompt.
* **Upload metadata tasks (`upload-generate`, `upload-regenerate`):**
  ```ts
  const scope: PromptScope = ids.length > 1 ? "batch" : "single";
  ```

---

## 3. Core Architectural Decisions

### D1 — Configurable Batch SVG Regeneration (`1..9` per Request, Default `4`)

1. **Dedicated Preference Store (`src/svg/regenprefs.ts`):**
   * Key: `localStorage["iconSplitter.svg.regenBatch.v1"]` storing `{ v: 1, count: number }` (`1..9`, default `4`).
   * Strict `RULE 13` read validation matching `src/svg/imgprefs.ts`: corrupt/out-of-range JSON resets to `count = 4` and sets `warning: true` so the popup displays a status notice (`Saved SVG regeneration batch count was unreadable; using 4.`), never crashing or silently substituting over an active invalid user input.
   * Kept independent from `config.imagesPerRequest` (first-generation batch size) and `iconSplitter.svg.imageEditBatch.v1` (image-edit composite count) because multi-SVG regeneration embeds `k` complete existing SVG XML documents in input tokens AND returns `k` complete fixed SVGs inside one `maxTokens` ceiling.
2. **Popup Control (`SvgConfirm.tsx` when `operation === "regenerate"`):**
   * Adds `Icons per regeneration request` numeric input (`data-testid="svg-regen-per-request"`, `min=1`, `max=9`, `step=1`).
   * Invalid draft values (`""`, `< 1`, `> 9`, non-integer) display alert `data-testid="svg-regen-count-error"` (`Choose a whole number from 1 to 9`) and disable `Regenerate now` (`RULE 4` / `RULE 15`).
   * Valid integer changes immediately save to `iconSplitter.svg.regenBatch.v1`, reset preview `page` to `0`, recompute `BatchPlan[]` (`ceil(picked.length / count)` pages), rebuild each page's square contact sheet in `BatchPager`, and re-render `FullPromptPreview`.
3. **Plan Model (`src/lib/svgregen.ts`):**
   * Extend `CurrentSvgPlan`:
     ```ts
     export type RegenPlan =
       | { kind: "main" }
       | { kind: "current-svg"; presetName: string; presetText: string; perRequest: number };
     ```
   * `requestSizeFor(imagesPerRequest, plan)` returns `clampImagesPerRequest(plan.perRequest)` when `plan.kind === "current-svg"`, and `clampImagesPerRequest(imagesPerRequest)` when `plan.kind === "main"`.
   * Because `perRequest` travels inside `RegenPlan` on every `QueueItem` (`src/svg/runqueue.ts`), `SvgConfirm`, `runplan.ts`, `runcontrol.ts` (including queued runs when the user changes settings for a later batch!), and `runner.ts` all compute the **exact same request count and batch boundaries (`I-19`, `I-53`)**.

---

### D2 — Multi-SVG Regeneration Payload & Version Alignment (`batchRegenPrompt`)

1. **Unified Source SVG Version Lookup (Fixes Audit Finding A):**
   * Both `SvgConfirmFullPrompt.tsx` and `src/svg/regenprompt.ts` resolve each icon's current valid SVG through `chosenVersion(meta?.versions ?? [], meta?.preferred)` (`src/lib/pairpreferred.ts`), which equals `newestValid(versions)` when no preference is set and matches `shownVersion(row)` when a preferred version chip is active (`I-54`).
2. **Unique Batch Manifest Titles (`disambiguateBatchSources` in `src/svg/sources.ts`):**
   * Within any planned batch slice, if all items have unique `stem` values (the 99.9 % case), each `BatchItem.name` stays `source.stem` (preserving 100 % compatibility with existing single/batch tests).
   * If two items in the **same** batch share the same `stem` across different subfolders (e.g. `split_01/icon_AI.png` and `split_02/icon_AI.png`), `BatchItem.name` uses the normalized extensionless `relPath` (`split_01/icon_AI`, `split_02/icon_AI`), ensuring every slot in a batch carries a strictly unique `<title>`.
3. **Request Prompt Construction (`src/lib/svgregen.ts` + `src/svg/regenprompt.ts`):**
   * **`items.length === 1` (`single` regeneration):**
     * Keeps exact `currentSvgPrompt(presetText, expectedTitle, code)` contract for 100 % backward compatibility when `count === 1` or `1` icon is selected.
     * If `current === null` (single row triggered with no prior valid SVG), falls back to first-generation `singlePrompt` with warning log `regen-no-svg` as today.
   * **`items.length > 1` (`batch` regeneration):**
     * Reads every item's current SVG via `readSvgText(root, current.svgPath)`. If **any** item in the batch has no valid SVG or an unreadable SVG file, fails closed with `{ ok: false, error: "<name>: the current SVG could not be read — nothing was sent" }` before a single byte leaves (`RULE 4`, `RULE 15`).
     * Builds `batchRegenPrompt(presetText: string, entries: readonly RegenBatchEntry[]): string` (`RegenBatchEntry = { position: number; name: string; code: string }`):
       ```text
       Here is a batch of icons arranged in numbered grid order (matching the attached reference sheet):
       1 — <name_1>
       2 — <name_2>
       ...

       Regenerate / fix all <k> SVG icons below using the attached reference grid and instructions.
       CRITICAL RESPONSE RULES:
       1. Return exactly one standalone <svg ...>...</svg> block per icon (<k> SVGs total).
       2. Inside EVERY returned <svg>, set <title>EXACT_ICON_NAME</title> using the exact name listed above (overwrite or add <title> if the old SVG had a missing or different <title>). Each returned SVG is matched back to its file strictly by its <title>.

       <presetText.trim()>

       ### 1 — Required <title>: <name_1>
       Current SVG code to fix for <name_1>:
       <code_1 verbatim>

       ### 2 — Required <title>: <name_2>
       Current SVG code to fix for <name_2>:
       <code_2 verbatim>
       ```
4. **Full Prompt Preview (`SvgConfirmFullPrompt.tsx`):**
   * For `operation === "regenerate"` on page `k`, renders the **exact** string produced by `currentSvgPrompt` (`items.length === 1`) or `batchRegenPrompt` (`items.length > 1`) inside `data-testid="svg-confirm-full-prompt"` so the user sees the exact outgoing payload byte-for-byte before confirming (`RULE 20`).
5. **Sidecar Recording (`I-64` Preserved):**
   * In `.svg.json`, each saved version records `singlePrompt(regen.presetText, itemTitle)` (bounded by `PROMPT_KEEP`), never duplicating kilobytes of prior input SVG XML across sidecar files.

---

### D3 — Strict `<title>` Response Matching (`matchBlocksByTitle` in `src/lib/svgextract.ts`)

1. **Dedicated Title-Authoritative Matcher (`matchBlocksByTitle`):**
   * Extracts all candidate `<svg>...</svg>` documents from the response using `extractSvgBlocks(text)` (supports both markdown fenced code blocks and raw consecutive `<svg>...</svg>` elements).
   * Matches every returned block to `manifest: readonly ManifestItem[]` **strictly by `<title>`** (`sameName(item.name, block.title)` — case-insensitive, strips optional `.svg`/`.png` suffix the model might append):
     * **Order-independent:** If the model emits icon 3 first, icon 1 second, icon 4 third, and icon 2 fourth, every single block maps cleanly to its exact manifest `position` → `sourceId` → `<dir>/<stem>_vN.svg`.
     * **Missing `<title>` (`block.title === null`):** Refused with problem `"unmatched result: missing <title>"` — **never** guessed by heading number or array order.
     * **Unknown `<title>`:** Refused with problem `'unmatched result: unknown title "<title>"'` — **never** falls back to position.
     * **Duplicate `<title>` across multiple blocks in one response:** **Quarantines that ambiguous title completely** (`byPosition.delete(position)`, marks `position` as `ambiguous`, records `'duplicate result for title "<title>"'`). Neither copy is written, preventing a mislabelled SVG from overwriting another icon's version history; `missing` includes that `position`.
     * **Per-icon isolation (`RULE 5`):** Any icon in the same batch whose `<title>` matched uniquely and passes `validateSvg(code)` **still saves cleanly** as `<stem>_vN.svg` with `review: "needs-review"`, `allocateUsage(usage, items.length)`, and atomic `saveMetaAt`, while only missing/invalid icons are reported as `missing` / `failed`.
2. **Hardening Existing `matchBlocks` (`generate` mode):**
   * Keeps all existing `matchBlocks` behaviour for first-time `generate` (`tests/svg_extract.test.ts` stays 100 % green), AND fixes Audit Finding B: when `block.title !== null` and matches **no** manifest entry, returns `null` immediately (`unmatched result: title "..."`) instead of silently falling back to `block.position`.

---

### D4 — Unified Per-Task × Single/Batch Prompt Memory (`src/lib/taskprompts.ts` + `src/state/taskpromptstore.ts`)

1. **Pure Domain Module (`src/lib/taskprompts.ts`):**
   * Owns `PromptOperation`, `PromptScope` (`"single" | "batch"`), `PromptTaskId` (the 10 keys in §2), `TaskPromptChoice`:
     ```ts
     export const MAIN_PROMPT_VALUE = "__main__";

     export type TaskPromptChoice =
       | { kind: "main" }
       | { kind: "preset"; name: string };
     ```
   * Pure functions:
     * `taskIdOf(operation: PromptOperation, scope: PromptScope): PromptTaskId`
     * `scopeOfTask(itemCount: number, perRequest: number, compositeCapable: boolean): PromptScope`
     * `taskLabelOf(taskId: PromptTaskId): string`
     * `parseTaskPrompts(raw: unknown): TaskPromptMap` (`RULE 13` — validates `v === 1`, keeps only known `PromptTaskId` keys and valid `TaskPromptChoice` values; corrupt input → `{}`)
     * `serializeTaskPrompts(map: TaskPromptMap): string`
     * `resolveTaskPrompt(args: { taskId; stored; presets; mainPrompt; legacyRegenPreset?: string }): ResolvedTaskPrompt`:
       Returns:
       * `choice`: active effective dropdown value (`"__main__"` or existing preset `name`, or `""` when `requiresPreset && presets.length === 0`)
       * `text`: resolved prompt text to preview & send
       * `presetName`: `string | null`
       * `defaultMessage`: exact human-readable banner line for `role="status"` above the dropdown:
         * Preset active: `'Default prompt for <taskLabel>: “<name>”'`
         * Main prompt active (explicit or initial default): `'Default prompt for <taskLabel>: Main editor prompt'`
         * Saved preset was deleted since last run:
           * Non-regen tasks → `'Default prompt for <taskLabel>: Main editor prompt (saved preset “<old>” was deleted)'`
           * Regen tasks with remaining presets → `'Default prompt for <taskLabel>: “<first>” (saved preset “<old>” was deleted)'`
         * Regen task with 0 saved presets → `'Default prompt for <taskLabel>: None — save a prompt preset first'`
       * `problem`: `string | null` (non-null when `requiresPreset` and no valid non-blank preset exists)
   * **Legacy Compatibility Seed:** If `svg-regenerate:single` or `svg-regenerate:batch` has no entry in `iconSplitter.taskPrompts.v1` yet, reads `loadRegenSetting().presetName` (`iconSplitter.svg.regen.v1`) as initial fallback seed if valid.

2. **Persistence Module (`src/state/taskpromptstore.ts`):**
   * Storage key: `localStorage["iconSplitter.taskPrompts.v1"]`.
   * Exposes `loadTaskPrompts(): TaskPromptMap`, `getTaskPromptChoice(taskId): TaskPromptChoice | null`, `saveTaskPromptChoice(taskId, choice): TaskPromptMap`.

---

### D5 — Shared `TaskPromptPicker` Component & Zero Cross-Task Clobbering

1. **Shared Component (`src/ui/TaskPromptPicker.tsx`):**
   Renders identically inside **every** confirmation popup (`SvgConfirm`, `SvgImgConfirm`, `UploadMetaDialog`):
   * **Above the dropdown (`role="status"`):**
     ```tsx
     <p className="svg-note strong task-default-prompt" role="status" data-testid={defaultMsgTestId}>
       {resolved.defaultMessage}
     </p>
     ```
   * **Prompt Preset Dropdown (`<select>`):**
     * For tasks allowing main editor prompt (`svg-generate:*`, `svg-image:*`, `upload-generate:*`, `upload-regenerate:*`):
       * `<option value="__main__">Main editor prompt (currently in tab)</option>`
       * `<option value={p.name}>{p.name}</option>` for every preset in that tab's saved preset store.
     * For `svg-regenerate:*`:
       * Lists every saved preset `<option value={p.name}>{p.name}</option>` (or shows the honest empty-presets problem when `presets.length === 0`).
   * **Immediate Persistence & Live Sync (`RULE 24`):**
     * Changing the `<select>` calls `saveTaskPromptChoice(taskId, nextChoice)` immediately, updating both the remembered default in `localStorage`, the banner message right above the `<select>`, and the live outgoing prompt preview below!
     * Also persisted on Confirm so the first-visit default becomes the explicit remembered choice for subsequent runs.

2. **Strict Non-Clobbering Across All Popups & Queue (`D6`):**
   * **`SvgConfirm` (`generate` & `regenerate`):**
     * `onConfirm` passes `{ regenPresetName: string | null; regenPerRequest: number; promptOverride: string | null }` (keeping clean backward-compatible signature defaults for existing callers/tests).
     * `QueueItem` carries `promptOverride: string | null` and `regen: RegenPlan | null`. `startRun` passes `prompt: item.promptOverride ?? ctx.m.prompt` to `runGeneration`, never overwriting `SvgModel.prompt`.
     * Row front-of-queue shortcut while running (`regenerateNext(ctx, ids, operation)`) resolves `svg-generate:single` when `operation === "generate"` and `svg-regenerate:single` (with `perRequest: 1`) when `operation === "regenerate"`.
   * **`SvgImgConfirm` (`image-regen`):**
     * Holds a dialog-local `draftPrompt` initialized from `resolved.text` whenever `taskId` (`svg-image:single` vs `svg-image:batch`) or the selected task preset changes.
     * Selecting a preset in `SvgImgConfirm` saves the task default under `svg-image:single` or `svg-image:batch` and updates `draftPrompt` — **it NEVER calls `g.setPrompt(...)` on the main SVG prompt editor!**
     * `onConfirm(prepared, draftPrompt)` hands the exact previewed `draftPrompt` directly to `runImageRegen` / `runCompositeEdits`.
   * **`UploadMetaDialog` (`generate` & `regenerate` metadata in `SVG to upload`):**
     * Embeds `TaskPromptPicker` bound to `upload-generate:single` / `upload-generate:batch` / `upload-regenerate:single` / `upload-regenerate:batch` over `g.presets` (`iconSplitter.upload.prompts.v1`).
     * Updates the read-only outgoing prompt preview `data-testid="upload-meta-prompt"` live (`RULE 24`) to `resolved.text`.
     * `confirmMetadata(resolved.text)` passes `promptOverride` into `runMetadataBatch(..., { promptOverride })` — **never overwriting `UploadModel.prompt` in the tab panel**.

---

## 4. Owner File Map & Quality Gate Budget (`RULE 16` & `RULE 18`)

Every new/touched file obeys **function LOC ≤ 30, params ≤ 4, CC ≤ 10, nesting ≤ 4, hooks/component ≤ 15, new file ≤ 300 lines (target 80–180 lines)**:

| File | Action | Responsibility | Target Lines |
|---|---|---|---|
| `src/lib/taskprompts.ts` | **New** | `PromptTaskId` (10 slots), scope helper, `RULE 13` parse/serialize, `resolveTaskPrompt`, default-message formatter | ~130 |
| `src/state/taskpromptstore.ts` | **New** | `localStorage["iconSplitter.taskPrompts.v1"]` read/write helpers | ~40 |
| `src/ui/TaskPromptPicker.tsx` | **New** | Shared task default status message + saved preset `<select>` + hook `useTaskPrompt` | ~110 |
| `src/svg/regenprefs.ts` | **New** | `localStorage["iconSplitter.svg.regenBatch.v1"]` (`1..9`, default `4`) parse/load/save (`RULE 13`) | ~45 |
| `src/lib/svgregen.ts` | Edit | Add `perRequest` to `CurrentSvgPlan`, update `requestSizeFor`, add `batchRegenPrompt` | ~135 |
| `src/lib/svgextract.ts` | Edit | Add strict `matchBlocksByTitle` (with duplicate-title quarantine) + reject explicit mismatched `<title>` in `resolvePosition` | ~165 |
| `src/svg/sources.ts` | Edit | Add `toBatchSourcesUnique` to disambiguate colliding `stem` names within a batch | ~195 |
| `src/svg/regenprompt.ts` | Edit | Support multi-icon `current-svg` batches via `batchRegenPrompt` + unify on `chosenVersion(versions, preferred)` | ~85 |
| `src/svg/runbatch.ts` | Edit | Use `matchBlocksByTitle` when `state.args.regen.kind === "current-svg" && ctx.items.length > 1`; record per-item `singlePrompt(presetText, itemTitle)` | ~235 |
| `src/svg/runqueue.ts` | Edit | Add optional `promptOverride?: string | null` on `QueueItem` | ~110 |
| `src/svg/runplan.ts` | Edit | Use `toBatchSourcesUnique` so confirmation plan and runner share identical names | ~65 |
| `src/svg/runcontrol.ts` | Edit | Pass `ConfirmSvgChoice` (`regenPresetName`, `regenPerRequest`, `promptOverride`) + `operation`-aware `regenerateNext` using `svg-*:single` defaults | ~255 |
| `src/svg/actions.ts` | Edit | Forward `operation` to `regenerateNext`, forward `promptOverride` on `confirmGenerate` & `confirmImageRegen` | ~255 |
| `src/svg/imgactions.ts` | Edit | Accept explicit `promptOverride?: string` in `confirmImageRegen` / `runImageRegen` instead of reading `c.m.prompt` alone | ~240 |
| `src/svg/panelbits.tsx` | Edit | Stop clobbering `g.setPrompt` from `SvgImgConfirm` | ~40 |
| `src/svg/SvgConfirmPlan.ts` | **New** | Extract `useConfirmPlan` hook + batch count validation out of `SvgConfirm.tsx` to keep `SvgConfirm.tsx` compact (`RULE 18`) | ~115 |
| `src/svg/SvgConfirm.tsx` | Edit | Render `TaskPromptPicker` for **both** `generate` and `regenerate`, add `svg-regen-per-request` (`1..9`), live scope switching | ~185 |
| `src/svg/SvgConfirmFullPrompt.tsx` | Edit | Render exact `batchRegenPrompt` for multi-icon regen pages + `chosenVersion` alignment + `promptOverride` preview | ~140 |
| `src/svg/SvgImgConfirm.tsx` | Edit | Replace raw stateless `PromptBlock` select with `TaskPromptPicker` (`svg-image:single` vs `svg-image:batch`) + dialog-local editable `draftPrompt` | ~200 |
| `src/upload/UploadMetaDialog.tsx` | Edit | Add `TaskPromptPicker` (`upload-generate:*` / `upload-regenerate:*`), show live resolved prompt in `upload-meta-prompt`, pass resolved prompt on confirm | ~185 |
| `src/upload/metaactions.ts` | Edit | Accept optional `promptOverride?: string` in `confirmMetadata` / `runMetadataBatch` | ~285 |
| `src/index.css` | Edit | Subtle styling for `.task-default-prompt` banner above preset dropdowns | +12 |

---

## 5. UI Selector Contract & Invariants to Update at Implementation Time

### 5.1 Selector Handles

| Popup | Test ID | Element | Behaviour |
|---|---|---|---|
| `SvgConfirm` (`generate` & `regenerate`) | `svg-confirm-default-prompt` | `<p role="status">` above preset list | Live message naming current default prompt for `svg-generate:single` / `svg-generate:batch` / `svg-regenerate:single` / `svg-regenerate:batch` |
| `SvgConfirm` (`generate`) | `svg-confirm-gen-preset` | `<select>` | Saved presets from `iconSplitter.svg.prompts.v1` + `Main editor prompt` |
| `SvgConfirm` (`regenerate`) | `svg-confirm-regen-preset` | `<select>` | Saved presets from `iconSplitter.svg.prompts.v1` (existing handle preserved) |
| `SvgConfirm` (`regenerate`) | `svg-regen-per-request` / `svg-regen-count-error` | `<input type="number">` / `<p role="alert">` | Icons per regeneration request (`1..9`, default `4`), persisted in `iconSplitter.svg.regenBatch.v1` |
| `SvgImgConfirm` | `svg-img-default-prompt` | `<p role="status">` above preset list | Live message naming current default prompt for `svg-image:single` vs `svg-image:batch` |
| `SvgImgConfirm` | `svg-img-preset` / `svg-img-prompt` | `<select>` / `<textarea>` | Existing handles preserved; reflects remembered task choice and never overwrites `SvgModel.prompt` |
| `UploadMetaDialog` | `upload-meta-default-prompt` | `<p role="status">` above preset list | Live message naming current default prompt for `upload-generate:single` / `upload-generate:batch` / `upload-regenerate:single` / `upload-regenerate:batch` |
| `UploadMetaDialog` | `upload-meta-preset` | `<select>` | Saved presets from `iconSplitter.upload.prompts.v1` + `Main editor prompt`; live-syncs `upload-meta-prompt` |

### 5.2 Invariants (`docs/current/sor/invariants/`)

* **Amend `I-64` (`invariants/svg.md`):** Update from hardcoded 1-icon-per-request to user-configured `1..9` icons per request (`iconSplitter.svg.regenBatch.v1`, default `4`); `1` preserves single-icon requests; `>1` sends one square contact sheet + all `k` icons' `chosenVersion` SVG codes + prompt and maps responses strictly by `<title>`, while `.svg.json` still records only the prompt header without raw SVG code.
* **Add `I-74` (`invariants/svg.md` — Batch SVG Regeneration Title Identity):** Multi-SVG regeneration assigns unique per-batch titles, sends exact `chosenVersion` SVG text previewed in confirmation, matches returned `<svg>` blocks strictly by normalized `<title>`, never falls back to array index or heading position, and quarantines duplicate `<title>` collisions so an ambiguous response can never overwrite the wrong pair.
* **Add `I-75` (`invariants/shared.md` — Per-Task × Single/Batch Default Prompts):** Every provider confirmation dialog resolves and persists its own default prompt keyed by `(operation, single | batch)` in `iconSplitter.taskPrompts.v1`, displays the active default prompt directly above the preset selector (`RULE 24`), never cross-contaminates presets across tabs (`I-65`), and never overwrites a tab's main editor prompt when a task preset is chosen in a dialog.

---

## 6. Step-by-Step TDD Implementation Plan

Each phase follows strict **Red → Green → Refactor → Verify** (`npx tsc --noEmit` · `npm run lint` · `npm run quality:changed` · `npm run verify:fast`), with full `npm run verify` + `docs/current/*` updates + `docs/current/QUALITY_RECHECK.md` append before pushing.

### Phase A — Per-Task × Single/Batch Prompt Engine, Store & Shared UI Component

1. **Red tests:**
   * `tests/task_prompts.test.ts` — test all 10 `PromptTaskId` slots, `scopeOfTask` transitions (`1` vs `>1` icons and `perRequest = 1` vs `>1`), `parseTaskPrompts` `RULE 13` resilience against corrupt JSON / unknown versions / invalid keys, `resolveTaskPrompt` across all states (explicit preset, main prompt, deleted preset fallback for both optional-preset and required-preset tasks, empty preset list, legacy `iconSplitter.svg.regen.v1` seed), and localStorage persistence via `taskpromptstore`.
   * `tests/task_prompt_picker.test.tsx` — mount `TaskPromptPicker`, verify status banner directly above `<select>` displays exact active default for `taskId`, changing `<select>` persists immediately and updates status banner live (`RULE 24`), switching `scope` prop (`single` ↔ `batch`) loads the independent remembered default for each scope without overwriting the other.
2. **Implement:**
   * `src/lib/taskprompts.ts`
   * `src/state/taskpromptstore.ts`
   * `src/ui/TaskPromptPicker.tsx`
   * `src/index.css` (`.task-default-prompt` styling)
3. **Gate check:** Run new + existing preset tests (`npx vitest run tests/task_prompts.test.ts tests/task_prompt_picker.test.tsx tests/prompt_presets_shared.test.ts`), `tsc`, `lint`, `quality:changed`.

---

### Phase B — Batch SVG Regeneration Engine, `<title>` Matching & Queue/Runner Isolation

4. **Red tests:**
   * `tests/svg_extract_title.test.ts` — test `matchBlocksByTitle` on out-of-order 4-SVG responses (`3, 1, 4, 2`), case/extension tolerance (`icon-1_AI.svg` vs `icon-1_AI`), raw consecutive `<svg>` blocks without fences, missing `<title>` rejection (no positional fallback!), unknown `<title>` rejection even when preceded by `1)`, duplicate `<title>` quarantine (neither block written, position marked missing), plus `matchBlocks` rejecting explicit mismatched `<title>`.
   * `tests/svg_regen.test.ts` & `tests/svg_regenprompt.test.ts` — test `regenprefs` (`iconSplitter.svg.regenBatch.v1` load/save/corrupt warning), `requestSizeFor` honouring `plan.perRequest` (`1`, `4`, `9`), `batchRegenPrompt` including manifest + title rules + all `k` icons' `chosenVersion` SVG codes, fail-closed refusal when any icon's SVG file is unreadable, `toBatchSourcesUnique` disambiguating duplicate stems across `split_01/` and `split_02/`, and sidecar `record` excluding raw SVG XML.
   * `tests/svg_runner_batch_regen.test.ts` — end-to-end streaming test (`runGeneration` with fake FS + SSE stream): 6 icons at `perRequest = 4` → **2 requests (`4` + `2`)**, each request carries all old SVG codes for its batch, provider returns SVGs in scrambled order (`4, 2, 1, 3`), every icon saves its exact matched SVG to `<stem>_v2.svg` with `review: "needs-review"`, allocated tokens/cost, intact `imageVersions`, and clean prompt record; partial failure / missing title isolates cleanly to the missing icon only (`RULE 5`). Also test `QueueItem.promptOverride` isolation when queueing a `single` generation behind a `batch` generation.
5. **Implement:**
   * `src/svg/regenprefs.ts`
   * `src/lib/svgregen.ts`
   * `src/lib/svgextract.ts`
   * `src/svg/sources.ts`
   * `src/svg/regenprompt.ts`
   * `src/svg/runbatch.ts`, `src/svg/runqueue.ts`, `src/svg/runplan.ts`, `src/svg/runcontrol.ts`, `src/svg/actions.ts`
6. **Gate check:** Run `tests/svg_*.test.ts`, `tsc`, `lint`, `quality:changed`.

---

### Phase C — `SvgConfirm` (`Generate` + Batch `Regenerate`) & `SvgImgConfirm` Wiring

7. **Red tests:**
   * Update & extend `tests/svg_confirm_regen_prompt.test.tsx` and `tests/svg_confirm.test.tsx`:
     * `Generate SVG` popup now renders `svg-confirm-default-prompt` above `svg-confirm-gen-preset`, allows choosing a saved preset for single (`svg-generate:single`) vs batch (`svg-generate:batch`) independently, remembers each default across re-opens, previews the chosen prompt live in `svg-confirm-full-prompt`, and sends `promptOverride` without mutating `SvgModel.prompt`.
     * `Regenerate SVG` popup renders `svg-regen-per-request` (default `4`, persisted in `iconSplitter.svg.regenBatch.v1`), plans `5` icons at `4` into `2` pages (`4 + 1`), previews all `4` old SVG codes on page 1 and `1` code on page 2, validates `1..9` bounds, switches live between `svg-regenerate:batch` and `svg-regenerate:single` when toggling count between `4` and `1`, and remembers each default independently.
   * Extend `tests/svg_imgconfirm_batch.test.tsx`:
     * Verify `svg-img-default-prompt` appears above `svg-img-preset`, picking presets for `svg-image:single` vs `svg-image:batch` remembers each independently, toggling `svg-img-per-request` between `4` and `1` switches between the batch and single defaults live, and **never** mutates `SvgModel.prompt` in the main SVG toolbar.
8. **Implement:**
   * `src/svg/SvgConfirmPlan.ts` (extracted clean hook)
   * `src/svg/SvgConfirm.tsx`
   * `src/svg/SvgConfirmFullPrompt.tsx`
   * `src/svg/SvgImgConfirm.tsx`
   * `src/svg/imgactions.ts`, `src/svg/panelbits.tsx`
9. **Gate check:** Run all `tests/svg_*.test.tsx`, `tsc`, `lint`, `quality:changed`, `npm run verify:fast`.

---

### Phase D — `SVG to upload` (`UploadMetaDialog`) Wiring, Current Docs Update & Full Verification

10. **Red tests:**
    * `tests/upload_meta_task_prompt.test.tsx` — mount `UploadPanel` / `UploadMetaDialog` across all 4 upload slots (`upload-generate:single`, `upload-generate:batch`, `upload-regenerate:single`, `upload-regenerate:batch`): verify `upload-meta-default-prompt` message above `upload-meta-preset`, verify independent default memory across all 4 slots and zero cross-contamination with `Generate SVG` presets, verify `upload-meta-prompt` updates live on selection, and verify `confirmMetadata` sends the chosen preset text to Gemini without clobbering `UploadModel.prompt`.
11. **Implement:**
    * `src/upload/UploadMetaDialog.tsx`
    * `src/upload/metaactions.ts`
    * `src/upload/actions.ts` (signature update if needed)
12. **Update Current Documentation (`RULE 17` — every page kept `< 9 KB`):**
    * `docs/current/sor/svg-generation.md` & `docs/current/sor/svg-generation-results.md` (batched SVG regeneration + per-task presets)
    * `docs/current/sor/svg-image-edits.md` (isolated single vs batch image task defaults)
    * `docs/current/sor/upload-metadata.md` (popup preset picker + single vs batch defaults)
    * `docs/current/sor/invariants/svg.md` (`I-64` update + new `I-74`), `docs/current/sor/invariants/shared.md` (new `I-75`), `docs/current/sor/invariants/README.md`
    * `docs/current/sor/storage/svg.md` (`iconSplitter.svg.regenBatch.v1`, `iconSplitter.taskPrompts.v1`)
    * `docs/current/sor/owners/svg.md`, `docs/current/sor/owners/shared.md`, `docs/current/sor/tests/svg.md`, `docs/current/sor/tests/upload.md`
    * `docs/current/selectors/svg-generation-dialogs.md`, `docs/current/selectors/svg-image-edits.md`, `docs/current/selectors/upload-dialogs.md`
    * Append one measured entry to `docs/current/QUALITY_RECHECK.md` (without loading the ledger).
13. **Final Verification Gate (`CODE_VERIFICATION.md` §8):**
    * `npx tsc --noEmit`
    * `npm run lint`
    * `node tools/quality.mjs --changed --base origin/main --allow-legacy`
    * `npm run verify` (all lanes including coverage, docs navigation, secret hygiene, native perf budgets, single-file production build).

---

## 7. Risk Matrix & Mitigations

| Risk | Impact if Unhandled | Mitigation in Design |
|---|---|---|
| Old SVGs on disk contain stale or missing `<title>` tags | LLM copies old `<title>` instead of expected manifest name, failing title lookup | `batchRegenPrompt` precedes each SVG with `Required <title>: <expectedName>` + explicit instruction to overwrite/insert exact `<title>` |
| LLM emits two `<svg>` blocks with the same `<title>` | First block could overwrite wrong icon if naive map-first-wins is used | `matchBlocksByTitle` quarantines any duplicated `<title>` completely (neither block written; reported in `problems` + `missing`) |
| Two icons in one batch come from `split_01/icon_AI.png` and `split_02/icon_AI.png` | Identical `source.stem` collides in batch manifest | `toBatchSourcesUnique` disambiguates colliding stems in the batch using extensionless relative paths |
| Output token ceiling (`maxTokens`) reached on large complex SVGs | Stream truncates mid-`<svg>` on e.g. 9 dense icons | Default batch count is conservative (`4`, matching image-edit default); user can dial `1..9` per run inside the popup; truncated XML fails `validateSvg` cleanly without touching prior versions |
| Multiple runs queued back-to-back with different task presets | Later preset pick mutates prompt used by earlier queued batch | `QueueItem` snapshots `promptOverride` + `RegenPlan` (including `presetText` and `perRequest`) at confirmation time (`I-53`) |
| Saved preset deleted after being remembered as a task default | Broken reference or silent blank prompt on next open | `resolveTaskPrompt` detects deleted preset on read, falls back safely (`Main editor prompt` or first valid preset), and explains `(saved preset “…” was deleted)` right in the status banner (`RULE 4`) |
| Existing test `tests/svg_confirm_regen_prompt.test.tsx` line 82 asserted `generate` had no dropdown | Old test locked pre-Feature-2 UI | Explicit update in Phase C step 7 to test the new `svg-confirm-gen-preset` + `svg-confirm-default-prompt` behaviour |
