# Root-path identity fix

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## The Full path that glued two folders together (2026-10-09, I-59)

Report (SVG to upload, two screenshots): the user picked
`F:\…\single\test_process_3`; the list was right, but the `Full path` row
read `F:\…\single\test_processing_2\_split_output\2026-10\<run>\<piece>\split_03\export\test_process_3`,
and every "copy folder path" made from the new root inherited the wrong prefix
(I-56 builds the copy from the remembered root path).

Measured cause: the clipboard still held the app's **own** last copy — the
export folder of the previous root — and the picker's "parent + name"
completion appended the new folder's name to it. The known-root derivation
(I-51) could not overrule it, because the known root's `resolve()` answered
`null` (a sibling tree) and that definite "no" was read as "cannot say"; the
guess had already been stored, keyed by the folder's name; and `Rescan`
re-read only for an **empty** path, so the one button the row names could not
repair it. One root cause: a guess was treated as a capture.

The first fix (I-59 as first written): the app's own copy is never completed;
a known root vetoes a completion its `resolve()` rules out; `Rescan`
reconsiders a `completed` path. **Not enough** — second report the same day:
picking `…\\test_process_3\\_split_output` showed `<the glued guess>\\_split_output`.
The stored guess for `test_process_3` had survived (it was storage, not code),
the upload tab restored that folder at boot as a known root, and the
derivation (I-51) — trusted as exact — built on it. A guess that can become a
base for an exact-looking path is not a flag, it is a lie waiting for a child.

The second fix (I-59 as it stands): **no completion at all** — exact leaf or
nothing; a stored `completed` record reads as no path (the poison purges
itself on read); derivation starts only from an exact capture; a capture that
arrives later (`Rescan`, `Ctrl+V`) names the known handle so the next child
pick is exact. Removed with it: `knownroots.provenOutside`,
`copypath.lastCopiedByApp`, `pickroot.believable`, the `completed — check it`
row state and toast. No new control, no new storage key.
Design: `archive/2026-10-09-root-path-glued-folders/design.md` (§5 follow-up).

### Third report the same evening — and the root cause (I-63)

**Not fixed.** The user re-picked `single\test_process_3\_split_output` (its
exact path on the clipboard) and the row kept showing the glued path; picking
`test_process_3` itself raised *full path not captured* although it is the same
root one level up — *"it is the same root and only one level down or up so it
should not change anything or raise a error"*. Re-read with that lens the two
symptoms are one bug: the memory was keyed by folder NAME, so the frozen glue
served every `_split_output` (report 1: it stayed glued), while the `test_process_3`
slot — holding a guess — read as unknown for the parent pick (report 2: a false
alarm). Boot re-seeding, a stale pre-dialog clipboard re-freezing glue as
`copied`, and `pathFromCopied`'s exact-leaf-only (it could see `…\test_process_3`
was one level inside the picked `test_process_3` and refused anyway) were the
three amplifiers; the name key was the root cause. No string rule can survive a
store that cannot tell two folders apart.

What this build does instead (I-59 rewritten, I-51/I-35/I-52 amended, I-63 new):
the path is bound to the picked folder's **handle** and persisted with it
(IDB `iconSplitter/rootpaths`, `isSameEntry` identity); the v1 name-keyed key is
never read; a copied path names the folder when its leaf is the folder **or**
the folder is the leaf's parent (one level down/up is the same root and is
exact, `how: derived`); derivation runs in both directions from a handle the
app already placed (`resolve` down, `picked.resolve(known)` up, both tails
verified); `pathForPick` re-reads the clipboard after the dialog whenever the
pre-dialog text did not match (the stale-text trap); a pick that cannot be
named binds nothing for that handle — a name-same's path can never stand in.
One regression for each report is in `tests/pickroot.test.ts`
("the third report (2026-10-09)"), `tests/folderbar.test.tsx` and
`tests/upload_ui.test.tsx`.
Design: `archive/2026-10-09-root-path-identity/DESIGN.md`.
