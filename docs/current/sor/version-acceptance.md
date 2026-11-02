# Version selection accepts the version used by later work

The small AI-source/SVG version controls are **acceptance controls**, not preview-only switches (2026-10-25). Merely loading a folder, drawing a default preview, or opening version history never approves anything.

## AI-source image

Clicking an original/history image chip saves the pair's `imagePreferred` and source `decision: approved` with a review timestamp in **one verified pair-file write**. Null explicitly chooses the original. `mainImageOf` supplies that same accepted image to the thumbnail, image-edit reference and SVG-generation composite; an older selected image must not silently become the newest generated image.

Only completed saved image versions are selectable. Unknown/failed versions, corrupt pair records and missing/unreadable/empty image files are refused without changing the source or approval. Acceptance preserves the full image/SVG histories, SVG preferred pointer and independent SVG review. **Accepting an AI image does not approve an existing SVG.** Newly generated results retain their existing confirmed Apply policy.

## SVG

Clicking a valid SVG chip or the history dialog's **Use this version** saves `preferred` and item `review: approved` together. The already-displayed/default version can also be accepted; it is not ignored just because it is shown. A version already explicitly selected and approved need not be saved again. The tooltip states that the choice uses **and approves** it; the history tile marks the accepted choice.

The selected version drives preview, Copy/Code and current-SVG regeneration through `chosenVersion`/`previewTargetOf`. SVG to upload/export now also honours that explicit version instead of always choosing the highest version number. Export still requires item approval; a stored preference alone never bypasses a pending/declined/needs-review status. No usable stored preference means the legacy newest-valid-on-disk fallback. When a preference names a valid generated version but its file is missing/unreadable, discovery reports it and excludes the item rather than exporting different artwork.

One item-level review status and its legacy per-version mirrors remain intact (I-78); there are no competing per-version review states. Explicit version acceptance is the exception to the old rule that version choice never changes approval. New generations retain the existing pending/needs-review rules; nothing here approves unseen future results. Source files and version histories are never overwritten/deleted by selection.

## SVGs already in the folder are registered as versions

The tab lists what its own runs wrote, because that is what the pair file holds. An SVG
made earlier — by an older build, another tool, a hand edit — sat beside the AI image and
stayed invisible: the row said "not generated" and the work had to be redone. **⤓ Register
existing SVGs (N)** in the bulk bar (`svg-register-existing`, 2026-11-01) closes that gap for
**every selected folder** in one pass:

- The files that belong to the pair are read from the folder: `<stem>.svg`, `<stem>_vN.svg`
  and a copy/rename of the stem (`-copy`, ` (1)`, `.v2`). The names the pair had **before a
  split** count too, so `download-icon-01_AI.svg` beside `download-icon-01_AI_01.png` is
  found (`src/lib/svgimport.ts`). A name that two pairs in one folder both answer to is
  refused, so the longer name wins and no pair steals another's file.
- A version number comes from the name where the name carries one; a file without one takes
  the next free number, so nothing on disk is invisible and nothing is counted twice. Files
  the pair file already records are skipped, so a second click adds nothing.
- Each document passes the same validation gate a generated one does. A record is written
  only for a file that validates — same shape as a generation (`status: generated`,
  `provider: "existing file"`) — and an unreadable or invalid file is **counted, skipped and
  said out loud**, never recorded.
- The pair's own `<stem>.svg.json` is written once through the usual verified path. The item's
  review status is put back afterwards: registering a FILE is not a review decision, so an
  approval, a decline or `needs-review` survives it, and a fresh item stays `pending`.
- The **newest readable version becomes `preferred`** — the row shows it, Copy/Code read it and
  later work uses it, exactly as if the user had accepted it with a version chip. History is
  not touched: every version stays listed and re-choosable.
- When nothing is registered the line **names the pair** (`No existing SVG for
  download-icon-01_AI_01 in 1 selected folder`) and any other SVG it saw, with the file named,
  so a silent no-op is impossible.
- A pair another process holds (a run, an export) is refused with the usual busy message, and
  a failed write says so and changes no row. Nothing on disk is renamed or deleted.

Regressions: `svg_register_existing` (names, numbering, dedupe, the summary line),
`svg_register_existing_ui` (one file, several versions, an approval kept, an invalid file
skipped, a busy pair refused, and a real click in the panel).

## Safety and scope

Both choices hold the existing source lease and start from current metadata, preserving concurrent field ownership. Pointer/approval changes enter memory/UI only after the pair-file save succeeds. Busy sources, unavailable files and failed saves produce an error, never a success/approval claim. Choices send no provider request, do not check or activate another row, and do not invoke review auto-next.

Version choices remain off the undo timeline as before; existing explicit review actions keep their current history behaviour. No new storage key/schema is introduced: `preferred`, `imagePreferred`, `decision`, `reviewedAt` and `review` remain in each pair's own file.

## Owners and verification

- SVG acceptance: `src/svg/codeactions.ts`; chips/history: `SvgThumbs.tsx`, `VersionsDialog.tsx`.
- AI acceptance: `src/svg/imagechoice.ts`, called by `imgactions.ts`; actual input rule: `src/lib/svgimgreg.ts::mainImageOf`.
- Export identity: `src/upload/discovery.ts`.
- Existing-SVG registration: `src/lib/svgimport.ts` (pure plan), `src/svg/registerexisting.ts` (read, validate, write), button in `SvgBulkBar.tsx`.
- Regressions: `svg_version_chips`, `svg_versions_ui`, `svg_imagechoice`, `svg_imgreg_ui`, `svg_register_existing`, `svg_register_existing_ui`, `upload_discovery` and `upload_runexport` tests. The real export pipeline checks that accepted older artwork, not a newer file beside it, is committed.

See [SVG results/review](svg-generation-results.md), [image edits](svg-image-edits.md), [Upload discovery](upload.md#scope-and-discovery), [I-54](invariants/svg-run.md#i-54) and [I-71](invariants/svg-image-edits.md#i-71).
