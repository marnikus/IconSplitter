# Generate SVG — design (2026-10-01)

A fifth Workbench tab that turns **approved** Selection results into SVG files,
using Requesty's OpenAI-compatible chat endpoint. It never replaces the
Selection workflow: it *consumes* its decisions, so a pair that nobody approved
is never sent anywhere. Everything runs in the browser; the only network call is
the model request the user explicitly triggers with their own key.

TDD, and the RULE 16 budget on every new file (fn ≤ 30 LOC, ≤ 4 params via prop
objects, complexity ≤ 10, nesting ≤ 4, files ≤ 300 lines — the SVG files are
small on purpose).

## Layering — one tab, three layers

| Layer | Lives in | Rule |
|---|---|---|
| pure rules (no DOM, no fs) | `src/lib/svg*.ts` | unit-tested in isolation, no happy-dom needed |
| IO + state | `src/svg/*.ts` (`scan`, `sources`, `sidecar`, `saveversion`, `runner`, `reviewact`, `statemodel`, `ctx`, `actions`) | fakefs/fake-dir helpers; the runner is the only writer |
| UI | `src/svg/Svg*.tsx` | props objects only (never >4 positional params) |

`src/lib/` holds every decision that must be *explainable*: prompt text,
response parsing, SVG validation, batch layout, usage arithmetic, error
classification. The IO layer only orchestrates them against the file system, so
a bad response costs one failure record, not a write.

## Discovery — approved pairs only

`src/svg/sources.ts`

```
discoverApprovedSources(root) -> { sources, lost, skipped, corrupt }
sourceIdOf(dirPath, stem)      -> `pair_<hash>`   // the SAME id Selection uses
```

The scan walks the root recursively, pairs `*.png` (Original) with
`*_AI.png` (AI) exactly like Selection does, reads the decision file, and keeps
only `approved` pairs. Key decisions:

* **identity is the pair id**, never a row index — filters and sorts cannot
  reattach a decision to the wrong file.
* deterministic path order, so two scans produce the same batch plan.
* an approved pair whose AI image vanished is reported as
  "lost their AI image" (not silently dropped); unreadable files are
  "skipped"; a corrupt decision file warns and keeps in-memory decisions.
* the root handle is remembered under `__svg__` and falls back to the
  Selection handle, so a restart does not re-ask for a folder.

## Batching — one contact sheet per request

`src/lib/svgbatch.ts`, `svgcomposite.ts`, `svgcanvas.ts`, `src/svg/composite.ts`

```
gridSize(count)            -> { cols, rows }   // cols = ceil(sqrt(n)) — square-ish
planBatches(sources, n)    -> BatchPlan[]      // deterministic, n = images/request
compositeLayout(count)     -> { cell, cols, rows, cells: CellRect[] }  // pure geometry
renderComposite(layout, images, bg) -> HTMLCanvasElement              // canvas only
```

* N approved images (1..9, default 4) become **one** square PNG: equal square
  cells, aspect preserved, centred, padded, unused cells left empty.
* The prompt carries an ordered manifest ("position — name"), and the response
  is split by name **and** SVG `<title>` — never by the order SVGs appear in
  the text (`svgextract.ts`). Duplicate, missing, unknown and out-of-range
  positions are reported as such; an empty cell can never produce output.
* The composite is shown in the UI (`svg-batch-composite`) so a user can see
  what was actually sent.

## Response handling — match, then validate, then write

`src/lib/svgextract.ts`, `svgvalidate.ts`, `svgicons.ts`, `svgfile.ts`,
`svgrequest.ts`

* `validateSvg` requires well-formed XML, exactly one `<svg>` root, a valid
  `viewBox` (or documented `width`/`height`), **visible geometry**, and rejects
  scripts, event handlers, `javascript:`/data-URI executable payloads and
  unsafe external URLs.
* `countIcons` reports how many icon `<g>` groups a result contains (the
  expected count is 4) — an under- or over-count is reported, not "fixed".
* `readUsage`/`readRequestId`/`readRetryAfterMs`/`classifyHttp`/
  `classifyTransport` turn provider behaviour into one `Failure` vocabulary:
  `auth`, `rate_limit` (with retry-after), `model`, `malformed`, `provider`,
  `network`, `timeout`, `aborted`, `payload`. A missing number is `null` and
  renders as "—"; nothing is invented.
* Tokens are shown as reported; a **batch** total is split across the batch's
  images by `allocateUsage` and labelled estimated (`svgusage.ts`).

## Files and versioning — never overwrite

`src/lib/svgfile.ts`, `src/svg/saveversion.ts`, `sidecar.ts`

```
svgFileName(stem, v)   -> `<stem>.svg` | `<stem>_v2.svg` | `<stem>_v3.svg` …
nextVersion(stem, files, sidecar) -> first free version from DISK + sidecar
```

* One SVG per source, beside that source's `*_AI.png`, sharing the base name.
* Regeneration allocates the **next free** version from the union of what is on
  disk and what the sidecar lists, so a hand-created `_v9.svg` is never
  clobbered.
* The newest **valid** version is previewed; every version stays reachable via
  the history dialog.
* Sidecar `<stem>.svg.json` per source — no global SVG decision file. Write
  order is tmp → verify → overwrite → cleanup; a missing sidecar means
  "pending"; a corrupt sidecar warns and never destroys the SVG files.
* Each version records: source path + fingerprint, SVG path + version,
  generation status, review status, the exact prompt, provider + model,
  request/completion timestamps, input/output/total tokens, provider-reported
  cost + currency, the validation result, and a **redacted** error.

## Runner and review

`src/svg/runner.ts`, `runstate.ts`, `reviewact.ts`, `reviewundo.ts`

* `runGeneration` is the only writer: validate → allocate version → write SVG →
  write sidecar. An invalid response stores a failure record and **no** SVG
  file, leaving the previous valid version exactly where it was.
* Cancellation stops unsent requests and keeps completed results. A restart
  marks an interrupted request `interrupted`/unknown and never resubmits
  blindly.
* Review decisions (pending → approved/declined) apply through the same
  sidecar and go through the **global** undo timeline: one history entry per
  gesture, undoable from any tab (`bindSvgReviewApplier`). The SVG tab is the
  second applier on that bus after Selection.
* The API key is never in the entry: `keystore.ts` puts it in IndexedDB
  `secrets`, `svgsecret.ts` masks and redacts it everywhere it could leak
  (RULE 20).

## Negative tests that shaped the design

* invalid SVG response → no file written, previous version intact, row shows
  the failure with a redacted reason.
* duplicate/missing/unknown positions in a batch → reported per position, no
  guessing.
* response arrives but the AI image was deleted mid-run → failure record, no
  orphan SVG.
* two regenerations in a row → `_v2`, `_v3`; a manual `_v9.svg` is respected.
* corrupt sidecar → warning banner, SVG files untouched, review starts pending.
* restart with a running request → `interrupted`, never auto-resubmitted.
* save failure → the validated SVG stays recoverable in memory and the error
  names the file.
