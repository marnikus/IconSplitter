# Root-path identity — third report (2026-10-09)

The path bug returned a third time. This is the root-cause analysis and the
redesign that removes the whole class, in the user's own words:

> user selecting path like `F:\Stocks 2026\icons testing\single\test_process_3\_split_output`
> but selected full path stay `F:\Stocks 2026\icons testing\single\test_processing_2\_split_output\2026-10\2026-10-08_18-46-23\icon-bank-institution_AI_10\split_03\export\test_process_3\_split_output`
>
> also raise error if select diff folder — *Full path `test_process_3` — full
> path not captured…* — but it same root so it only one level down or up and it
> should not change anything. (same problem for Generate SVG and SVG to upload tabs)

## Root cause — the memory is keyed by NAME, folders are not

`iconSplitter.rootpaths.v1` stored `{ [folderName]: path }`. The File System
Access API reveals only a picked folder's **name**, so every store write and
read went through that name. But this workload creates same-named folders all
the time (`_split_output`, `export`, `split_03`, `2026-10`, `test_process_3`,
…) — the name is not an identity. Four failure mechanisms fed each other:

1. **Frozen glue survives as `copied`.** The I-59 rewrite killed stored
   `{ how: "completed" }` guesses, but the pre-I-59 derivation had already
   re-saved `<guess>\_split_output` with `how: "copied"` (`pathForPick` saved
   derived paths labelled `copied`). Indistinguishable from a real Explorer
   copy, it read back as truth forever — that record is literally the string
   the user sees "stay" in the row.
2. **Name-same leakage.** The row (`loadRootPathInfo(name)`) shows the pooled
   value for ANY folder with that name. Picking
   `single\test_process_3\_split_output` shows whichever `_split_output` wrote
   the slot last — never mind which folder is on screen. A failed capture
   leaves the stale value in place: "the selected full path STAYS".
3. **Name-seeded derivation compounds the lie.** Every tab's boot did
   `rememberKnownRoot(handle, loadRootPath(handle.name))` — a name guess
   became a `resolve()`-capable derivation base. Picking `_split_output`
   inside `test_process_3` derived `<name-guess>\_split_output` and saved it
   again as `copied`. The poison regenerates itself.
4. **Exact-or-nothing was too exact for the user's real workflow.** The user
   copies one folder in Explorer (`…\test_process_3\_split_output`) and picks
   its parent (`test_process_3`) — "same root, one level down". The
   leaf-equality rule refused it → "full path not captured" (their second
   quote). Derivation only worked DOWNWARD (`known.resolve(pick)`), so a pick
   one level ABOVE a known folder also answered nothing.

## Design — the path is bound to the folder, not to its name

* **Session truth is handle-bound** (`lib/knownroots`, moved from `ui/`):
  `rememberKnownRoot(handle, path, how)` / `boundRootPathInfo(handle)` match
  by handle identity (`===` / `isSameEntry`), never by name. Two folders named
  `_split_output` cannot see each other's paths. A fresh pick with no evidence
  binds `""` — the row honestly says *full path not captured* (the user asked
  for exactly this when selecting a different folder).
* **Persistence travels with the handle** (`lib/rootstore`, IndexedDB
  `rootpaths` records `{ handle, path, how }`, looked up by `isSameEntry`).
  Boot restores the path that was captured FOR THAT folder. The name-keyed
  `iconSplitter.rootpaths.v1` is no longer read or written: a value that
  cannot be told apart from an old guess is corrupt-by-uncertainty (RULE 13)
  and reads as no memory at all. One Ctrl+Shift+C per folder re-seeds it,
  and it then survives restarts with the handle.
* **Clipboard matching understands one level of structure** (`pathFromCopied`):
  the copied path's leaf IS the picked name (`how: "copied"`), or the copied
  path's PARENT leaf is the picked name — the copy is one level down inside
  the folder (`how: "derived"`). Appending a picked name to a copied folder is
  still forbidden — that completion IS the glue (`…\export` + `test_process_3`).
* **Derivation works in both directions through `resolve()`** (handle truth,
  never text): a pick below a known folder joins the segments (as before); a
  pick ABOVE a known folder strips the segments `pick.resolve(known)` reports
  from the known path — `test_process_3\_split_output` known at
  `…\single\test_process_3\_split_output` places its parent exactly at
  `…\single\test_process_3`. A tail that does not match strips nothing.
* **The pick re-reads the clipboard after the dialog when the pre-dialog read
  names something else** (it used to trust any non-empty stale text — another
  way a glued clipboard value got adopted over the user's fresh copy).
* Copies (`copypath`), the row (`ui/FolderBar`) and the recovery channels
  (`ui/rootcapture`) all read the handle binding — the same one truth.

Residual honest limits (by design, I-59): a copied folder that is neither the
pick, nor one level inside it, nor reachable via `resolve()` from a known
folder is adopted as NOTHING — the row says so and names the two ways out.
