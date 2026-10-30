# Getty web upload — metadata/timestamp repair sweep (2026-10-30)

Historical design note (RULE 17). Current contract lives in
[`docs/current/sor/stock-upload-getty-web.md`](../../../current/sor/stock-upload-getty-web.md).

## Reported problem

A run hands its JPEG/EPS pairs to Getty's own uploader, then applies the Date
Created/"timestamp" and the accepted title/description per contribution and
presses Save metadata. Observed failures:

1. Getty's metadata drawer sometimes paints only its MUI **loading skeletons**
   (`[data-cy="metadata-skeleton"]`, `.MuiSkeleton-root`) and never unlocks.
   The helper waited out its editor timeout, skipped that file, and moved on to
   the **next** file — the drawer's fields (Date Created included) never existed,
   so nothing was typed and nothing was saved for that contribution.
2. A page reload is the recovery that clears a half-rendered drawer, but the run
   only reloaded on the *Ready to submit* ladder — and after such a reload it
   re-pressed a grid-wide save without re-typing any drawer. Files earlier in the
   batch therefore stayed without a timestamp or with unapplied metadata, and the
   run continued from where it stopped instead of from the beginning.
3. A file whose Date Created was not applied was not detected at all: the fill
   step reported "present/typed", never the drawer's own value afterwards.

## Decision

* The drawer step reports three states: **ready**, **locked** (fields exist but
  disabled) and **skeleton** (nothing but placeholders). A skeleton drawer is not
  waited out to the full editor timeout.
* A drawer that stays on its skeleton stops the pass **immediately** (it never
  moves to the next file), reloads the page, and restarts the walk from the
  **first** contribution.
* The fill step returns the drawer's own values after typing, so a run can prove
  the Date Created actually took; a file whose date did not take is repaired in
  the next pass instead of being reported as finished.
* The repair sweep (`sweepMetadata`) walks every contribution of the batch from
  the beginning, applies today's Date Created (and the accepted text when there
  is any) and saves. It **skips only contributions without a picture** (no bytes
  arrived — nothing can be opened) and contributions Getty rejected.
* The readiness ladder's `reload` step now runs the same sweep instead of a bare
  grid-wide save, so a reloaded page is always re-filled from file 0.
* Bounded: at most two restarts per call; anything left unresolved is named in
  the failure reason.
