# Generation queue, preferred versions, and one zoom for both tabs

Date: 2026-10-05. Request (verbatim headings):

> **QUEUE** — Keep Generate available during active generation. Append new batches
> to the queue; do not interrupt or block adding new work.
> **VARIANTS** — Add a popup showing all generated icon versions for one icon
> svg. Let users choose any version as preferred—not only the newest. Persist the
> choice and use it in the main preview without deleting history - all svg still
> then avaliable rechoose.
> **ZOOM** — Increase maximum thumbnail height from 240 to 800 px. Use the same
> zoom/preview behavior in Selection V2 and Generate SVG. Resize both paired
> thumbnails, preserve aspect ratio, and prevent clipping or overlap. Reusable
> same code for this feature for both.
> **VERIFY** — Test queue append, preferred-version persistence, and zoom up to
> 800 px in both tabs.

## 1. What the code does today (measured in the tree, `719bbd4`)

| Area | Today | File |
|---|---|---|
| Starting a run | `SvgBulkBar` disables **Generate** while `running`; `SvgConfirm` opens a dialog; `confirmRun` **returns** when `ctx.m.running` — a second batch can neither be confirmed nor queued | `svg/SvgBulkBar.tsx:84`, `svg/actions.ts:251` |
| Run state | one run at a time: `running: boolean`, `progress: RunProgress` (one batch strip) | `svg/statemodel.ts`, `svg/types.ts` |
| The version a row shows | `SvgRow.newest` = `newestValid(meta.versions)` (last generated+valid). Preview, Copy, Code, Approve/Decline and the list fields all read it | `svg/rowmodel.ts`, `svgh/…` readers |
| Decision storage | `PairMeta { v, pair, ai, source, decision, reviewedAt, versions[] }` — no notion of a chosen version | `lib/pairmeta.ts` |
| Version popup | `HistoryDialog`: a **table** (v, status, review, tokens, cost, saved, Code) — no artwork, no way to choose | `svg/SvgDialogs.tsx:109` |
| Zoom | `THUMB_MIN/MAX/STEP = 48/240/4`; V2 sizes both images by **height** with `width:auto` (aspect kept) but caps width at **`max-width: 126px`**; the SVG tab renders both previews as **fixed squares** sized by `--svg-thumb`, and the row's grid column is `calc(var(--svg-thumb) * 2 + 30px)` | `lib/reviewprefs.ts`, `selectionv2/ThumbPair.tsx`, `svg/SvgThumbs.tsx`, `index.css:380,930` |

Two measured defects behind the zoom ask:

* at 240 px a portrait pair is fine, but a **wide** image is squeezed: the fixed
  `max-width: 126px` in V2 crops the width while `height` stays — `object-fit:
  contain` letterboxes it inside a box of the wrong shape (visually "clipped");
* at 800 px the SVG tab's column would be **1630 px** wide (`2 × 800 + 30`) while
  the square boxes ignore each artwork's ratio, so both the box shape and the
  row width are wrong before anything is drawn.

## 2. The design

### I-53 — a run accepts work while it runs

* `Generate` is **never disabled by a run**: the button opens the same
  confirmation, and its confirm button reads **`Add to queue`** while a run is in
  flight (same plan, same statuses — RULE 10).
* `confirmRun` starts a run when idle and **appends** to the queue when busy.
  `refs.queue` is the authority (synchronous, like `refs.metas`); `model.queue`
  mirrors it for rendering (one writer, no drift).
* When a run ends, the head of the queue starts automatically (the same
  `startRun` path the first run used). A finished run's strip and outcomes stay
  visible until the next run replaces them.
* `Cancel` cancels the **run in flight and drops the queue**, saying how many
  queued batches were dropped — one gesture, one honest sentence.
* A queued batch can be dropped individually before it starts (`×` on its line in
  the strip).
* The queue is **session-only**: nothing is written. A queued batch was never
  sent, and the journal's promise is "never resend without the user" — restoring
  a queue from storage would send on boot.
* Queued ids do **not** get a fabricated row status: the strip names them, and a
  row turns `generating` only when its request really starts.

### I-54 — the version a row shows is chosen, persisted beside the images

* `PairMeta` gains an **additive, optional** field `preferred: number | null`.
  The stored version stays `v: 2`: a reader that predates the field ignores it,
  and a reader that has it defaults to `null`. Bumping to 3 would make every
  older build call every pair file *corrupt* (the parse gate in I-49), so the
  version stays and the field is additive — documented here and in
  `SYSTEM_OF_RECORD`.
* `lib/svgfile.chosenVersion(versions, preferred)`: the preferred version when it
  is **generated and valid**, else `newestValid(versions)`. One function, so a
  stale preference (a file deleted by hand, a version that failed validation)
  can never show a broken row.
* `SvgRow` keeps `newest` (what exists) and gains `preferred` (the chosen one
  when valid). Every reader that decides what the user sees — preview, Copy,
  Code, Approve/Decline, hotkeys, the list's version/tokens/cost fields and the
  scan key — goes through one helper `shownVersion(row)`. Nothing is deleted:
  `meta.versions` is untouched, and the popup can always re-choose.
* **The popup** (`svg/VersionsDialog.tsx`, opened by the row's `Versions` button,
  testids `svg-history-*` kept for selector stability) shows **every recorded
  version as a tile**: its artwork (read through the same `readCode` the Code
  dialog uses), its number, review, tokens, cost and saved time; failed versions
  appear as their status, never as artwork. Each generated tile has **`Use this
  version`** (disabled on the one already shown) and `Code`; the tile in use is
  marked. Choosing writes the pair file (tmp → verify → overwrite, I-41/I-43),
  updates the row and the preview immediately (RULE 24), logs the change and says
  one line. On a write failure nothing is claimed: the row stays as it was and
  the toast carries the reason.
* Not on the global undo timeline: the pair file is the record, and re-choosing
  is one click in a dialog that always shows the current choice (documented
  exclusion, RULE 12 §12.5 style).

### I-55 — one zoom, one pair layout, both tabs

* New `src/lib/zoom.ts` is the **one owner** of the zoom: `ZOOM_MIN = 48`,
  `ZOOM_MAX = 800`, `ZOOM_STEP = 4`, `ZOOM_DEFAULT = 84`, `clampZoom`,
  `zoomLabel`, and the shared size rule
  `zoomBox(maxH, { w, h }) = { width: round(height·w/h), height: min(maxH, h) }`
  (unknown pixels → a square of `maxH`; never upscaled past the source).
  `lib/reviewprefs` and `svg/prefsstore` persist the value; they no longer define
  it.
* New `src/ui/PairedThumbs.tsx` is the **one pair layout** both tabs mount: two
  labelled slots, `.pair-thumbs` flex row with a gap, each slot sized by its own
  box — nothing overlaps because the slots are `inline-flex` siblings, and
  nothing is clipped because every box has a real width and height and the media
  inside is `object-fit: contain` / `preserveAspectRatio="xMidYMid meet"`.
* `SvgPreviewBox` takes the box (`{ width, height }`) instead of a square side, so
  an SVG is drawn at its own `ratio` (`lib/svgpreview` already returns it) inside
  a frame of exactly that shape. The V2 cap `max-width: 126px` is deleted.
* Both rows' preview cells become **`max-content`** grid columns and the list
  scrolls horizontally when a pair is wider than the window — the honest outcome
  for an 800 px zoom on a 1500 px window (squeezing would clip or overlap).
* The row's `min-height` follows the box height, so a taller pair cannot paint
  over its neighbours (I-16).

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/zoom.ts` | **new**: the range, clamp, label and `zoomBox` | ~45 |
| `src/lib/reviewprefs.ts` | keeps the payload; imports clamp/default from `zoom` | 92 → ~85 |
| `src/lib/pairmeta.ts` | `preferred` (parse, default, serialize) + `withPreferred` | 286 → ~300 ⚠ (watch the gate) |
| `src/lib/svgfile.ts` | `chosenVersion(versions, preferred)` | 68 → ~80 |
| `src/svg/types.ts` | `SvgRow.preferred`, `QueueItem`, `SvgModel.queue`, `Dialog` unchanged | 71 → ~90 |
| `src/svg/rowmodel.ts` | `toRow` fills `preferred`; `shownVersion(row)`; list fields read it | 100 → ~110 |
| `src/svg/runqueue.ts` | **new**: enqueue/shift/drop/clear over the ref + the mirrored model list, plus the drain decision (pure) | ~70 |
| `src/svg/actions.ts` | `confirmRun` enqueues when busy; drains after a run; `cancelRun` clears; `preferVersion` | 285 → ~300 ⚠ |
| `src/svg/statemodel.ts` | `queue` field + `queue` action | 146 → ~155 |
| `src/svg/VersionsDialog.tsx` | **new**: the tile popup + `useVersionDocs` | ~150 |
| `src/svg/SvgDialogs.tsx` | routes `history` to it | 161 → ~150 |
| `src/svg/SvgBatchStrip.tsx` | the queued list + drop buttons | 58 → ~85 |
| `src/svg/SvgBulkBar.tsx`, `SvgPanel.tsx` | Generate stays enabled; queue prop | +4 |
| `src/ui/PairedThumbs.tsx` | **new**: the shared pair layout | ~45 |
| `src/svg/SvgThumbs.tsx`, `src/selectionv2/ThumbPair.tsx` | mount `PairedThumbs`; box from `zoomBox` | 106 → ~100 · 92 → ~95 |
| `src/index.css` | `.pair-thumbs`/`.pair-thumb`/tag, `max-content` columns, drop `max-width: 126px` | +25 |

Two files are at the ideal's edge (`pairmeta`, `actions`): if either crosses 300,
RULE 19 step 4 applies — `withPreferred` moves next to `chosenVersion` in
`lib/svgfile.ts`, and the queue mechanics live in `svg/runqueue.ts` (already
planned) so `actions.ts` only wires.

## 4. TDD order

1. `tests/zoom.test.ts` (new) — range `48…800`, clamp/step, `zoomBox` (portrait,
   landscape, exact, unknown, no upscale past the source), label.
2. `tests/reviewprefs.test.ts`, `tests/apply.test.ts` — the stored 9999 clamps to
   **800**; the old 240 expectation is the red line.
3. `tests/paired_thumbs.test.tsx` (new) — two slots, both boxes from one rule,
   tags, placeholders, no overlap (both slots present with their own box) and the
   container is a flex row with a gap.
4. `tests/svg_io.test.ts` — `chosenVersion`/`shownVersion`: preferred wins,
   invalid preference falls back to newest, list/preview/copy follow it; the scan
   key changes when the preference changes.
5. `tests/pairstore.test.ts`/`legacyfile`-adjacent — `preferred` round-trips
   through the file, defaults to `null`, survives `rebaseMeta`; an old file
   without the field parses (additive, no version bump).
6. `tests/svg_versions_ui.test.tsx` (new) — the popup lists every version (failed
   ones as status), the shown tile is marked, `Use this version` writes the file
   and updates the row, a write failure says so and changes nothing.
7. `tests/svg_queue.test.ts` (new) — pure queue rules: append, drop, clear, the
   drain decision (idle + non-empty → start the head), cancel drops the rest.
8. `tests/svg_ui.test.tsx` — DOM: Generate is enabled during a run; confirming
   while running appends and the strip shows it; the queued line can be dropped;
   `Cancel` drops the queue and says how many.
9. `npm run verify`, `npm run quality:changed`, then the browser probe of §5.

## 5. Verification (headless Chromium, real OPFS tree, stubbed provider)

A local SSE server (CORS-open) stands in for the provider, so a real run really
starts, really streams and really saves — the app's own request path, only the
network endpoint is local.

| Check | Expected |
|---|---|
| queue append | with request 1 in flight, Generate → confirm (`Add to queue`) appends; the strip shows `1 queued`; releasing request 1 starts the queued batch automatically |
| queue drop | `×` on a queued line removes it; Cancel drops the rest and says the count |
| preferred version | generate v2, open the popup, `Use this version` on v1 → the main preview shows v1; reload → still v1; v2 still listed and re-choosable |
| zoom 800 | both tabs: slider to 800, both thumbs of a row sized by the same rule, aspect preserved (a 2:1 image is twice as wide as tall), no clipping/overlap: the pair's boxes do not intersect and no box exceeds its own artwork ratio |
| zoom 48..800 sweep | every step value renders without overlap (the row height follows the box) |

## 6. Rejected alternatives

* **A second runner (parallel runs).** Two runs would fight over `refs.abort`,
  the strip, and the provider's rate limits; a queue is what the user asked for.
* **Persisting the queue.** It would resend unsent work after a restart — the
  opposite of the journal's rule.
* **A new row status `queued`.** It would leak an internal scheduling detail into
  the list's status vocabulary (filters, counts, the audit line) without telling
  the user anything the strip does not.
* **Bumping the pair-file version for `preferred`.** Older builds would call every
  file corrupt; additive-optional is the tolerant reading RULE 13 asks for.
* **Storing the preferred version in `localStorage` by pair id.** The pair id is
  root-relative (I-49): the choice would vanish under another picked root. The
  pair file travels with the images, which is exactly the point of I-41.
* **Keeping the SVG tab's square previews.** A square frame cannot preserve a
  2:1 artwork's ratio at 800 px without either cropping it or painting a mostly
  empty box; the requirement names aspect ratio and clipping explicitly.
* **Shrinking the zoom to fit the window.** The user asked for 800 px; squeezing
  it would silently ignore the setting. The list scrolls instead.
* **`max-width` caps to avoid wide rows.** That is the measured V2 defect: a cap
  on width while height is fixed is clipping by another name.

## 6. As landed (deviations from §3, and why)

| Planned | As landed | Why |
|---|---|---|
| `lib/pairmeta.ts` holds `preferred` | **new `lib/pairpreferred.ts`** (`withPreferred`, `readPreferred`); `pairmeta` imports `readPreferred` | 308 lines crossed the gate's 300; §3 step 4 named the extraction, and the choice + its fallback rule are exactly what a reader wants in one small file |
| `svg/runqueue.ts` = pure rules + the drain | **`runqueue.ts` (pure rules, 59) + `runcontrol.ts` (139)**: `setQueue`, `enqueueBatch`, `dropWaiting`, `dropQueueForCancel`, `busy`, `confirmRun`, `drainQueue`, `startRun` | the pure rules stay provable without a run, and the async half is the only place that owns the one run in flight |
| queue drawn inside `SvgBatchStrip` | **new `svg/SvgQueue.tsx`** (34) rendered by `SvgPanel` under the strip | the strip is the RUN's record; the queue is scheduling — two facts, two surfaces, and the strip is absent exactly when nothing runs while the queue must stay visible |
| the queue carries only ids | each item also carries its **label** (`first file + N more`) | the waiting list names the batch the user just confirmed, not `q3` |
| `actions.ts` drops the queue on cancel and says how many | same, **plus `CancelNote {dropped}` rides on the abort** | the run's own final line is written after the cancel toast; without it the summary would read "cancelled" with no word about the dropped batches |

Everything else (§1–§2 rules, `chosenVersion`, `shownVersion`, the tile popup's
testids, `zoomBox`/`zoomBoxRatio`, `PairedThumbs`, the CSS contract) landed as
designed. Verified in `docs/current/QUALITY_RECHECK.md` § "2026-10-05 — I-53/54/55".
