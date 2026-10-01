# SVG Preview Rendering — root cause + design (2026-10-01)

Root-cause analysis and design for the bug *"SVG generates and copies as valid
code; the in-app preview is missing or rendered incorrectly"*.

Status: **implemented** — behaviour now matches this document.
Current docs updated: `docs/current/SYSTEM_OF_RECORD.md` §2 (SVG preview), §7
(module table), §8 (tests); `docs/current/UI_SELECTORS.md` §P.

---

## 1. The trace: file load → validation → sanitization → preview DOM/CSS

| Step | Owner today | What it does with a saved SVG |
|---|---|---|
| load | `src/svg/sidecar.ts` `readSvgText` | returns the file text; no validation |
| validate | `src/lib/svgvalidate.ts` `validateSvg` | gate at **save** time only; files already on disk are never re-checked |
| sanitize | *(none)* | the saved text is previewed raw |
| preview DOM | `src/svg/preview.ts` → `SvgThumbs` | `data:image/svg+xml,…` inside `<img>` |
| preview CSS | `.svg-thumb` in `src/index.css` | `width:auto; max-width:116px; height:<thumb>` |

Five defects fall out of that trace. All five produce the reported symptom
("copies fine, preview missing/wrong") because **Copy reads the file and the
preview re-renders the same text through a stricter, unexplained path**.

### D1 — `<img>` + `data:` requires an `xmlns` declaration
A saved `<svg viewBox="0 0 24 24" fill="none">` with no
`xmlns="http://www.w3.org/2000/svg"` is *not* an SVG document when loaded as an
image: the root element is in no namespace, so the browser paints nothing.
`validateSvg` never required `xmlns`, so such a document is saved, copied and
shown as a broken image. **Primary cause of "preview missing".**

### D2 — the `startsWith("<")` guard rejects valid documents
`svgPreviewUrl` and `parseSvg` both refuse a document that does not start with
`<`. An XML prolog (`<?xml version="1.0"?>`), a `<!DOCTYPE svg …>` or a leading
comment makes a perfectly valid SVG un-previewable — and `parseSvg` refuses it
at save time too, so the failure looks like "the model produced nothing".
*Fixed on the preview side only*: `lib/svgvalidate` is the SAVE gate and keeps
its stricter rule, because generated code is cut from `<svg` to `</svg>` by
`svgextract` and can never carry a prolog — only hand-placed files can, and the
preview is the surface that has to tolerate those.

### D3 — no intrinsic size → no fit, no centre
SVGs that carry only a `viewBox`, or `width="100%"`, give an `<img>` no
intrinsic ratio. The browser falls back to 300×150, `object-fit: contain` then
boxes the artwork off-centre at the wrong scale. **Cause of "rendered wrong".**

### D4 — `currentColor` on a near-black frame is invisible
Stroke-only icons (`fill="none" stroke="currentColor"`) are the normal output
for line-icon prompts. Inside an `<img>` there is no inherited `color`, so
`currentColor` resolves to the UA default (black) on the `#05070f` thumb
background: the preview is *there* and draws nothing.

### D5 — no error surface, and the preview version can drift from Copy
A broken document produced `null` → a silent "No SVG" chip with no reason
(RULE 4: empty and broken were the same thing). And the row read its SVG text in
an effect keyed on `[relPath, rootRef]` — a ref, whose `.current` change is
invisible to React — so after picking a different folder or regenerating, the
preview could still show the previous document while Copy read the new version.

---

## 2. Design

### 2.1 One owner for the preview document: `src/lib/svgpreview.ts`

`buildSvgPreview(code: string | null): SvgPreview` is the single pipeline
(RULE 1 — markup work lives in `src/lib/`, never in the UI):

```
text → parse (real DOMParser, image/svg+xml)
     → repair namespaces when the first parse fails
     → require <svg> root + a usable box (viewBox, else px width/height)
     → sanitize (drop unsafe elements/attributes)
     → normalize (xmlns, 100%×100%, xMidYMid meet, ink colour, scoped ids)
     → serialize                              → { ok, html, viewBox, ratio, error }
```

* **Parse repair.** The first parse uses the text as saved. If it fails, the
  `<svg …>` start tag is re-parsed once with `xmlns` / `xmlns:xlink` injected,
  which is what an unbound `xlink:href` prefix or a missing `xmlns` needs. A
  document that still fails is reported, never silently dropped (RULE 4).
* **Box.** `viewBox` wins; otherwise `width`/`height` in px are turned into a
  `0 0 w h` viewBox. `%`/`em` and missing dimensions are *not* intrinsic sizes,
  so they are an honest error ("no viewBox and no usable width/height").
* **Fit + centre + stroke width.** The root gets `width="100%" height="100%"
  preserveAspectRatio="xMidYMid meet"` and the frame is a fixed square, so the
  artwork scales **uniformly** (strokes keep their proportions), fits inside the
  frame and is centred on both axes. Any `width`/`height` in the root's own
  `style` is dropped so it cannot override the fit.
* **Ink.** The root gets `color:#eaf0ff`, so `currentColor` strokes/fills
  resolve to a visible light ink (D4) while explicit colours are untouched.
* **Scoped ids.** Every `id` is prefixed (deterministically, from a hash of the
  document) together with `url(#id)`, `href="#id"` and `#id` selectors inside
  `<style>`. Many inline previews share one document; without this a row's
  gradient/mask/clip reference can resolve to **another row's** `<defs>` — the
  subtlest form of "rendered incorrectly".

### 2.2 Sanitizing, and why the preview is inline but isolated

The saved text is rendered **inline** (no data-URL round trip, so nothing can
be lost in encoding) but inside an **open shadow root**:

| Vector | Defence |
|---|---|
| scripts | `<script>`, `<handler>`, `<listener>` removed; `on*` attributes removed; markup inserted via `innerHTML` never executes scripts anyway |
| HTML escape hatches | `<foreignObject>`, `<iframe>`, `<embed>`, `<object>` removed |
| animation / timing | `<set>`, `<animate*>`, `<mpath>` removed (a preview is a still) |
| network (RULE 20) | `href` / `xlink:href` / `src` kept only for `#fragment` and `data:image/`; `@import` and non-fragment `url()` in `<style>` rejected — the element is dropped when its CSS is not safe |
| CSS escaping the preview | the preview lives in a shadow root, so its `<style>` is scoped to it and can never restyle the app (the reason shadow DOM is used instead of a bare `dangerouslySetInnerHTML`) |
| cross-row id collisions | ids scoped per document (§2.1) |

The **saved file is never modified**: everything above happens on a parsed copy
and only the serialized preview is handed to the DOM.

### 2.3 The React surface: `src/svg/SvgPreview.tsx`

`SvgPreviewBox({ code, size, testid, label, version })`:

* `code` empty/absent → "No SVG" chip (empty, not broken — RULE 4);
* `buildSvgPreview` fails → **"Preview failed"** chip whose `title` and
  `data-error` carry the reason ("not well-formed XML",
  "root element is not <svg>", "no viewBox and no usable width/height", …);
* otherwise a square frame with `role="img"` + `aria-label`, filled by the
  shadow root, and `data-version` so a test can prove the previewed version.

`src/svg/preview.ts` (`svgPreviewUrl` / `hasPreview`) is **deleted**: the data
URL it built is exactly the path that cannot render D1/D3/D4 documents.

### 2.4 One version for preview and Copy — `previewTargetOf`

`src/svg/rowmodel.ts` owns the mapping, so the row's preview and the row's
Copy action cannot disagree:

```ts
export interface SvgTarget { version: number; svgPath: string }
export function previewTargetOf(row: SvgRow): SvgTarget | null   // newest valid version
```

* `SvgThumbs` previews `target.svgPath`;
* `SvgRow`'s Copy / Code use `target.version`;
* the code dialog previews the very text it shows and copies.

`SvgModel` gains `rootToken` (bumped by every pick and every scan, action
`root-token`), and the row's SVG read is keyed on `[rootToken, svgPath]` — a
folder change can no longer leave a stale document on screen (D5, RULE 24).

---

## 3. Tests (RULE 8 — real logic, `tests/svg_preview.test.ts`)

Every case below fails if `buildSvgPreview` is deleted, and each one reproduces
a defect above:

| Case | Proves |
|---|---|
| SVG without `xmlns` | output carries `xmlns` (D1) |
| XML prolog / DOCTYPE / leading comment | still previews (D2) |
| `xlink:href` with no prefix declaration | repaired, not rejected |
| only `width`/`height` px, no `viewBox` | viewBox derived (D3) |
| `width="100%"` and no dimensions | honest error, not a broken box |
| varied boxes (24×24, 64×32, 512×128) | `ratio` + `xMidYMid meet` + 100% fit |
| stroke-only `currentColor` | ink colour set, strokes visible (D4) |
| own background rect / transparent | markup preserved |
| `<script>`, `onload`, `javascript:`, remote `href`, remote `url()` | removed |
| `<style>` with `@import` | element dropped; a safe `.cls{}` style is kept |
| two previews with the same gradient id | ids scoped, no cross-row bleed |
| truncated markup, prose, empty, null | `ok:false` + a specific error (RULE 4) |

DOM level (`tests/svg_ui.test.tsx`): the row renders an inline `<svg>` inside
the preview frame, `data-version` equals the version Copy uses, and a malformed
saved SVG shows "Preview failed" with its reason instead of an empty box.

## 4. Rejected alternatives

| Option | Why not |
|---|---|
| keep `<img>` + data URL | cannot fix `currentColor` or missing `xmlns` without rewriting the document anyway, and gives no error surface beyond `onerror` |
| bare `dangerouslySetInnerHTML` | a saved `<style>` could restyle the whole app |
| read every SVG during the scan | fewer bugs, but it doubles scan IO and still needs a re-read after a run |
| require `xmlns` in `validateSvg` | would reject documents that render perfectly well everywhere else; the preview must tolerate what the gate accepts |
