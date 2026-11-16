# Selecting a version accepts the actual version — 2026-10-25

## User request and diagnosis
The small AI-image and SVG version controls must select the accepted version used by subsequent work, not merely display it. User requested understanding, a written plan/steps, then implementation.

- SVG chips/history save `preferred` only; a selected pending/needs-review SVG stays unapproved. Clicking the already-shown chip is ignored, and the history chooser disables that version.
- Upload discovery explicitly ignores `preferred` and always chooses the highest-numbered valid SVG, so an older selected version is not the exported artwork.
- AI-image chips already save `imagePreferred` and actual generation reads `mainImageOf`; however the choice does not explicitly accept the AI source, and the writer does not validate that the requested version is a completed, available saved image.

## Intended contract
1. Selecting a valid SVG version (chip or history Use) persists that `preferred` version AND the item's `approved` SVG review in one verified pair-file save. All versions remain in history; item-level status/mirrors remain the existing single-status model, not competing per-version approvals.
2. Selecting the already-displayed/default SVG must also work as acceptance. Merely opening history, displaying a default or reading a preview must never approve anything.
3. Upload/export uses the explicitly selected approved version, not the numerically newest one. With no usable preference, preserve legacy newest-valid-on-disk fallback. A valid explicit selection whose file is unavailable must not silently export different artwork; omit/report that source.
4. AI image selection accepts that image as the actual source: save `imagePreferred` and the pair's source `decision: approved`/review time together. Keep SVG review separate: choosing an image does NOT approve an existing SVG. Original/null remains a valid explicit source choice; failed/unknown image versions and missing/unreadable files are refused before changing state.
5. Both writers retain source leases, current metadata field ownership and verified save-first semantics: invalid choices, busy sources, corrupt metadata or failed saves must not claim approval or move pointers. No source media/history overwrite or deletion, no provider request, no surprise row/check/anchor changes or auto-advance from a version choice.
6. Keep current explicit regeneration/paid-confirmation, generation re-review, multi-row review/history and storage schema. Version choices remain off the undo timeline as before; this request does not add a partial undo that restores review but not the chosen version.

## Steps (written before implementation)
1. Add/witness failing regressions for SVG older/current choice approval, persisted reload and export identity; AI explicit acceptance, original/reselection, invalid/missing choices and unchanged SVG approval.
2. Wire the existing SVG version-choice owner to atomic choice+approval; permit acceptance of the shown chip/history tile and explain the approval action in labels/tooltips/toasts.
3. Validate and persist AI source acceptance through its existing guarded main-image writer, preserving actual source readers and unrelated metadata.
4. Fix export discovery to respect the approved explicit SVG selection, retaining safe legacy fallback and honest missing-file exclusions.
5. Update current behaviour/invariants/selectors for the deliberately changed preview-only contract. Run focused tests, types, lint, changed-quality, fast/full verification, append measured quality evidence, scoped attributed commit and push the fixed session branch.

## Evidence
Completed all five steps. The SVG chooser writes preference + approval together, including reselecting the displayed version; history marks an accepted tile. The guarded AI chooser now lives in `src/svg/imagechoice.ts` and validates completed/readable image choices before accepting the source decision. Upload honours the chosen approved SVG; a missing/unreadable selected file is excluded instead of substituted. The real export pipeline regression confirms older accepted artwork is committed and both source files remain untouched.

- Genuine initial RED: **7 failed / 59 passed**, 4 files, covering chip/history acceptance, AI source acceptance and selected export identity (`/home/user/accepted-version-selection/red.log`). Existing preview-only/always-newest assertions were deliberately updated to the user's revised contract, not deleted.
- Additional focused RED exposed a stale-row SVG review after AI acceptance; switching the updated row through `withMeta` keeps live review/history fields consistent. That run also caught an unreadable-file fixture using the write-failure fake; corrected to the real read-failure fake (`LockedFile`). No production error guard was weakened (`consistency-red.log`).
- Initial docs routing caught the Upload test-owner page at **9020 bytes**. Shortened its outdated description into a current contract link; now **8959 bytes**, with the 9000-byte cap unchanged.
- Final focused run: **196 tests / 9 files PASS**, including docs navigation, saved/reloaded choices, old/default/reselected SVG approval, current metadata preservation, actual older-artwork export, invalid/missing/unreadable/empty images, corrupt records, failed saves, leases, independent source/SVG review and legacy fallback (`focused.log`). Separate final docs check **4/1 PASS** (`docs.log`).
- Types, lint (**0 errors / 22 existing warnings**) and changed-quality vs **be6edb3** PASS. Seven changed/new production files checked (pairmeta is a comment-only contract correction); functions remain inside gates. The history artwork loader was extracted by responsibility to avoid growing the tile's complexity.
- `npm run verify:fast -- --base be6edb3`: **ALL LANES PASSED**, tests/coverage **2942 / 278**, build PASS.
- `npm run verify -- --base be6edb3`: **ALL LANES PASSED**, first full run. Native uninstrumented **30 tests / 5 files**, coverage suite **2942 / 278**, production build PASS. Statements/branches/functions/lines **95.40 / 89.90 / 98.22 / 98.30%**; full coverage lane **95.5 s**, native lane **3.9 s**. Logs retained outside the repo in `/home/user/accepted-version-selection/`.
- No storage schema, provider, dependency, harness, test-isolation, threshold, native budget or pixel/export algorithm changes. Existing generated `dist/` and `node_modules/` noise remain unstaged. No real provider generation was requested during development.
