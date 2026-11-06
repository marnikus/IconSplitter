# Named Export settings presets — plan (2026-10-25)

## Contract

Add a preset manager to the GLOBAL Export settings popup: named Save current,
explicit Load, Rename and Remove (confirmed inline). Selecting a name alone
must not change export settings. Save/rename/remove manage a reusable catalog;
they do not modify defaults, rows, checks, applied decorations or source files.

Load replaces the global defaults via their existing validated write path.
Inherited rows follow immediately; existing local pins and applied decoration
choices stay intact. Loading never implies Apply as local, exports, paid calls
or enabling decorations on unchecked icons. All general fields (including format
flags, artboard/padding and SVG template), and global decoration dimensions are
saved. Decoration enabled flags retain the existing selected-only policy.
Use the existing Apply as local button after Load to freeze a checked batch.
The per-row popup keeps existing scope/reset behavior, without a preset catalog.

Presets survive popup closure, tab changes and browser reload in a separate
versioned localStorage key. Names trim to 1–60 characters, case-insensitively
unique; capped at50. Duplicate Save is rejected, never silently overwrites.
Rename must not overwrite another preset; Remove never changes current defaults.
Corrupt/foreign stored data is ignored, valid entries normalize through the
canonical settings validator; old entries missing format flags default on.
Storage failure is explicitly reported, never silently claimed as saved.

## Steps (TDD)

1. RED tests for pure parsing/name/catalog operations, snapshot isolation,
   legacy/default settings, corruption/bounds/duplicates, persistence/failure.
2. RED real-panel tests for Save/Load/Rename/Remove, explicit load, reopen/reload,
   format/padding/artboard restoration and local/inherited/decoration safety.
3. Implement typed pure preset rules and a verified local store; no dependencies,
   providers, file writes or changes to settings/history schemas.
4. Implement accessible preset controls with inline names, validation/status,
   destructive confirmation and no implicit loading; integrate global scope only.
5. Update owning current contract, selector/storage/source/test routes within
   page caps; append measured ledger entry unread.
6. Run focused tests, types, lint, changed-quality vs a5acedf, verify:fast/full;
   scoped attributed commit and push current branch.

Preset catalog edits and global defaults follow existing device-preference
semantics (not row history); Apply as local/Reset retain existing undo behavior.

## Completed verification

- Implemented separate validated catalog/store, global-only explicit controls,
  inline removal confirmation and verified-save status. No dependencies added.
- RED witnessed missing preset UI assertions before implementation; domain/store
  tests initially identified the missing module. Real browser-storage failure
  stubs exercise quota/denied readback without mocking src/lib algorithms.
- Focused final21 tests/5 files PASS (7 new domain/store/UI tests plus existing
  local-batch, formats and docs regressions). Real loaded-preset SVG/EPS dimensions,
  absent JPEG and unchanged approved source are asserted.
- Types PASS; lint0 errors/23 pre-existing warnings; changed-quality vs a5acedf
  PASS; verify:fast PASS; full verify PASS:2901 tests/277 files, native30/5,
  production single-file build. Coverage95.39/89.87/98.22/98.30 percent
  (statements/branches/functions/lines), no gate/scope relaxations.
- Existing inherited/pinned settings, checked/applied decorations, Apply as local
  and Undo remain intact. No live provider requests or generated artifacts shipped.
