# AI-source image-edit invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition. Split from [SVG invariants](svg.md).

<a id="i-71"></a>
* **I-71 — the AI source's own versions (2026-10-16; numbered I-69 until
  2026-10-19, when the duplicate ID was found — I-69 is batch render identity).**
  A regenerated AI source
  NEVER overwrites the file it replaces: every result is a new file in the
  pair's subfolder `AI source regeneration versions` (`<stem>_AI_v1.png`,
  `_v2`… allocated from disk + the pair file, the same rule as SVG versions)
  and the pair file gains the additive keys `imageVersions[]` (version, file,
  status, prompt, model, error, timestamps, and since 2026-10-19 `usage` +
  `cost` in the SVG shapes — a composite cell stores its `allocateUsage`
  share, an estimate unless it was alone; the image endpoint reports tokens
  but no cost, so the share is priced from the Sunburst rate card — the whole
  image's cost ÷ its icons, **Estimated**; a stored entry with tokens but basis
  `none` is priced the same way on read) and `imagePreferred: n` — the same
  shape and reader tolerance as I-54 (`v` stays 2; an old reader ignores them).
  `imagePreferred` names the MAIN image and falls back to the original when
  null, dangling or failed; a failed request still appends an honest failed
  entry (its `file` is the path it would have had, never written) but never
  moves the pointer. Discovery alone omits exact app-owned positive `_AI_vN.png`
  files from the immediate version folder (or that folder as picked root), not
  the folder or other lookalikes; the history and main-image readers still use
  the stored file path directly. Parsed and written through `lib/svgimgreg` + `saveMetaAt`
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
    The independent Batch-style image bar follows the user across tabs and
    counts processed/saved/failed/discarded separately. Stop sends nothing new
    while sent requests finish under the confirmed Apply policy. Every failure is counted with its reason
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
  response cannot write an image. Multi-icon cells default to manual result
  review; an explicit, persisted automatic-Apply opt-in is frozen at confirmation
  and accepts positional crops without a popup, not automatic identity detection.
  Both policies pass the same stale-source/root/pair checks. Each accepted cell
  passes I-71's unique-file,
  verified per-pair history and main-image rule. An unrelated/changed pair
  is skipped; cost and request ID stay at request granularity. Unknown sent
  requests and lost pending reviews survive as metadata-only notices and are
  never automatically resent.
