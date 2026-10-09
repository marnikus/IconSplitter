# The Full path that survived three fixes — a name is not a folder (I-63)

Date: 2026-10-09 (third report of the same class; the first two are
`docs/archive/2026-10-09-root-path-glued-folders/design.md`).

> **Failure A** — previous folder `F:\Stocks 2026\icons testing\single\
> test_processing_2\_split_output\2026-10\…\split_03\export`; the user picks
> `F:\Stocks 2026\icons testing\single\test_process_3` (its child
> `_split_output` is the working set); the row shows
> `<OLD FULL PATH>\test_process_3\_split_output` with **no** warning, while
> "Scanning approved SVGs…" runs. Every "copy folder path" inherits it.
>
> **Failure B** — the row shows `test_process_3` with *full path not captured*
> although the pick shares a root with a folder the app already named and
> differs by ONE level, up or down.

Both are the same defect, and it is why three code-only fixes did not move what
the user sees: **the string on screen comes from storage, and the storage is
keyed by folder NAME.**

## 1. Measured causes (each one a line of today's code)

| # | Cause | Where |
|---|---|---|
| RC1 | The memory is `{ [folderName]: { path, how } }`. `_split_output`, `export`, `2026-10`, `split_03` recur all over this app's own output tree, so ONE entry serves many different folders, and no read ever asks whether the value belongs to the handle on screen | `lib/rootpath` `ROOT_PATH_KEY`; `ui/FolderBar.useRootPath(rootName)` |
| RC2 | A pick that captures nothing writes nothing, so the stale same-name value stays and is displayed as this folder's path — silent, no warning (breaks I-46 "the row never lies") | `ui/pickroot.pathForPick` → nothing; the row reads on |
| RC3 | A **derived** path is written back as `how: "copied"`, so the next derivation trusts it as an exact capture. I-59 forbade a *guess* as a base; a derivation from a wrong base is not flagged, so the poison multiplies (`<old>\test_process_3` → `<old>\test_process_3\_split_output`) | `pickroot.pathForPick` → `saveRootPathInfo(handle.name, derived)` |
| RC4 | A wrong stored value is **immortal**: `retryCapture` returns early while a path exists, and nothing else can clear or replace one. The only button the row names cannot repair it | `ui/rootcapture.retryCapture` |
| RC5 | Only the DESCENDANT direction is derived (`known.resolve(picked)`). `picked.resolve(known)` (the pick is an ancestor → trim) and `isSameEntry` (the same folder again) are never asked — Failure B | `ui/knownroots.deriveRootPath` |
| RC6 | No pick generation token: a slow derivation from an earlier pick writes after a newer pick landed | `ui/pickroot.pathForPick` |
| RC7 | The boot restore is copied three times, each one seeding the registry from the name-keyed value — the exact step that turns a stale value into a derivation base | `selection/rootsource.rememberRestored`, `svg/scan.bootSources`, `upload/scan.bootRoot` |

## 2. Decision (I-63 — the handle is the key)

**A folder's full path is known only when the app can prove it for THAT
handle.** The proof is one of four things, and nothing else exists:

1. `isSameEntry(handle)` against a recorded capture → the recorded path;
2. `record.handle.resolve(handle)` → segments down → `join(record.path, segs)`;
3. `handle.resolve(record.handle)` → segments up → `trim(record.path, n)`;
4. the clipboard text whose leaf **is** `handle.name`, at pick / `Rescan` /
   `Ctrl+V` time (the only source from outside the app, exactly as before).

Consequences, one per cause:

* **D1 — records are keyed by handle, in IndexedDB next to the handles
  themselves** (`iconSplitter` DB, `handles` store, key `__rootpaths__`,
  `{ handle, path, at }[]`). Handles are structured-cloneable, so a capture
  survives a reload and is still identity-comparable to the handle a tab
  restores. A name is display text, never a key (RC1).
* **D2 — the legacy name-keyed map is purged on load and never read.**
  `iconSplitter.rootpaths.v1` values cannot be attributed to a handle, so they
  cannot be trusted; keeping them would keep Failure A alive on every machine
  that already has one (RC1/RC2/RC4). The row then says *full path not
  captured* and names the one action that fills it in — honest, and one
  `Ctrl+Shift+C` per tree names everything below it (D3).
* **D3 — derivation is both directions and never stored.** `lib/fsrelate`
  answers `same` / `below` / `above` / `unproven`; `lib/pathmemory.pathFor`
  searches the records **newest-first** (the list is stored newest-first and no
  tie-break by path length or depth is applied — every record is an exact
  capture, so recency is the only honest order; a length tie-break made the
  newest capture lose to an older, longer one) and computes the answer. Only an
  EXACT capture becomes a record, so a derived value can never be a base and
  RC3 has nothing to multiply. Trimming that would cut into the drive or the
  UNC share yields no proof rather than a shorter guess (RC5).
* **D4 — a capture replaces the record for its handle.** Newest exact capture
  wins for that handle and only for that handle, so a wrong value is bounded to
  one folder and is repairable by `Ctrl+V` (RC4).
* **D5 — one pick generation token.** A superseded pick still reports what it
  found but never writes over the newer pick's capture (RC6).
* **D6 — one boot helper** (`pickroot.restoredRoot`) warms the memory for the
  restored handle, so the row is right on the first paint; the three copies of
  "remember the restored folder" are gone (RC7).
* **D7 — the row and the copy read the same proof.** `copyFolderText` takes the
  folder (`{ name, handle }`) and joins onto `pathFor(handle)`, falling back to
  the name — so a copy can never name a folder the row is not showing (I-56's
  "they can never disagree", extended to the root itself).

`PathHow` is `"copied"` (an exact capture, the only stored kind) or
`"derived"` (computed now from a recorded relative). The row shows both the
same way: both are proofs.

## 3. Owner files

`src/lib/fsrelate.ts` (new — the platform's answer about two handles),
`src/lib/pathmemory.ts` (new — the durable capture store + the proof search),
`src/lib/rootpath.ts` (string rules only, `folderCopyText(base, rel)` now a
pure join, legacy purge), `src/lib/clipboardpath.ts` (handle-based adoption),
`src/lib/copypath.ts`, `src/ui/pickroot.ts` (settle order, token, `restoredRoot`),
`src/ui/rootcapture.ts`, `src/ui/FolderBar.tsx`, the four panels' rows and the
five copy call sites. `src/ui/knownroots.ts` is **deleted** — its registry is
`pathmemory`'s record list and its derivation is `pathFor`.

## 4. TDD steps (all red first)

1. `tests/fsrelate.test.ts` — `same` by identity and by `isSameEntry`; `below`
   with its segments; `above` with the reverse segments; `unproven` for a
   sibling, for a handle with no `resolve`, for a throw, for an inert handle.
2. `tests/pathmemory.test.ts` — a capture is found for the SAME handle and for
   a handle picked in another session (`isSameEntry`); a child derives down; a
   PARENT derives up by trimming; a sibling tree derives nothing; a same-NAMED
   folder in another tree derives nothing (Failure A); the newest capture wins
   for its handle; a derived answer is never stored; records survive a reload
   through the store; an inert/foreign handle yields no path; the legacy
   name-keyed map is purged and never read.
3. `tests/rootpath.test.ts` — `joinSegments`, `trimSegments` (including the
   drive/UNC floor), `folderCopyText(base, rel)` as a pure join.
4. `tests/pickroot.test.ts` — the reported Failure A end to end at unit level:
   old export folder known, sibling pick, empty clipboard → `""` and the toast
   names `Ctrl+Shift+C`; a pick ONE LEVEL UP from a known folder is exact
   (Failure B); the same folder picked again is exact; a superseded pick writes
   nothing.
5. `tests/rootcapture.test.ts` — `Rescan` re-reads for an unknown OR derived
   path and never for an exact capture; `Ctrl+V` replaces the record of its own
   handle only.
6. `tests/folderbar.test.tsx` — the row shows the proof for its handle, the
   folder name + *full path not captured* when there is none, and never the
   path of a same-named folder.
7. `tests/upload_ui.test.tsx` / `tests/svg_ui.test.tsx` /
   `tests/selectionv2_ui.test.tsx` — both reports end to end in the tabs they
   came from: the stale same-name path never appears, the child pick derives,
   the parent pick derives, and the copy names the folder the row shows.

## 5. What the user loses, stated plainly

Every path captured by an older build is dropped (D2): the row will say *full
path not captured* once per tree until the user copies a folder in Explorer
again. That is the price of never showing a path the app cannot prove, and the
derivation makes it a one-time cost per tree rather than per folder.

## 6. As built (2026-10-09)

All seven TDD steps are in, plus the tests that had to follow the owners they
exercise: `tests/clipboardpath.test.ts`, `tests/copypath.test.ts`,
`tests/selection_scan.test.ts`, `tests/svg_io.test.ts`,
`tests/selection_ui.test.tsx`, `tests/svg_location.test.tsx` and
`tests/upload_ui.test.tsx` / `tests/svg_ui.test.tsx` now seed a capture with
`pathmemory.rememberPath(handle, path)` and read it back with `pathFor(handle)`
— the name-keyed helpers they used (`loadRootPath`, `saveRootPathInfo`,
`deriveRootPath`, `clearKnownRoots`) are gone with `ui/knownroots`. Shared test
double: `tests/helpers/pathmem.freshPathMemory()` (an in-memory store that keeps
handle identity, as IndexedDB does).

Two things the build settled against the draft above:

* `pathFor` iterates the records **newest-first** with no depth/length
  tie-break (see D3) — the tie-break made the newest capture lose to an older,
  longer one.
* `retryCapture` no longer stops at "a path exists"; it stops only when the
  path is a **capture** (`how === "copied"`), so a derived answer can still be
  upgraded by a real `Ctrl+Shift+C` (RC4).

Gates: `npm run verify` — Types, Lint, Quality (RULE 16, all changed files),
Tests + coverage (144 files / 1652 tests; `src/lib` 98.0% lines, the new
modules 98–100%), Build — all pass.
