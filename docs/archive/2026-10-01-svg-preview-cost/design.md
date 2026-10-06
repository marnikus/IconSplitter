# SVG preview background + task cost — design (2026-10-01)

Two changes to the **Generate SVG** tab, both TDD-first and both confined to
surfaces the tab already owns:

1. a **preview background** control for the SVG previews (White / Black / Gray /
   Green / Red + custom), applied to the app's preview frame only;
2. a **cost** beside the token usage of **every** generation task/version,
   provider-reported when the provider reports it and clearly labelled
   **Estimated** when the app calculates it, stored in the per-file sidecar.

Nothing here touches the Sheets/Batch/Selection modes, and nothing changes an
SVG document: the background is CSS around the preview, the cost is metadata in
`<stem>.svg.json`.

## Why these two, and what was wrong before

* `.svg-thumb` paints an opaque near-black background (`#05070f`), so a
  dark-stroke SVG is invisible in the preview today. The frame colour has to be
  the user's choice, and black strokes must stay visible **whatever** is chosen.
* A cost was only ever shown for the newest version, only as a raw number, and
  `saveversion` dropped the allocated batch estimate
  (`cost: { actual, estimated: null }`). `recordFailure` hard-coded `USD`
  regardless of what the provider reported, there was no pricing version, and a
  version record without a `cost` field would have crashed the row on read.

## Layering

| Layer | Files | Rule |
|---|---|---|
| pure rules | `src/lib/svgbackground.ts`, `src/lib/svgpricing.ts`, `src/lib/svgusage.ts`, `src/lib/svgfile.ts` | unit-tested without a DOM |
| IO | `src/svg/saveversion.ts`, `runner.ts`, `rowmodel.ts`, `prefsstore.ts` | written by `fakefs` tests |
| UI | `src/svg/SvgBulkBar.tsx`, `SvgThumbs.tsx`, `SvgRow.tsx`, `SvgPanel.tsx`, `SvgDialogs.tsx` | a DOM test drives the real panel |

## 1. Preview background — `lib/svgbackground.ts`

```ts
type BgPreset = "white" | "black" | "gray" | "green" | "red" | "custom";
interface PreviewBackground { preset: BgPreset; custom: string }   // custom = "#rrggbb"
previewFrame(bg) -> { color: string; outline: boolean }
```

* Five presets with fixed colours, plus a custom colour validated by
  `normalizeHex` (`#abc`/`abc`/`#aabbcc` → `#aabbcc`; anything else → `null`).
* The stored payload is validated on every read (`parsePreviewBackground`):
  unknown preset, missing field or a broken custom hex falls back to the
  documented default (white) — one ignored load, never a broken tab (RULE 13).
* **Preview only.** The frame is a `background-color` on the wrapper element
  around the preview `<img>`; the SVG text handed to `svgPreviewUrl` is the
  byte-identical file content, and no SVG, sidecar or export is ever written by
  this control. A test asserts exactly that (URL + code dialog unchanged).
* **Black strokes stay visible.** A black-stroke SVG on the Black preset is
  invisible unless the app does something about it, so `previewFrame` decides
  `outline` from the WCAG non-text contrast of black against the chosen colour
  (`black vs background ≥ 3:1` → no outline needed). When it is below, the frame
  gets a *light outline around the artwork* — a CSS `drop-shadow` on the preview
  image, which follows the alpha shape and never enters the document. Light
  backgrounds (white, gray, green, red as chosen) need nothing.
* `outline` is a property of the **frame**, so the rule is pure, testable, and
  cannot leak into the saved code.
* Persistence: the existing SVG prefs payload (`iconSplitter.svg.prefs.v1`)
  grows a `previewBg` field next to `thumbHeight`; the panel restores it on
  boot and writes it on change (RULE 24 — the frame changes with the click).

## 2. Cost — `lib/svgpricing.ts` + `lib/svgusage.ts` + `lib/svgfile.ts`

**One decision, one owner.** `costInfoFor(model, usage)` is the only place that
chooses where a number comes from:

| condition | basis | stored |
|---|---|---|
| provider sent `usage.cost` | `provider` | `actual`, `estimated: null` |
| no cost, but the share of a batch total exists | `batch-split` | `estimated` |
| no cost, prompt **and** completion tokens known | `rate-card` | `estimated` |
| nothing usable | `none` | both `null`, shown as “no cost reported” |

* `allocateUsage(u, 1)` now returns the provider numbers untouched — a share of
  one is not an estimate. The runner therefore keeps a provider-reported cost
  reported for single-image requests (this was silently converted to an
  estimate before).
* The rate card is real data, verified 2026-10-01 against
  <https://www.requesty.ai/models/openai/gpt-6.1-sol>: `openai/gpt-6.1-sol`
  is **$2.00 / 1M input**, **$10.00 / 1M output**, Requesty adds a **5 %**
  pay-as-you-go markup (0 % with BYOK). `PRICING_VERSION`
  (`requesty-2026-10-01`) is bumped whenever the table or the markup changes and
  is stored with every cost.
* A rate-card estimate needs **both** token counts; if the provider reported
  only a total, the answer is “no cost reported”, never a guessed number.
  Prompt caching is not modelled, so an estimate can only be too high — said
  out loud in the pricing module.
* `CostInfo` grows `basis` and keeps `pricing`; the sidecar therefore always
  carries cost + currency + basis + pricing version, and the version record
  already carries the model.
* `parseSidecar` now **normalises** every version field by field: a missing or
  hand-edited `cost` reads back as `none` instead of crashing a row, and a
  legacy record (no `basis`) is inferred from what it holds.
* A returned-but-invalid SVG was charged for: `rejectOne` now records the same
  usage the request reported, so the failure record shows its cost too.

**Surfaces.** `costLabel(info)` → `$0.0123 reported` / `$0.0031 Estimated` /
`no cost reported`; `costText({reported, estimated})` for the sums (footer,
bulk estimate, run summary); `costNote(model, cost)` for the audit line
(model · currency · pricing version · basis). Row usage cell = version, tokens,
cost. History dialog = one row per version with tokens, cost **and** the audit
line. Non-USD currencies print their code instead of `$`.

## 3. Verification claims (each has a test)

* black strokes remain visible: `previewFrame(Black).outline === true`,
  `previewFrame(White).outline === false`, and the frame's colour is the chosen
  one — while the preview URL and the code dialog still hold the untouched file.
* the choice survives a restart: it is written to the SVG prefs payload and
  restored by a second mount.
* cost survives a restart: `saveSvgVersion` → `saveSidecar` → `loadSidecar` on a
  fresh refs object yields the same cost/currency/model/pricing/basis.
* cost matches the request metadata: a full run through `runGeneration` with a
  fake transport stores exactly the number the response reported (provider) or
  the documented share of it (batch split).

## 4. Undo, and why this is not in the timeline

The background is a **view preference**, like the thumbnail zoom: it changes what
the panel shows, never a file, a decision or a record. The SVG tab's zoom is not
undoable today, so making the colour alone undoable would create a two-speed
timeline inside one tab. Both are persisted and restored instead; §12.5 of
`SYSTEM_OF_RECORD.md` lists view prefs as editable, and the undo timeline stays
what it is: decisions and edits to documents.

## 5. Negative tests that shaped the design

* sidecar version without `cost` → row reads as “no cost reported”, no crash.
* estimate for an unknown model → `null`, shown as “no cost reported”.
* tokens without a cost where only `total` is known → no rate-card estimate.
* choosing a custom colour that is not a colour → the default is restored, the
  panel keeps rendering.
* the preview background never appears in the SVG text or in the sidecar JSON.
