# SVG to upload — current behaviour

See [upload invariants](invariants/upload.md), [upload selectors](../selectors/upload.md), [storage](STORAGE.md) and [tests](TESTS.md). The export package is local; only confirmed Gemini metadata generation sends its disclosed inputs.

## Scope and discovery

SVG to upload (adds to, never replaces, the rules above — and is the second
mode that makes a network call, only when the user confirms it, the same
opt-in class as Generate SVG → Requesty; design
`docs/archive/2026-10-06-svg-to-upload/design.md`):

* Discovery walks the root ignoring `export`, reads every `.svg.json` sidecar
  and lists ONE row per **item-approved** pair with ≥1 valid generated SVG on
  disk (I-78); the export source is the NEWEST valid version, regardless of a
  preview-only preferred-version choice. A declined or needs-review item cannot
  export an older previously approved version; legacy files without item-level
  review derive it from the newest decided version. Pairs without approval or
  valid artwork, without a sidecar, outside split scope and duplicates are
  reported with reasons, never listed. Export output never feeds discovery.
* List selection follows [Batch's RULE 25 gestures](../rules/BEHAVIOR.md#rule-25)
  (I-73). An active row opens its metadata detail but is not checked by a plain
  click; checkbox/modifier clicks change checks. Header toggles visible approved
  rows without losing hidden checks, Deselect all clears all. New rows start
  unchecked. Only approved valid SVG rows can be checked; there are no A/D
  review decisions or shortcuts on this tab. Checked rows drive local
  export/download or explicitly confirmed metadata requests (RULE 20), never
  automatic sends.
* In the Export settings popup, checked rows drive a local **Shadow** checkbox:
  apply/remove the template gradient below selected icons, with checked-only
  width/gap controls and a matching live export preview. The active unchecked
  row and provider confirmation are untouched; [settings](upload-settings.md)
  and [geometry](upload-geometry.md) own the detailed contract.
* An independent **Corner badge** checkbox in that popup places the supplied
  vector graphic on checked icons' final artboards. Corner, width and X/Y edge
  insets are configurable without changing icon fit; [badge](upload-badge.md)
  owns its checked-only/per-icon, preview and export contract.
* An independent **S/L size guide** checkbox repeats the finished icon smaller
  in one corner, with its supplied S and L letter outlines underneath; corner,
  both sizes, both stroke widths (px), the gap and X/Y edge insets are
  configurable. The [size guide](upload-sizeguide.md) owns the layout and
  failure contract.

## Navigate by operation

- [Settings and artboard](upload-settings.md) · [output geometry](upload-geometry.md) · [corner badge](upload-badge.md) · [size guide](upload-sizeguide.md)
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
* Undo: `uploadSettings` (`{ overrides: { [pairId]: Overrides | null }, applied?: { [pairId]: DecorationValues | null } }`
  before/after) and changed selection gestures both join the **same global**
  timeline; the bulk bar's Reset to inherited is one such entry for the whole
  selection. Selection restores checked ids/anchor/active as one entry, even
  across tab switches; validated apply with a failed step leaves the cursor
  unchanged. `src/upload/uploadundo.ts` applies settings live when mounted and
  writes the store directly when unmounted. Neither local files/downloads nor
  a confirmed paid metadata call can be undone.
