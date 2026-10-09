# Regenerate SVG — main prompt + image, and "Regenerate from current SVG"

Date: 2026-10-09 · Area: Generate SVG (`src/svg/`), shared prompt window (`src/ui/`), Export settings (`src/upload/`)

This doc has two features. Feature 1 is the baseline contract that already
holds; Feature 2 is new. Read §1 for the contract, §2 for the new option.

## 1. Feature 1 — regenerate = full main prompt + first image

A row's **Regenerate** (`SvgRow` → `actions.generate([id], "front")`) plans ONE
source. A one-source request is sent as:

* **text:** the full main prompt (`svg` tab prompt, verbatim, `trim()` only)
  followed by `Icon name (use it as the SVG <title>): <stem>` —
  `lib/svgprompt.singlePrompt`;
* **image:** the source's AI image alone, drawn into a one-cell square
  composite (`lib/svgcomposite.compositeLayout(1)`), so the model sees exactly
  the first image and nothing else.

Nothing about this changes. It is locked by `tests/svg_regen.test.ts` and
`tests/svg_regenprompt.test.ts` (main-mode cases), so a later change cannot
silently alter what a regeneration sends.

## 2. Feature 2 — "Regenerate from current SVG" (option v2)

### 2.1 What the user sees

> **Revision 2026-10-09 (same day, after the first cut):** the row moved out of
> Export settings into the Generate SVG tab, as a window directly above the
> main prompt window. The drop-down lists the **SVG prompt presets**, which are
> their own list (`iconSplitter.svg.prompts.v1`). The main prompt window gained
> the same preset controls as the metadata prompt (select, Quick load, Delete,
> Save as), and both windows now share one implementation (`ui/PromptWindow`,
> `ui/PromptPresetBar`, `ui/presetops`, see SYSTEM_OF_RECORD I-65). The text
> below describes the first cut where it says Export settings; the placement
> and the preset list named in §4 are the revised ones.

In the Generate SVG tab, a window **Regenerate SVG from** sits above the prompt
window (global; one choice for the whole tab). It has one row:

| Choice | What a regeneration sends |
|---|---|
| Main prompt + first image (default) | Feature 1, unchanged |
| Regenerate from current SVG | the **saved prompt the user picks** (drop-down of the saved prompt presets) + the icon's **newest valid SVG code** + the **same first image** |

A saved prompt is required in v2. Without one, or when the picked preset was
deleted, the row says why and the run is refused before any byte is sent
(RULE 4 — empty ≠ broken, RULE 2).

### 2.2 Request shape (v2, one icon per request)

```
<saved prompt text, trimmed>

Icon name (use it as the SVG <title>): <stem>

Current SVG code of this icon — regenerate it from the attached image following the instructions above:
<newest valid SVG file text>
```

* The image is the same one-cell composite as Feature 1.
* The newest valid version is `lib/svgfile.newestValid` — the last generated,
  validated SVG on disk (failed/interrupted versions are skipped).
* **One icon per request.** Each icon carries its own code, so a contact sheet
  would mix codes. In v2 the request size is 1 whatever `imagesPerRequest` says
  (`lib/svgregen.requestSizeFor`). The confirmation dialog counts the same plan.
* An icon with **no** valid SVG yet is sent with the main prompt (Feature 1)
  and a warn-level log line says so — it is a first generation, not a regen.
* An unreadable current SVG fails that one icon with an honest error and sends
  nothing (fail closed).

### 2.3 Version record

The sidecar keeps the **prompt text** the request was built from — the saved
prompt plus the icon-name line — never the SVG code. The code is the newest
valid version's own file, so copying it into every pair file would only
duplicate data. (`RequestText.record` in `svg/regenprompt.ts`.)

### 2.4 Storage and modules

| Piece | Where | Owns |
|---|---|---|
| Setting shape, parse/serialize | `src/lib/svgregen.ts` | `RegenSetting`, `RegenPlan`, `regenPlanOf`, `requestSizeFor`, `currentSvgPrompt`, `regenLabelOf` (pure) |
| Persistence | `src/svg/regenstore.ts` | key `iconSplitter.svg.regen.v1`, `resolveRegen()` (setting + saved presets) |
| Request text | `src/svg/regenprompt.ts` | which text and image one request carries; reads the current SVG |
| Regen window | `src/svg/RegenSetting.tsx`, `src/svg/SvgPromptZone.tsx` | the choice, the SVG preset drop-down (live from the prompt window), the live note |
| Plan / run wiring | `runplan.ts`, `runcontrol.ts`, `runner.ts`, `runtypes.ts`, `runbatch.ts` | the guard, the request size, the plan handed to the run |

The saved prompts are the SVG prompt presets (`iconSplitter.svg.prompts.v1`,
`lib/promptpresets`), separate from the metadata presets. The setting is
kept OUT of `iconSplitter.upload.settings.v1` on purpose: that object is
fingerprinted for selective re-export, and a generation choice must not
invalidate exports.

### 2.5 Invariants touched

* RULE 13: parse validates the version, the mode and the name; junk → Feature 1
  default, one ignored load, never a crash.
* RULE 4/2: a missing preset is a named, visible refusal; the run never sends a
  request whose text it could not build.
* RULE 3: `lib/svgregen` is pure — the stored setting and the presets are
  resolved once at the edge (`resolveRegen`) and passed in as `RegenPlan`.

## 3. Verification

* TDD: `tests/svg_regen.test.ts`, `tests/svg_regenprompt.test.ts`,
  `tests/svg_regen_ui.test.tsx` written red first; the shared preset rule
  (`tests/prompt_presets_shared.test.ts`, `tests/svg_prompt_presets.test.ts`)
  written red first as well; `tests/svg_runner.test.ts`
  gained the end-to-end v2 case (one request per icon, code in the body, the
  record without the code).
* Gates: `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
  `npm run verify:fast` before commit; `npm run verify` before push.
