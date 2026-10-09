# Root-path capture follow-up — same-leaf stale paths and reverse relationships

Date: 2026-10-09. This follow-up is separate from, and does not rewrite,
`archive/2026-10-09-root-path-glued-folders/design.md`.

## Report and reproduced failure

The `Full path` row still showed a deep `_split_output` path under
`test_processing_2`, while a `test_process_3` pick said the full path was not
captured. The same path bug appeared in **Generate SVG** and **SVG to upload**.
The folders can be the same tree at adjacent levels: choosing the parent or its
child must derive the same canonical path; an unrelated pick must not inherit a
same-leaf clipboard or stored path.

The regression-first run reproduced the gap: `resolve()` was consulted only as
`knownParent.resolve(pickedChild)`, the picker adopted a same-leaf clipboard
before using that evidence, and a miss did not clear the previous same-name
path. The late-capture path also identified a root by name, so another handle
with the same name could receive its path. Browser handles still do not disclose
arbitrary absolute paths; absent valid clipboard text or a verified relationship,
the only truthful answer is no path.

## Decisions

1. **Treat both directions as evidence.** For every known exact handle, ask both
   `known.resolve(picked)` and `picked.resolve(known)`. The latter lets a known
   descendant name a newly picked ancestor by removing only the verified number
   of trailing path segments. Use the nearest related handle. If equally near
   evidence yields different paths, return `ambiguous`, not a guess. `isSameEntry`
   (or object identity) also recognizes the exact same directory.
2. **Verified handles outrank text.** A derived path wins over stale clipboard
   text. Ambiguity fails closed. With no relationship, accept only an exact
   folder path that is not the app's still-current location copy and does not
   repeat the prior same-name path. An unverifiable pick clears that old path.
   The rejected text remains blocked for automatic Rescan; an explicit Ctrl+V
   remains a deliberate recovery action.
3. **Bind late capture and display to the active handle.** The path row and its
   paste listener receive the active `DirHandleLike`. A late capture names only
   that handle (or an `isSameEntry` alias), never every known root with the same
   leaf. When a handle is in the session registry, its exact path—including an
   empty path—takes precedence over the name-keyed persisted display value.
   Restored Batch roots join the shared registry too.
4. **Report capture truthfully without blocking useful scans.** The shared pick
   result has an explicit `pathCaptured` flag. Callers show an error when the
   root is usable but its full path was not verified; scanning the selected root
   remains independent of clipboard permission.
5. **Do not add a persistent store.** The existing root-path key remains the
   system of record; clipboard ownership/rejection markers and known handles are
   memory-only. No absolute path is newly persisted beyond the existing path
   contract.

## TDD acceptance set

- Known child → picked parent derives the exact parent path; known parent →
  picked child continues to derive the exact child path.
- Conflicting same-distance handle evidence is ambiguous; unrelated evidence is
  `none`.
- Stale same-leaf clipboard text loses to a verified handle relationship.
- An unrelated same-name pick clears an old path; Rescan cannot resurrect that
  rejected old text, while an explicit paste can capture it.
- An app-owned location copy is not treated as a fresh folder pick.
- Two same-name handles do not share late-capture attribution or path-row state.
- Both Generate SVG and SVG to upload display the derived child path, not the
  stale deep path.

## Verification notes

Before implementation the targeted red run showed the parent-derivation,
clipboard-priority, clearing, and both UI regressions failing. Keep the
project's full RULE 16 workflow in `docs/current/CODE_VERIFICATION.md`; record
final command results in the append-only quality ledger, not in this design.
