# SVG to upload — current behaviour

See [upload invariants](invariants/upload.md), [upload selectors](../selectors/upload.md), [storage](STORAGE.md) and [tests](TESTS.md). The export package is local; only confirmed Gemini metadata generation sends its disclosed inputs.

## Scope and discovery

SVG to upload (adds to, never replaces, the rules above — and is the second
mode that makes a network call, only when the user confirms it, the same
opt-in class as Generate SVG → Requesty; design
`docs/archive/2026-10-06-svg-to-upload/design.md`):

* Discovery walks the root ignoring `export`, reads every `.svg.json` sidecar
  and lists ONE row per pair with ≥1 valid approved SVG version; the export
  source is the NEWEST approved valid version. Pairs without an approved valid
  SVG, without a sidecar, outside the split scope and duplicates are reported
  in a banner with their reasons, never listed. Export output is never a
  discovery source (no export loops).

## Navigate by operation

- [Settings, artboard and geometry](upload-settings.md)
- [Metadata generation, validation and confirmation](upload-metadata.md)
- [Clean SVG, JPEG and atomic export](upload-export.md)
- [EPS conversion and stroke expansion](upload-eps.md)

## Restart and UI state

* Restart precedence (P2.6 — the two interruption models reconciled): there are
  TWO independent memories of work that did not finish, and they never silently
  disagree. **Disk wins on scan**: `export.json` beside the outputs is the
  authority — a record that says `processed` is shown as processed even when a
  stale in-memory state says otherwise, because the package really is on disk.
  **Memory wins within a session** and only for what disk cannot know: the
  in-flight journal (`…upload.journal.v1`, a metadata request whose outcome is
  unknown) and the job store (`…upload.jobs.v1`, a run that was `queued`/`running`
  at close / crash). Both are read at assembly; a row with no committed record
  shows `interrupted`, never a quiet `discovered`, and the restore note is
  emitted exactly ONCE per page load (StrictMode's double-invoke included), so
  a remount cannot re-report or re-send. A run marks itself `queued` → `running`
  before it starts and writes its terminal state after the commit, which is why
  a crash mid-run can be reported honestly instead of guessed.
* Row layout (2026-10-07 UI fix): the row detail is TEXT ONLY — the committed
  artifact is not rendered inline (a 3886 px JPEG in the detail was the "huge
  icon below"; that preview is deferred). What replaced it is the LOCATION
  action: it copies the pair's export folder path with the same shared code the
  Generate SVG tab's Location uses (`lib/copypath` → `folderCopyText`), naming
  the committed artifact when there is one and the planned package path before
  the first export. The reference's tool block is honoured too: the global
  Export settings button sits in the bulk bar beside the zoom controls, and the
  Gemini card is one contained grid (Model, Endpoint on its own full-width row,
  Timeout, Retries, Parallel, then the check row) so no control can overlap or
  leave its box.
* Undo: one new entry type `uploadSettings` (`{ overrides: { [pairId]: Overrides
  | null } }` before/after) on the shared global timeline; the apply path lives
  in `src/upload/uploadundo.ts` (a mounted panel applies live; unmounted
  writes the store directly).
