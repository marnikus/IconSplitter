# Svg invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-17"></a>
* **I-17 (SVG preview, RULE 3/14):** the preview background is an app setting —
  it lives in the frame around the preview and never in the SVG text, the
  sidecar or an export; the code dialog always shows the saved bytes.

<a id="i-18"></a>
* **I-18 (SVG cost, RULE 4):** a version's cost is either provider-reported or a
  labelled estimate; the two are never merged, never relabelled and never
  invented, and both survive a restart through the sidecar.

<a id="i-19"></a>
* **I-19 (SVG requests, RULE 6/24):** the per-request size is one value — the
  user's configured size, which no reasoning tier may shrink — and the panel,
  the confirmation and the runner compute it the same way; the confirmation
  lists every request (and its exact images) before anything is sent, and an
  unmappable plan is refused rather than partially sent.

<a id="i-20"></a>
* **I-20 (SVG runs, RULE 4/23):** one request's outcome — status, tokens, cost,
  error — is recorded and shown for that request only; a failed request never
  alters another request's files, usage or cost, and a request whose outcome
  is unknown (stall, disconnect, abort) is never resent — it is reported as
  unknown with its request id, kept in the in-flight journal and offered to the
  user for a deliberate retry. Liveness, never duration, decides when a request
  is over: only silence longer than the stall window counts as dead.

<a id="i-21"></a>
* **I-21 (SVG preview, RULE 3/24):** the preview never recolours the artwork:
  the inline stylesheet is layout only, the root colour is the document's own
  (or the UA default), and the frame's background and contrast outline stay
  outside the document.

<a id="i-30"></a>
* **I-30 (root picking, RULE 4/10):** the Generate SVG tab can always point
  itself at a folder — the picker is offered whether or not a root is loaded,
  because the Selection tab's handle is a fallback for the first run, not a
  lock — and each tab has exactly one picker control.

<a id="i-31"></a>
* **I-31 (SVG list, RULE 3/4):** a Generate SVG row is an **existing canonical
  AI output** whose path an approved decision names — never an invented `_AI`
  name, never a reference image, never a path that is not on disk. A source that
  fails this is excluded **with its reason** and reported (banner + audit + log);
  it is never silently dropped and never offered for generation. The judgement
  lives in one pure module (`svg/sourcelist.ts`), not inside the scan.

<a id="i-32"></a>
* **I-32 (identity, RULE 6/24):** one normalized AI path is one row, whatever
  the row index, the split folder or how many decision records name it; rows are
  ordered by normalized path, so a reload or a repeated rescan yields
  byte-identical rows, order and audit. N records naming one path are one row
  plus N−1 `duplicate` reports — the same file two split folders apart is two
  rows, because it is two files.

<a id="i-33"></a>
* **I-33 (audit, RULE 4):** every scan states the whole picture — files walked,
  AI sources on disk, references excluded, missing sources, duplicates removed
  and final unique rows — as one line in the source bar (`svg-audit`) and in the
  scan log (`svg.scan`, with the numbers as fields), so a list different from
  what the user expects can always be traced to a named reason. The exclusions
  and the audit are part of the snapshot key: a changed count is a changed scan.

<a id="i-34"></a>
* **I-34 (naming, RULE 3):** a source must be a **raster** image. This app's own
  output (`…_AI.svg`) and its versioned artifacts (`…_v1.svg`) are never sources
  and are never counted as AI sources in the audit — otherwise a second run
  would feed an artifact back into generation, and the counts would not add up.

<a id="i-53"></a>
* **I-53 — the generation queue (rewritten 2026-10-08).** Confirming a batch
  while a run is in flight APPENDS it; the run in flight is never interrupted
  and the button is never disabled by it. `refs.queue` is the synchronous
  authority and `refs.abort` (non-null) is what "a request is in flight" means,
  so a stale closure can never start two runs or lose a batch. The queue is
  session-only — nothing queued is ever sent after a restart — and Cancel stops
  the run AND drops the whole queue, saying how many batches that was. A
  waiting batch changes nothing about the files until its request really
  starts; the row only SAYS it is next: `SvgRow.queued` is derived from the
  queue every render (`withQueued`), never stored, so the badge reads a grey
  "Next attempt" (`.svg-badge.queued`) while the source waits and the row's own
  status is back the moment the batch is dropped — nothing to restore. A row's
  own Regenerate/Generate while a run is in flight is the NEXT attempt
  (`placement: "front"` → `regenerateNext` → `enqueueFront`): no dialog (the
  queue line and the badge are visible before it starts), first in the queue,
  and the same image leaves every later waiting batch (`dropIdFrom`, batches
  re-planned and re-labelled, an emptied batch goes) so one queue never
  generates it twice; the toast says "… — next attempt, first in the queue (N
  queued) · removed from N waiting batch(es)". Bulk Generate, bulk Regenerate,
  `G` and the recovery retry still confirm and append; bulk Regenerate first
  filters the checked ids to rows with an existing valid SVG, while the row's
  Regenerate remains the front-of-queue action above. Every run event carries the run's
  image total (`run-start.images`, `batch-start.images`, `batch-done.done /
  .images`) and a run id (`batch-start.runId` — batch ids repeat per run), so
  the log's request-done line reads "· d of m image(s) done".
  Design: `docs/archive/2026-10-08-svg-queue-keepalive/design.md`.

<a id="i-54"></a>
* **I-54 — the preferred version.** A pair file may carry `"preferred": n`
  beside its `versions[]` (`v` stays 2: the key is additive, and a reader that
  predates it simply ignores it). It names the version the row SHOWS — preview,
  Copy, Code, Approve/Decline, the list fields and the scan key all read it
  through `chosenVersion(versions, preferred)`; nothing is ever deleted, so
  every version stays re-choosable, and a nonsense or dangling number falls back
  to "nobody chose" (the newest valid version). It is written through
  `saveMetaAt` (tmp → verify → overwrite), off the undo timeline, and the
  version chooser refuses honestly when it cannot be written.

<a id="i-57"></a>
* **I-57 — the run outlives the tab (2026-10-08).** The Workbench mounts
  `SvgPanel` once and parks it `hidden` on every other tab
  (`data-testid="svg-shell"`, the same node across switches); the panel takes
  `active` and, on every RETURN to the tab, dispatches `repin` and rescans when
  nothing runs — never on the first mount, which scans anyway. The run's
  numbers follow the user: `SvgRunPopup` is portalled to `<body>` (a hidden
  ancestor would hide a fixed child) and says
  `totalsLine(withChain(runTotals(progress, queue), chain), running)` —
  "Generating · 7 done · 13 left · 1 failed · request 2 of 5" / "Done · 20 done
  · 0 left". One chain of runs is ONE count: a queued batch starts as its own
  run, so `drainQueue` resets `model.chain` with the first run of a chain and
  folds each finished run's outcomes in (`chainAdd`) when the next one starts —
  the run on screen is never counted twice. The final line stays until the ×
  dismisses it (keyed by `runId`); a new run brings the popup back. `runtotals.ts`
  is the one arithmetic behind the popup, the bulk bar and the log.

<a id="i-58"></a>
* **I-58 — the list never moves under the user (2026-10-08).** The visible
  order is PINNED: `model.order` (`pinOrder(previous, sortedIds(rows, sort))`)
  is refreshed only by a scan (`rows`), a sort change and `repin` (tab
  activation) — never by a run event (`rows-fn`) or a filter (the pin spans all
  rows, a filter only hides). A landing SVG updates its row in place; the date
  sort is applied once, deliberately, when the user comes back. Everything that
  appears or grows during a run — the batch strip and the queue, together the
  `RunRecord` (`svg-run-record`) — sits BELOW the list, so nothing inserted
  above it can push the "APPROVED SOURCES / SVG OUTPUT" header away.

<a id="i-64"></a>
* **I-64 (one icon, its own code, RULE 3/4/13 — 2026-10-09):** in the
  current-SVG regeneration every request carries exactly ONE icon: its composite
  is that icon's AI image, its text is the saved prompt, the icon-name line and
  the newest valid SVG file's text (`lib/svgregen.currentSvgPrompt`, built in
  `svg/regenprompt.ts`). The pair file records the prompt text, never the code.
  A stored choice that cannot run (no saved prompt picked, or the picked one is
  gone or blank) starts no request; the window and the run both say why. The
  drop-down lists the SVG prompt presets (`iconSplitter.svg.prompts.v1`), never
  the metadata presets (2026-10-09 move; the window is `svg/RegenSetting.tsx`).

<a id="i-65"></a>
* **I-65 (one preset rule for every prompt window, RULE 13/24 — 2026-10-09):**
  the metadata prompt and the Generate SVG prompt render the same window
  (`ui/PromptWindow`) with the same preset bar (`ui/PromptPresetBar`) and the
  same gestures (`ui/presetops`: pick, Quick load, Delete, Save as). Each list
  keeps its own key (`iconSplitter.upload.prompts.v1`, `iconSplitter.svg.prompts.v1`),
  so a preset never crosses between tabs. Delete never clears the editor; Save as
  stores a snapshot of exactly the text in the editor; a blank name is refused.

<a id="i-71"></a>
* **I-71 — the AI source's own versions (2026-10-16; numbered I-69 until
  2026-10-19, when the duplicate ID was found — I-69 is batch render identity).**
  A regenerated AI source
  NEVER overwrites the file it replaces: every result is a new file in the
  pair's subfolder `AI source regeneration versions` (`<stem>_AI_v1.png`,
  `_v2`… allocated from disk + the pair file, the same rule as SVG versions)
  and the pair file gains the additive keys `imageVersions[]` (version, file,
  status, prompt, model, error, timestamps) and `imagePreferred: n` — the same
  shape and reader tolerance as I-54 (`v` stays 2; an old reader ignores them).
  `imagePreferred` names the MAIN image and falls back to the original when
  null, dangling or failed; a failed request still appends an honest failed
  entry (its `file` is the path it would have had, never written) but never
  moves the pointer. Parsed and written through `lib/svgimgreg` + `saveMetaAt`
  (tmp → verify → overwrite); the chips that re-point it are off the undo
  timeline, like I-54's. Binding since the 2026-10-19 fix
  (`archive/2026-10-19-image-regen-fix`):
  * **The main image IS the source.** `svgimgreg.mainImageOf(meta, relPath)` is
    the one rule: the row's AI thumbnail shows it AND the SVG generation's
    contact sheet reads it (`buildComposite(root, sources, imageOf)` — the run
    and the confirm preview).
  * **Field ownership.** The image fields belong to the image writer
    (the run in `svg/imgactions`, the chips): every image-side write updates `refs.metas`
    (memory first, like `runbatch.persist`), and an SVG save takes the image
    fields from the latest in-memory copy (`withImagesOf`) — a regeneration is
    never dropped by an SVG save built from an older copy.
  * **Every pair, never a corrupt one.** A pair without a pair file gets one
    (`metaForSource`, I-41); an unreadable pair file is refused BEFORE anything
    is sent (I-43 — never overwritten).
  * **A visible, honest run.** One batch at a time; `imgRunning` names only
    sent, unresolved rows in a composite run (one writer), and the busy pill
    reads `Regenerating AI sources · done/total`. Single-source results are
    recorded as they land; composite results are reviewed first (I-72).
    Stop sends nothing new while sent requests finish, and a returned composite
    may still need Apply/Discard. Every failure is counted with its reason
    (router message, timeout, changed source or refused write), and the outcome
    names the first one. An image request waits `imageWaitMs` = max(stall
    window, 300 s) — an image arrives in one piece.

<a id="i-72"></a>
* **I-72 — an image-edit composite never merges pair identities (2026-10-19).**
  One immutable, user-previewed square reference and effective prompt per
  confirmed request; slots follow selected pair IDs in row-major order,
  with normalized cell rectangles and blank unused positions. A changed-size
  same-aspect-ratio response is split by those positions, never by current
  row sorting or visual guesses; a non-square, extra, absent or undecodable
  response cannot write an image. Multi-icon cells remain pending until an
  explicit result review, and each accepted cell passes I-71's unique-file,
  verified per-pair history and main-image rule. An unrelated/changed pair
  is skipped; cost and request ID stay at request granularity. Unknown sent
  requests and lost pending reviews survive as metadata-only notices and are
  never automatically resent.
