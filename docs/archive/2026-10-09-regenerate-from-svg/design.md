# Regenerate SVG — main prompt + image, and "Regenerate from current SVG"

Date: 2026-10-09 · Area: Generate SVG (`src/svg/`) + Export settings (`src/upload/`)

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

Export settings (`⚙ Export settings…`, global scope only) gets one row,
**Regenerate SVG from**:

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
| Export settings row | `src/upload/UploadRegenSetting.tsx` | the choice, the preset drop-down, the live note |
| Plan / run wiring | `runplan.ts`, `runcontrol.ts`, `runner.ts`, `runtypes.ts`, `runbatch.ts` | the guard, the request size, the plan handed to the run |

The saved prompt presets are the existing metadata prompt presets
(`iconSplitter.upload.prompts.v1`, `lib/upload/promptpresets`). The setting is
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
  `tests/upload_regen_ui.test.tsx` written red first; `tests/svg_runner.test.ts`
  gained the end-to-end v2 case (one request per icon, code in the body, the
  record without the code).
* Gates: `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`,
  `npm run verify:fast` before commit; `npm run verify` before push.
