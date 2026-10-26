# Generate SVG — current behaviour

Confirmed Requesty calls are the narrow RULE 20 exception. Image-source editing has its [own behaviour page](svg-image-edits.md); see [invariants/svg.md](invariants/svg.md), [SVG selectors](../selectors/svg-generation.md), [storage](STORAGE.md) and [test owners](TESTS.md).

**Detail pages:** [results, preview, cost, review](svg-generation-results.md) · [task prompts and batch regeneration](svg-generation-prompts.md).

## Behaviour and request flow

Generate SVG (adds to, never replaces, the rules above; its confirmed
provider calls are the narrow RULE 20 exception, never part of local splitting):

* Discovery reuses the Selection scan and pairing, but a row is now
  **an approved AI OUTPUT that exists on disk** (2026-10-05, I-31): a file whose
  own name carries the canonical `_AI` form (`…_AI.png`, `…_AI_7.png`,
  `…_AI_9_01.png` — a raster image, never this app's `_AI.svg` output), named by
  an approved decision — by the pair's own `pair_<hash>` id, or by an approved
  record whose `ai_result` is exactly that path (ids drift when a file moves
  between `split_NN` folders; the recorded approval does not). **One normalized
  AI path is one row** (I-32), whatever the row index, the split folder or how
  many decision records name it, in deterministic path order. Everything else is
  reported instead of listed (`Discovery.excluded` + the `svg-warn-excluded`
  banner + the log): an approved pair whose AI image is gone (`ai-missing`), a
  record with nothing left on disk (`no-files`), a record naming a reference
  image (`not-ai-output`), an approved pair of only this app's own SVG
  (`artifact`), and a second record for a path already claimed (`duplicate`) —
  the first record naming a path is that row's approval, so N records for one
  path yield one row and N−1 duplicates. A listed row that needs attention keeps
  its per-file status (`svg-problem-*` — a missing reference or an unreadable
  file never removes a row, I-22); `Discovery.unreadable` names the files that
  could not be read this scan; `Discovery.problems` counts the listed ones.
  Owned `_AI_vN.png` image regenerations are not new sources or references
  only in their immediate `AI source regeneration versions` parent (or picked
  root); they remain in the file index for direct `imageVersions` access, and
  `audit.files` still counts every file walked. A corrupt decision file warns
  and keeps the in-memory decisions.
* Generation: the editable prompt (stored locally, resettable to the
  documented default) is sent with the approved AI images as a data-URL
  `image_url` part, and the answer is **streamed** (`stream: true` +
  `stream_options: {include_usage: true}`) so the connection carries bytes
  while the model thinks. Images per request (1..9, default 4) is exactly what
  the user configured: the reasoning level never caps it (2026-10-05 — 8 images
  at 4 are two requests of 4 at low, medium, high and xhigh alike), so a larger
  selection is split into `ceil(images / configured)` API requests, each sent
  on its own (`lib/svgconfig.clampImagesPerRequest`; the panel, the
  confirmation and the runner all compute the same number). Each request's
  images are combined into ONE square PNG contact sheet —
  `columns = ceil(sqrt(n))` cells, equal squares, aspect preserved, centred,
  padded, unused cells empty — with an ordered "position — name" manifest in
  the prompt. The response is split into numbered SVG blocks and matched by
  **name AND SVG title**, never by appearance; duplicate/missing/unknown/
  out-of-range positions are reported, never guessed, and empty cells never
  produce output. A plan that cannot be mapped is refused before a byte is
  sent (`lib/svgbatch.validateBatchPlan`, fail-closed).
* List selection follows [Batch's RULE 25 gestures](../rules/BEHAVIOR.md#rule-25)
  (I-73): a plain row click only activates/anchors, while checkbox/modifier
  clicks change checks; a tri-state header toggles visible checks only and
  Deselect all clears hidden checks. New rows start unchecked; checks and
  active/anchor changes are one undoable gesture. Only approved existing AI
  outputs can be checked (I-31); a check is **not consent to send**. Paid runs
  still preview the exact ordered sources/inputs and require explicit
  confirmation before any provider request (RULE 20, I-19).
* Bulk selection actions (2026-10-09): **Generate selected** remains the
  existing all-checked-rows path, including rows with no SVG. **Regenerate
  selected (N)** is separate and selection-only: `N` counts checked rows with
  `row.newest !== null`; the action filters again against the current rows and
  the confirmation contains only those eligible rows. Checked rows without a
  valid generated SVG never enter that batch. The shared confirmation says
  "Confirm SVG regeneration"; both actions keep the existing validation,
  versioned-save and confirmation gates.
* [Run controls and completion sound](svg-parallel-runs.md) (I-53/I-57):
  independent jobs coexist; source conflicts wait/refuse. The request-strip
  **Skip current request** continues the batch; full Cancel remains separate.
* [Task prompts and batch regeneration](svg-generation-prompts.md) (I-74…I-77):
  the selection chooses a remembered task prompt; the connection's request size
  and frozen current SVG codes govern a confirmed regeneration.
* Confirmation (nothing is sent by opening it): the selected count, the
  **total request count** and the configured per-request size, the
  provider/model, the sampling settings, the streaming fact and the effective
  stall window, plus one page
  per request showing that request's own contact sheet, its ordered
  `position — name` manifest, its grid size and the empty cells of a partial
  last request. Pages are built in memory as they are first shown and cached
  for the dialog's lifetime; the last partial page keeps its square cells.
* The selection is an ORDER, and the sheet is that order (2026-10-07): the icon
  order is the order the user picked, decided in ONE place
  (`lib/selectionorder.inIdOrder`) and read from it by the confirmation's plan
  (`runplan.planOf`), the dialog's own pick list, the queue's label and the
  runner's sources (`runjobs`) — so the contact sheet the dialog
  draws is the sheet the request carries, cell for cell, whatever order the list
  happens to be sorted in. A cached page is identified by the sheet's own
  content (`lib/svgcomposite.compositeSheetKey`: page label + every source with
  its fingerprint), never by the page label alone: both single-icon plans are
  called `batch_1_1`, and a label-only cache showed the first icon the dialog
  ever built while the request carried the second. The dialog is also modal in
  the keyboard layer: while one is open only Escape acts, so no list shortcut
  (`g` especially) can silently re-plan what it is about to send.
* Per-request outcome: every request records its own status, saved/failed/
  missing counts, tokens, cost and (on failure) its redacted reason, folded
  into one run summary and shown in the run strip — the request in flight
  plus one line per finished request — which stays visible after the run
  ends. A request that got no answer is named in the run's summary line
  ("… · 1 request failed · …"), never folded into the per-image counters. A
  failed request never touches another request's files, usage or cost; a
  failure whose outcome is unknown is **never** retried and its message names
  the tier, the request id and the fact that nothing was resent.
* Waits (2026-10-05): there is **no total-duration timeout anywhere**. The
  configured value (seconds, 5–900, default 120, `svg-timeout`) is the **stall
  window**: the longest silence tolerated *between* bytes. Every read — a
  delta, a `: keepalive` comment, the usage chunk or `[DONE]` — resets it, so a
  live request may run for hours. The window is raised to the selected tier's
  floor — low 120 s, medium 300 s, high/xhigh 600 s
  (`lib/effortlimits.effectiveStallMs`) — because a stalled socket behind a
  60 s proxy must be seen by the proxy first; the card's limits line and the
  confirmation state the window that will really be used ("600s stall (high
  floor)"). The retries setting (0–5, default 2) applies only to failures the
  provider CONFIRMED (HTTP status, SSE `error` payload): a stall, an abort or a
  provider-side 408/504 is never repeated automatically, because the upstream
  may still be generating and billing it. A request that ends without `[DONE]`
  is reported as *outcome unknown* with its request id, and the in-flight
  journal (`iconSplitter.svg.inflight.v1`, `src/svg/journal.ts`) keeps that
  fact across a restart: the rows come back as **Unknown** with the id and the
  elapsed time, and the panel offers an explicit "Retry these" through the
  normal confirmation — never an automatic resend.
