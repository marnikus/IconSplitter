# Regenerate from current SVG — the v2 generation request (2026-10-09)

Today, re-generating an icon that already has a version sends the **full main
prompt + the reference image** — the provider starts from zero. The user wants
a second mode: send the icon's **last generated SVG code** + a **saved prompt
preset** + the same reference image, so the provider improves what is already
there. Decided with the user (2026-10-09): the mode applies to **re-generation
in the Generate SVG tab** (first-time generation is untouched), and because one
old SVG travels per request, **re-generated icons go solo** — one icon per
request — while brand-new icons still batch at the configured size. The two
controls live where the user pointed: the **Export settings** dialog
(`UploadSettingsDialog`), next to the export defaults.

## 1. The request, exactly

A v2 request is the normal multimodal shape (`buildChatRequest`) with a
different text part — `lib/regensvg.regenPrompt(presetText, code, name)`:

1. the selected preset's text (the user's own words, untouched);
2. one instruction sentence naming the code block and the reference image;
3. the current SVG code in a fenced ```svg block;
4. the same `Icon name (use it as the SVG <title>): …` contract line
   `singlePrompt` uses — so extraction, matching and the saved title behave
   exactly as they always did (the result "returns as always").

The image part is the source's composite, unchanged — the same reference image
the first generation carried.

## 2. Decisions

* **D1 — one pure owner for the rule** (`lib/regensvg.ts`): the settings shape
  (`{ enabled, preset }` — preset is a saved preset's NAME), its parse/
  serialize pair (RULE 13), the v2 prompt text, and the "which sources go solo"
  predicate. No IO, no React.
* **D2 — its own store** (`svg/regenstore.ts`, key `iconSplitter.svg.regen.v1`):
  the option is generation behaviour, not export behaviour, so it does not live
  in `lib/upload/settings`; the Export settings dialog merely *edits* it,
  through one self-contained section component (`upload/UploadRegenSettings`).
  Global only — a per-icon override is not offered, and the section says so.
* **D3 — the preset list is the existing saved prompt presets**
  (`upload/promptstore.loadPresets`): the dropdown lists their names; the run
  resolves the NAME to TEXT when the run starts. No presets saved → the section
  says so and re-generation behaves as today; a name that vanished by run time
  downgrades to the main prompt (never an invented text).
* **D4 — solo split in the ONE splitter** (`lib/svgbatch.planBatches`): a
  `BatchSource` may be `solo`; a solo source flushes the open batch and travels
  alone. `runplan.planOf`, the confirmation dialog and `runcontrol.startRun`
  all mark solo with the same predicate (regen on AND the row has a `generated`
  version), so the plan the user confirms is the plan that leaves (RUN-1).
* **D5 — the runner reads the code, never the UI**: `runbatch`, for a solo item
  with regen on and a preset text, takes the NEWEST `generated` version from
  the pair meta and reads its file (`readSvgText`). A missing file downgrades
  that item to the main prompt and names itself in the run's problems (RULE 4)
  — a regeneration that cannot show its current code is a first generation.
* **D6 — the pair file records what was sent**: the version's stored `prompt`
  is the v2 text when v2 ran, so "what produced this version" stays true.
* **D7 — the confirmation states the mode** (`svg-confirm-regen`): "N of M
  icons regenerate from their current SVG · preset 'X'", and the Requests fact
  already shows the solo split because it reads the same plan.

## 3. Owner files

`lib/regensvg.ts` (new), `svg/regenstore.ts` (new), `lib/svgbatch.ts` (solo),
`svg/runplan.ts` (predicate + solo plan), `svg/runtypes.ts` (`RunArgs.regen`),
`svg/runcontrol.ts` (tags sources, resolves preset text), `svg/runbatch.ts`
(v2 prompt + recorded prompt), `svg/SvgConfirm.tsx` (the mode fact),
`upload/UploadRegenSettings.tsx` (new section) + `UploadSettingsDialog.tsx`
(mounts it). Tests: `regensvg`, `svg_regen`, `regen_ui`.

## 4. As built (2026-10-09)

Three refinements over the decisions above, no behaviour change:

* **One arm source.** `svg/runplan.effectiveRegen()` reads the store and
  resolves the preset name → `{ on, preset, presetText }`; `SvgConfirm`,
  `runcontrol` and (via `RunArgs.regen`) the runner all read THAT, and the
  runner additionally ignores `solo` marks while `presetText === null`, so a
  null-preset run is byte-for-byte today's run (D3 hardened).
* **runbatch stayed under RULE 16** by giving the two responsibilities this
  feature added their own modules: `svg/regenprompt.ts` (which text one
  request carries) and `svg/runsave.ts` (mapping answers back to sources and
  writing versions/metas); `runbatch.ts` is now transport + journal + tally.
* **Confirm fact simplification.** With `effectiveRegen` the Fact never needs
  a "no preset saved" variant — when the preset cannot resolve, `on` is false
  and the Fact is simply absent.
