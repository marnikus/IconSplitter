# Batched AI-source image edits — design (2026-10-19)

**Status: proposal only. No application code or current behaviour changes in this document.**
The goal is to send one square image containing several current AI-source icons to the
image-edit provider, ask for thinner lines, split the returned square by its original
cell positions, and give each icon its own new source-image version. Four and nine
icons make 2×2 and 3×3 sheets; the number is a user preference, not a fixed choice.

## 1. What exists today

- The Generate SVG tab's **Regenerate image** actions open one confirm-before-send
  dialog. `src/svg/imgactions.ts` and `src/svg/imgrunner.ts` send one `/images/edits`
  request **per source**: editable prompt plus that row's *current main* AI image as
  the single multipart `image[]` reference. Concurrency is separate from request
  size: four concurrent single-image requests are still four requests.
- `src/lib/svgimgreg.ts`, `src/svg/imgregfiles.ts` and `src/svg/imgactions.ts` allocate
  a new file under `AI source regeneration versions/`, append an `imageVersions[]`
  entry and move `imagePreferred` only for a successful, saved result (I-71).
  `mainImageOf` is also what the row thumbnail and subsequent SVG generation read.
  A failed request does not replace the original or an older version.
- **SVG text generation** already builds square PNG contact sheets in
  `src/lib/svgcomposite.ts` / `src/lib/svgcanvas.ts` and previews them before
  sending. Its ordered manifest and `src/lib/svgextract.ts` match *textual SVG
  blocks*, not pixels. The SVG `imagesPerRequest` value and the connection's
  `Images (n)` output control do not batch `/images/edits` today.
- The current edit prompt is user-editable; there is no built-in thin-line
  transformation. This design adds a grid-preservation instruction to the
  user-visible effective prompt for multi-icon edits, rather than claiming the
  current prompt already does that.

Relevant current contracts: `docs/current/SYSTEM_OF_RECORD.md` §2 (Generate SVG),
§5 I-71, §6 (storage), §7 (owners); `docs/current/UI_SELECTORS.md` §Generate SVG,
`svg-img-confirm` and `svg-img-caps`.

## 2. User journey and boundaries

1. Select the intended rows or use one row's Regenerate image action. A distinct
   **Icons per image-edit request** integer control in that dialog stores the
   last valid preference (proposed default **4**). **1** retains the existing
   single-image workflow. The control is not the number of images the provider
   should return, nor does it change SVG text generation's separate batch size.
   Accept a user-chosen positive count, not just 4 or 9; publish a practical
   upper bound based on tested output resolution, minimum usable cell size and
   browser/model limits. Reject an over-limit value visibly, never silently
   substitute another count. Nine must work at a supported square resolution.
2. Before sending, page through **one preview per request**: the exact composite
   to upload, its numbered row-major cell-to-icon manifest, blank cells, full
   effective prompt, provider/model, output size, request count and timeout.
   Display names, not absolute local paths. Cancel/Escape sends nothing.
   Selection, reference bytes and prompt used to build a preview must be the
   ones sent; if they change, require a fresh preview/confirmation.
3. Each request sends **one composite reference image and one prompt**, and
   expects **one edited composite** back. A 9-icon selection at size 4 yields
   groups of 4, 4 and 1; at size 9 it yields one 3×3 request. The last group
   may have unused cells. Count requests as `ceil(selected / preference)`;
   concurrency limits simultaneous *requests*, not slots per request.
4. For groups of more than one, show the returned mosaic and the proposed
   named crops side by side **before applying them**. The user can Apply or
   Discard that response; Discard writes no versions, but does not undo the
   provider charge. This is a safety gate: percentages handle resizing, not a
   provider that moves, swaps or redraws icons in the wrong cells. For size 1,
   preserve the existing immediate-save behaviour. A fallback to size 1 is
   always available when the model cannot reliably keep a grid.
5. Apply writes each approved crop as a new version of **its original pair**.
   Each successful pair gets its own preferred main image; its original and
   older versions remain selectable. No combined sheet becomes an icon's
   source file. The row and later SVG generation immediately use that same
   preferred image.

## 3. High-level interfaces and owners (proposed)

| Boundary | Contract | Home / reuse |
|---|---|---|
| Selection snapshot | Stable source/pair ID, pair-file identity, main-image path and version, reference-byte fingerprint, selected order; no identity based on a rendered row index | `src/svg/imgactions.ts`, existing `mainImageOf`, approved-source list |
| Batch plan | Requested max per request, ordered groups, one `slot → pair ID` manifest per group, square grid and **normalized cell rectangles**; fail before sending on missing/duplicate/unsafe inputs | New small pure planner in `src/lib/`; reuse SVG layout/order rules where suitable, not SVG response matching |
| Composite encoder | Exact source bytes fitted without distortion into square cells, blank unused cells, bounded square PNG, and a preview of the **same bytes** sent to the provider | Existing canvas/composite primitives plus image-edit-specific adapter in `src/svg/`; pixel math in `src/lib/` (RULE 1) |
| Image edit | One multipart composite in `image[]`, effective user prompt + non-optional grid instruction, configured image connection, provider request ID and request-level usage/cost | `src/lib/svgimgedit.ts`, `src/svg/imgrunner.ts`; do not send provider `n` in place of batching |
| Response splitter | Exactly one decodable image, checked dimensions/type, one crop per occupied slot mapped by saved pair ID, PNG-encoded crops; **no** name/order inference from new artwork | New pixel/geometry logic in `src/lib/` and browser canvas adapter; no `svgextract.ts` |
| Pair commit | Per-crop success/failure through the existing unique-file and verified pair-file save, keeping `refs.metas` and row state current | `src/svg/imgactions.ts`, `src/svg/imgregfiles.ts`, `src/lib/svgimgreg.ts`, existing pair writer |
| UI + preference | Validated, versioned local preference; numbered preview, post-result Apply/Discard, group and icon progress, Stop, toast/log | `src/svg/SvgImgConfirm.tsx`, small review component, existing state/actions; add `svg-` test handles when built |

The planner owns identities/geometry; the runner owns network outcomes; the
splitter owns returned pixels; the existing per-pair writer owns version history.
A returned array index or a list's current visual sort never owns icon identity.
These are conceptual boundaries, **not implemented APIs or new files yet**.

## 4. Mapping and crop logic

- Capture selected sources in one stable order at confirmation. Within each
  group, fill slots **left to right, top to bottom**: 1, 2, 3 / 4, 5, 6 /
  7, 8, 9 for nine. With `n` occupied slots, `g = ceil(sqrt(n))`, producing
  a `g × g` square of equal square cells; leave any remainder blank. Keep a
  manifest of `(pair ID, source version/fingerprint, 1-based slot, row, column,
  x, y, width, height)`. The normalized cell rectangle is
  `(column/g, row/g, 1/g, 1/g)`, with row/column starting at zero. No source
  is assigned to an empty slot. The manifest remains attached to this exact
  request even if the UI resorts or another request finishes first.
- Fit each input image inside its cell without stretching or cropping; note
  padding/background in the prompt and preview. The **output crop is the full
  cell**, including any padding, yielding one square source PNG per icon.
  Keep the original non-square file untouched. Do not place labels *inside*
  the crop that could become part of the generated icon; positions are named
  in the prompt and the UI manifest.
- Ask the editor to thin each icon's lines while preserving its identity,
  number, slot, orientation, background and grid, with no added/swapped icons
  or artwork in empty slots. Show the **complete** effective prompt, including
  these layout constraints and the user's own text, before sending. A prompt
  is not a guarantee that a generative model will preserve geometry.
- Validate the response has one image (missing or extra images are errors),
  decodes to supported pixels, is within safe pixel limits, and has the same
  **square aspect ratio** within integer-rounding tolerance. The absolute
  dimensions may differ: multiply each stored fractional edge by the
  **returned** width/height and round shared boundaries consistently so cells
  neither overlap nor leave gaps. If aspect/geometry cannot be mapped, do
  **not** write any crop from that request. A plausible square alone cannot
  prove icon identity: the post-result preview is the identity check.
- Require square output size for multi-icon edits. If the active image
  connection requests portrait/landscape, explain the mismatch and require
  an explicit square choice rather than silently changing the connection.
  Since version filenames are `.png`, validate actual PNG output or convert
  each verified decoded crop to PNG before it reaches the writer; do not
  merely give JPEG/WebP bytes a `.png` extension.

## 5. Outcomes, concurrency and persistence

- Preflight every group for a readable current main image, valid pair metadata,
  usable key/image connection, square settings and a mappable plan. An invalid
  group is reported by pair and is not sent; other valid groups can proceed.
  The confirmed preview's bytes and ID/version snapshots are the send inputs.
  Recheck the pair's main version/source fingerprint before Apply: if it
  changed or the row disappeared, **skip that pair with a named reason**, not
  a write onto someone else's newer work. Results may finish out of order.
- Apply per pair using the existing disk-and-history `_vN` allocator, no-
  overwrite write, verified sidecar save, and `imagePreferred` update only
  after a verified version exists. A failed cell save must not point at a
  missing file or undo a different pair's successful crop. Record network or
  split failure as failed attempts for affected sources, with the shared
  request ID/reason; Discard is a user choice, not a fabricated failure.
  An unexpected partial disk write is reported explicitly.
- Keep one image run at a time and bounded request concurrency. Progress
  distinguishes groups sent/finished, icons saved/failed/discarded and
  pending review; queued icons are not described as already sent. Stop sends
  no new groups; already-sent groups may finish and still need review. Long
  composition/crop loops yield to the UI; a failed group never corrupts an
  unrelated group. Do not automatically retry a timeout/reload of a sent
  request with unknown outcome. The implementation plan must include a small
  validated request journal or equivalent honest restart notice, with
  deliberate user retry, before claiming restart-safe batching.
- Usage, cost and provider request ID belong to **one composite request**.
  Log them once per request and sum once in the run summary; show per-pair
  success/failure with a shared request ID, but never multiply the request
  cost by the number of icons or invent a per-icon rate. Do not claim cost
  for a response with no reported cost. Existing image versions need not
  store invented per-icon usage. Logs must omit keys, image bytes, data URLs
  and full prompts.

## 6. Privacy/documentation prerequisite

`docs/current/AGENT_RULES.md` RULE 20 and `docs/current/SYSTEM_OF_RECORD.md`
I-5 currently say **image bytes never leave the browser**, yet the documented,
confirmed SVG and `/images/edits` flows already send image bytes to a configured
provider. That is a real inconsistency, **not** an existing blanket exception.
Before implementing, reconcile both current rules narrowly: local image
processing/exports remain private, and only the user-confirmed provider call
may transmit the **previewed** reference composite and effective prompt to the
named provider. Queued requests may proceed only within that explicitly
confirmed run; never upload outside it or send analytics, keys or image bytes
in logs. The pre-send dialog must plainly disclose that one composite contains
*all* listed icons, not just one source image.

## 7. Verification and documentation when implemented

- Tests first: layout/order and blank cells for 1, 4, 5, 9 and partial groups;
  variable-sized same-ratio results with synthetic colored cells proving each
  crop returns to the correct pair; non-square/malformed/extra-image response
  refusal; source changes during a request; PNG bytes; per-pair write failure
  versus another successful write; Stop, timeout, reload/unknown and no
  automatic resend; request-level cost counted once; preview bytes/prompt
  equal sent bytes/prompt; existing single-image versions and SVG use of the
  newly preferred image. Use real `src/lib` logic, not mocks (RULE 8).
- Start from `tests/svgimgreg.test.ts`, `tests/svgimgedit.test.ts`,
  `tests/svg_imgrunner.test.ts`, `tests/svg_imgreg_ui.test.tsx`,
  `tests/svg_batch.test.ts` and `tests/svg_canvas.test.ts`. Validate both
  2×2 and 3×3 edited composites against a real image provider before
  publishing a final maximum batch size: normalized crops do not protect
  against model re-layout or unreadably tiny icons.
- In the implementation commit, update `docs/current/SYSTEM_OF_RECORD.md`
  (behaviour, I-71 or a new invariant, storage, owners/tests/UI),
  `docs/current/UI_SELECTORS.md` (actual new controls), and the reconciled
  RULE 20/I-5 wording. Keep this dated document as the design snapshot,
  not a claim that batching already ships.
