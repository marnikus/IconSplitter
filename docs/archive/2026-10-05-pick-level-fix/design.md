# Pick-level equivalence + the full path row (bug-1, bug-2)

Date: 2026-10-05. TDD: the regression tests in §7 were written first and fail
on the current code for exactly the mechanisms in §2.

## 1. The reports

**Bug-1.** Picking `…\test_processing_2\_split_output` or
`…\_split_output\2026-10\2026-10-05_18-45-20` lists **0 items** in Selection
and Generate SVG; picking `…\_split_output\2026-10` works. Expectation: all
three levels list the same run (recursive search).

**Bug-2.** The full folder path is not displayed after a folder is chosen.

## 2. Root causes (each proved before any fix)

**Bug-1a — picking the split output lists nothing (both tabs).**
`scopeOf()` returns true when the picked folder IS the split dir, and then
`splitPairs()`/`selectRows()` keep only pairs whose root-relative path carries
a split segment. Relative to the picked output there is no such segment, so
every pair lands in `outside` — 0 listed. Reproduced pure
(`tests/splitscope.test.ts`) and through both real panels
(`tests/folder_ui.test.tsx`).

**Bug-1b — approvals do not travel across pick levels (SVG rows, Selection
decisions).** A pair file stores its id and both faces' paths relative to the
root that was picked when it was written. Picking deeper/shallower re-frames
every scanned id and path, so neither the exact-id nor the ai-path match in
`decide()` can hit: 0 SVG rows, and Selection decisions shown as pending.
Reproduced: V2 lists 2 items from the stamp (the scan is innocent) while SVG
lists 0 from the same fixture (only the matching differs).

**On "Selection shows 0 from the stamp".** Case analysis over the current code
proves the Selection *items* path cannot show 0 from the stamp while the month
works: a stamp the month lists can only hide its pairs via a nested split dir,
and that dir would scope the month pick too. What the user most likely saw is
the SVG-side 0 (bug-1b), a decision-filtered view (whose approvals bug-1b also
explains — fixed by the same rebase), or an empty stamp. The suite pins the
stamp/month/output items at 2 each, so no fix may regress them.

**Bug-2 — three compounding causes.** (1) The app runs from `dist/index.html`
over `file://` (`run_app.bat`, no server): `clipboard.readText()` is
blocked/denied there, so the pick-time capture silently yields "none" and the
row falls back to the leaf. A paste event needs no permission, so capturing
from a paste works where the read cannot. (2) Both path rows set
`white-space: nowrap` + `text-overflow: ellipsis` — a captured long path is
truncated, not displayed. (3) Nothing tells the user to copy the folder first.

## 3. The fixes

**F1 — the picked output is reviewed whole (I-38 kept, I-45).**
`scopeOf()` no longer scopes when the picked folder itself IS the split dir;
both call sites (`selection/rootsource.ts` for V1+V2, `svg/sources.ts`) are
fixed by that one line. A batch root still narrows — including the empty-output
edge, pinned by a test — because I-38's "input is not reviewable" stands.
`scopeText()` takes the root name and states `Scope: this split output` for a
split-output pick, since "no split output found" would lie there.

**F2 — a pair file is re-seated onto the picked root (I-46).**
New pure `rebasePairMeta(meta, fileRelPath)` in `lib/pairmeta.ts` (the shape's
owner, RULE 10): the id comes from the file's seat
(`pairIdOfMetaPath`, falling back to the content's base/suffix in the file's
dir — never the stale stored id, which is useless-or-equal in every case);
`dirPath`, both faces' `relPath` and every version's `svgPath` are re-seated
beside the file (the app always writes the SVG beside the pair —
`saveversion.ts`). Names, fingerprints, the decision and the audit fields are
untouched; an empty `svgPath` and a name-only face stay as they are (RULE 13).
Applied once, in `pairstore.loadMetaAt` (the lowest load boundary), so every
consumer — Selection decisions, SVG `decide()`, version previews, undo
locators — is fixed uniformly, and the undo/reload flows save back the
current frame. Same-level reads are a byte-identical no-op. The legacy global file
stays root-bound (it has no seat to rebase from): the pair file is the portable
truth, which strengthens I-43.

**F3 — paste captures the path the clipboard read could not (I-47).**
New `usePastePathCapture(rootName, say)` in `src/ui/` (next to the other path
UI helpers): on a window `paste` whose target is not a text field
(`hotkeys.isTextField`, RULE 10), it adopts the text through the existing
`adoptCopiedText` (match + save + never invent, I-35/I-39), stays quiet when
nothing moved, and otherwise says `pickMessage(info, "paste")`. `pickMessage`
is narrowed to `{ path, how }` and gains the gesture word, so the paste toast
mirrors the pick toast ("Full path taken from your paste: …" /
"…completed from the pasted folder: … — check it"). Wired into
`SelectionV2Panel` (`v.core.say`) and `SvgPanel` (`say` newly exposed on
`SvgGenApi`, following the existing `SvgCtx[…]` picks — the raw dispatch must
not be used, `useSay` owns the auto-clear). Only the active tab is mounted
(`Workbench`), so exactly one listener lives and completion cannot cross-talk.
The path rows wrap (`overflow-wrap: anywhere`, no ellipsis) so a captured path
is fully visible, and a leaf-only row gains the hint `Full path not captured —
copy the folder in Explorer (Ctrl+Shift+C), then paste (Ctrl+V).`
(`v2-path-hint` / `svg-path-hint`, one shared `.pathhint` style.)

## 4. Invariants (appended to SYSTEM_OF_RECORD §5)

* **I-45 (pick-level equivalence, RULE 4):** the split output, its month folder
  and its stamp folder list the same run; a split-output pick states `Scope:
  this split output`.
* **I-46 (pair files rebase onto the picked root, RULE 3/24):** a pair file's
  stored identity and root-relative paths are re-derived from where the file
  sits at load, so decisions and SVG versions match at any pick level.
* **I-47 (paste capture, RULE 2/9/24):** when the clipboard read gave nothing,
  pasting the folder's path adopts it (same match/save/never-invent rules),
  says so once, and the row shows it immediately; a leaf-only row hints at the
  gesture.

## 5. Rejected alternatives

* **Narrow only when the split dir holds pairs ("evidence scope").** Breaks the
  empty-output batch root: unsplit input would list as reviewable, violating
  I-38. Rejected; the batch-root behaviour is pinned instead.
* **Exempt month/stamp-named roots ("name sniffing").** The only world needing
  it (a nested split dir inside the stamp) contradicts the report — it would
  scope the month pick too (§2). Cleverness without evidence; rejected.
* **Fuzzy/suffix approval matching across levels.** Two stamps can hold the
  same relative path for different bytes — suffix matching would apply the
  wrong approval. The file's seat is exact; fuzz is rejected.
* **A second pick/paste control.** I-44/RULE 10: one folder action. The capture
  is a silent listener, not a control.

## 6. RULE 16/18 pre-check

New functions: `rebasePairMeta` (~20 lines, 2 params, CC ~6),
`usePastePathCapture` (~20, 2 params, CC ~5), the shared `PathHint` (~6),
`say` exposure (1 line + 1 type line). Edited: `scopeOf` (1 line),
`scopeText` (+1 branch, 2nd optional param), `loadMetaAt` (+1 call),
`pickMessage` (narrowed param + `via` default — existing callers identical),
two `PathRow`s (hint split-out), two CSS rules (wrap), one CSS rule (hint).
The gate counts a touched file over 300 lines as a failure, so the change
splits by responsibility instead of squeezing: the pair-file reader moves to
`lib/pairfile.ts` (97 lines) and the merge to `lib/pairmerge.ts` (70), leaving
`pairmeta.ts` at 225 and `pairstore.ts` at 257; `saveversion.ts` drops its
private join in favour of the lib helper. No file over the ideals.

## 7. Tests (written first; RED verified 2026-10-05)

17 fail on the current code, each for its §2 mechanism; 9 new controls/guards
pass (stamp/month V2 items, empty-output narrowing, scope-text default,
clipboard-voiced default, field/non-path paste guards, re-pick updates).

| File | New tests |
|---|---|
| `tests/splitscope.test.ts` | root-IS-output unscoped (updated contract), end-to-end pieces listed, empty-output batch root still narrows |
| `tests/pairmeta.test.ts` | rebase identity/paths/faces, version svg paths, renamed-file content fallback, empty guards, same-level no-op |
| `tests/pairstore.test.ts` | cross-level file loads re-seated (meta + record) |
| `tests/folder_ui.test.tsx` | V2 × 4 (output/stamp/month items, approvals travel on re-pick), SVG × 3, paste capture × 2 (+hint), field/non-path guards, re-pick × 2 |
| `tests/pickroot.test.ts` | `pickMessage` paste wording (copied/completed) |

Docs updated in the same change (RULE 17): `SYSTEM_OF_RECORD.md` (I-45…I-47,
§14, the scope wording), `UI_SELECTORS.md` (the hint handles),
`docs/README.md` (this archive row), `QUALITY_RECHECK.md` (the dated entry).
