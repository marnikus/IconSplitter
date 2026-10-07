# Upload relax + clean — metadata floors, fill-only background, artboard sizes, SVG 1.1 + clean code (2026-10-07)

Request (verbatim, lightly formatted): relax the metadata policy (tags ≥10, title
≥5 words whole, description ≥7 words — no strict maxima, no two-sentence title);
background must be fill-only (currently inherits stroke); add artboard final size
(512×512 + popular presets + custom with aspect change); optimized SVG must be
version 1.1; clean code (no `<image>`, valid viewBox, no editor bloat); strip all
names/IDs (only `g`/`path`/`fill`/etc. survive).

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Tags: `TAG_MIN_COUNT = 10`, unique, no max, **no mandatory list** (user chose `min10_nomandatory`), duplicates still rejected | User: "must have at least 10 tags". Mandatory 7 dropped by explicit choice. |
| D2 | Title: **one check** — `countWords(title) ≥ 5`. No sentence split, no max, no tag-naming (user chose `simple_min5`) | User: "Only check if Title whole length at least 5 words". `splitTitleSentences` deleted (dead code otherwise, RULE 16.4). |
| D3 | Description: **one check** — `countWords(description) ≥ 7`. No max | User: "Only check if Description has length at least 7 words". |
| D4 | Prompt rewritten to state D1–D3 exactly (honesty: prompt = validator, I-31 style) | The panel promises "the validator enforces what the prompt states". |
| D5 | Background rect gets explicit `stroke="none"` (user chose `fill_only`) | Root/group `stroke` inherits onto the rect today, painting an outline around the artboard. Fill-only = one attribute. No behaviour change for fill icons. |
| D6 | Artboard: new settings `artboard` preset (`256`/`512`/`1024`/`2048`/`4096`/`custom`, default `512`) + `artboardWidth`/`artboardHeight` (custom only, 16–4096, default 512×512). `fitArtboardToSize` expands the padded viewBox to the target aspect (centered, never stretched), `width`/`height` = target px | User chose `more_presets`. Square presets cover favicon→stock; custom W×H changes aspect. JPEG keeps its MP logic on the expanded aspect. |
| D7 | Optimize: `preset-default` with **zero overrides** (defaults already remove metadata bloat, editor descs, comments, editor namespaces, unused IDs + minify used) + `removeAttrs[data-.*]` (layer names SVGO keeps) + `addAttributesToSVGElement[version=1.1]` | Fixes two real bugs: `removeTitle`/`removeViewBox` overrides warn (not in preset), `removeMetadata:false`/`removeDesc:false` keep bloat. Version 1.1 enforced by plugin (overwrites 2.0). |
| D8 | Post-SVGO DOM clean in `optimizeSvg`: drop `class` iff no `<style>` remains (safe — preset inlines fill-only styles), drop any surviving `data-*`, verify `version=1.1` + `xmlns` + valid viewBox, **reject `<image>`** (throw — prepare already rejects, this is the second gate) | `class` survives preset only when a `<style>` still needs it; removing it then would break rendering. `<image>` = raster = must never ship (clean requirement). |
| D9 | `exportvalidate` gains the clean gate: SVG parses + valid viewBox (`0 0 w h`, w/h > 0) + no `<image>` + `version=1.1` | RULE 15: fail closed before commit. One place, tested. |
| D10 | Existing tests encoding the old strict policy are updated in the same change (meta/prepare/optimize/settings/geom/runmetadata/runexport/metacache/ui) | RULE 8: tests pin behaviour; the behaviour changed by request. |

Non-goals: no change to JPEG MP default (15.1), stroke normalization, EPS subset,
Gemini transport, or the pair-file schema. `class` is kept when a `<style>` needs
it (D8) — documented, not silent.

## 2. Module plan (RULE 18: small, one responsibility)

| File | Change | Lines (est.) |
|---|---|---|
| `src/lib/upload/meta.ts` | D1–D4: new consts/prompt/validator, delete sentence + mandatory + max logic | ~120 (was 169) |
| `src/lib/upload/settings.ts` | D6: 3 new fields + clamps + normalize/parse/equal/fingerprint | ~180 (was 139) |
| `src/lib/upload/geom.ts` | D6: `ARTBOARD_PRESETS`, `artboardSizeOf`, `fitArtboardToSize` (expand-to-aspect) | ~150 (was 101) |
| `src/lib/upload/prepare.ts` | D5+D6: `stroke="none"` on bg rect; viewBox = expanded, `width`/`height` = target px | ~160 (was 140) |
| `src/lib/upload/optimize.ts` | D7+D8: fixed config + DOM clean + `<image>` rejection | ~130 (was 72) |
| `src/upload/exportvalidate.ts` | D9: clean gate (viewBox/`<image>`/version) | ~130 (was ~110) |
| `src/upload/UploadSettingsDialog.tsx` | D6: preset select + custom W×H (markers, RULE 24 live) | ~200 (was ~170) |

All functions ≤30 LOC, ≤4 params, CC ≤10, nesting ≤4 (RULE 16). No `PartN` names.

## 3. TDD order (red → green → refactor)

1. `meta` — new floors accept, old strict rejects gone, dupes still fail, prompt states new rules.
2. `prepare` bg — `stroke="none"` even with root/group stroke.
3. `settings` + `geom` artboard — presets, custom clamp, aspect expansion (square target on wide art centers), no stretch, fingerprint moves.
4. `prepare` artboard — `width`/`height` = target, viewBox aspect = target aspect, bg covers viewBox.
5. `optimize` — version 1.1 (incl. overwrite 2.0), metadata bloat gone, title/desc kept, `data-*` gone, unused ids gone + used minified, `<image>` throws, viewBox kept.
6. `exportvalidate` — clean gate rejects missing viewBox / `<image>` / wrong version.
7. UI dialog — preset select + custom fields appear only for custom, markers, live.
8. Update old strict tests (runmetadata/runexport/metacache/ui/geom/prepare/settings).

## 4. Verification

`npx tsc --noEmit` · `npm run lint` · `node tools/quality.mjs --changed --allow-legacy` ·
`npm test` · `npm run coverage` (src/lib ≥80%) · `npm run build` (= `npm run verify`).
RULE 18 recheck per file + QUALITY_RECHECK entry. SYSTEM_OF_RECORD §2/§5 updated
(metadata floors, artboard, version 1.1, clean gate), UI_SELECTORS for new inputs.
