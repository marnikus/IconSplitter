# Four-point batch context

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## The four-point batch (2026-10-08, `four-point`)

* **Tags dedupe silently** (point 1): see the metadata policy above — one
  `dedupeTags` in `lib/upload/meta.ts` feeds BOTH `parseMetadata` and the tags
  edit path, so a pasted list with repeats becomes one clean list before the
  policy ever looks at it.
* **EPS 10 after the SVG is optimized** (point 2): the EPS stage runs on the
  CLEANED/optimized export SVG and writes an **EPS 10 /
  Illustrator-10-compatible** document — `%!PS-Adobe-3.0 EPSF-3.0`, the DSC
  order `%%Creator` → `%%Title` (the `${stem}.eps` name, DSC-escaped) →
  `%%CreationDate` (the run's clock) → `%%BoundingBox` (integer) →
  `%%HiResBoundingBox` (exact points) → `%%DocumentData: Clean7Bit` →
  `%%LanguageLevel: 3`, then EndComments/Prolog/Setup sections, the uprighting
  CTM (`[a b c d tx ty] concat` — ONE array, I-61) and `%%EOF`. `verifyEps`
  requires those three markers AND an executable program, so a file that lost
  them, or one the interpreter would stop in, is `partial`, never shipped.
* **Global selection actions** (points 3 + 4; bulk regeneration added
  2026-10-09), all acting on checked rows:
  * `upload-meta-selected` ("✦ Generate metadata (N)") — N counts selected
    icons with NO metadata text yet (a draft is not re-requested); existing text
    is never paid for again by this action. At N = 0 the line says why nothing
    was sent.
  * `upload-meta-regenerate-selected` ("↻ Regenerate metadata (N)") — N counts
    only selected rows whose `row.meta.metadata !== null`; disabled at 0. The
    confirmation and previews contain only those rows, even in a mixed
    selection. A returned answer replaces the existing text and is a draft
    until the user accepts it; a provider failure keeps the previous text.
    Empty rows remain solely under Generate metadata.
  * `upload-export-selected` ("⇪ Export selected") — metadata first, then the
    WHOLE selection: the confirmation (`#upload-meta-title` "…, then export N",
    the note `upload-meta-then-export`) opens, each answer that passes the
    policy is accepted as it lands, and after the batch every selected icon is
    exported. An icon that already had metadata is exported, never re-charged;
    a policy-breaking answer stays a draft and that icon exports without it.
    With nothing to generate the export starts immediately. Needing metadata
    with no key is refused up front, naming the missing API key.
* **The batch → export handoff** (RULE 24): `acceptNow` records the accepted
  state in the run's own `MetaRunCtx.accepted` map, and `runExportBatch` prefers
  that map over re-reading `latest.current` — a `dispatch` is not visible in the
  rows until React re-renders, so reading them back exported the first icon
  WITHOUT its metadata. Never re-read `latest.current` for state the current
  task just dispatched.
