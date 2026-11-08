# Selection not remembered across a reload — root cause and fix (2026-11-08)

Report (third pass): in the Upload tabs, a new selection is not stored; after a
reload the **100 checks that the user had picked earlier** come back, and the
newer pick is never written. "As the user makes a new selection it should
immediately rewrite the stored state."

## What the research found

The old work assumed the bug was "the write is too late", so the fix was a
flush when `stockUpload.checked` changes. Reading the whole write path showed
the write itself was never the missing piece:

1. **One writer, one document.** `iconSplitter.session.v1` is written only by
   `state/useSessionAutosave.ts` (`sessionOf(getAppState())`), which reads the
   live store — there is no stale closure, no second owner and no restore that
   re-applies an older value. So a *single* page cannot resurrect an older
   selection.
2. **Therefore the resurrection came from another page.** The app is opened from
   `run_app.bat` / the loopback helper, i.e. a new browser **tab** every time,
   and older tabs stay open. Each of them holds its own copy of the store and
   writes the one snapshot. An idle tab that still had the 100 checks flushed
   them on its next notification (a scan finishing is enough), on `pagehide` or
   on `beforeunload` — after the newer page had already written. The last write
   won, and it was the old one. That is exactly "it keeps saving the 100 and
   never rewrites the new pick", and it is also why fixing the timing inside one
   tab changed nothing.
3. **A second, silent loss:** `writeKey` swallows every `setItem` failure
   (private mode, quota). A refused snapshot left the PREVIOUS document in
   storage with no report, so the reload restored the old selection.
4. **A third, silent wipe:** `pruneChecked` deleted every restored id when a
   rescan produced zero rows (unreadable folder, permission not granted yet) —
   the reload that restored the checks could empty them, and the empty state was
   then written.
5. **Debounce window:** only the stock slice flushed at the gesture; the SVG and
   "SVG to upload" slices waited 250 ms. A page killed or reloaded by the helper
   inside that window lost the gesture.

## Fix (TDD, `tests/session_selection_persist.test.tsx`)

- `lib/sessionorder.ts` (`isForeignNewerWrite`): a page may write only over a
  snapshot that is not newer than its own last **selection** change. Our own
  stamp never counts as foreign; a stamp from before this page opened is
  history; a stamp far ahead of the clock is not trusted. A skipped write is
  logged at `debug` (`session.kept-newer-snapshot`).
- `state/useSessionAutosave.ts`: any change to a selection slice (`upload`,
  `stockUpload`, `svg`, `builder`, `batch`, `v2`) writes in the same task;
  everything else keeps the 250 ms debounce; `pagehide`/`beforeunload`/unmount
  still flush, and a hidden tab (`visibilitychange`) flushes too, because a
  frozen or discarded tab may never see `pagehide`.
- `state/sessionstore.ts`: the write is read back and retried once; the caller
  reports `session.save-refused` at `error` when storage still refuses. Nothing
  is claimed as saved that is not in storage.
- `upload/rowmodel.pruneChecked`, `stockupload/useStockUpload`
  (`commitKnownSelection`), `svg/rowmodel.pruneChecked`: a scan that found
  nothing removes nothing — only a non-empty scan can name the ids that no
  longer exist.

## Witnessed failures before the fix

| Test | Before | After |
|---|---|---|
| a checkbox click is in storage with no timer advanced | `[]` | `[pair…]` |
| a 100-id stock pick replaced by a new one | old 100 kept (debounce window) | new pick |
| a snapshot another page stamped later | overwritten by the stale page | kept, logged |
| an empty rescan after a restore | checks wiped | checks kept |
| a `QuotaExceededError` on the write | silently lost | retried, reported |

## Not changed on purpose

- No multi-tab *live sync*: a stale page simply stops writing instead of
  catching up; its next reload reads the newest snapshot. Adopting the other
  page's selection would need value-equality guards to avoid a write loop and is
  not needed for the report.
- The Generate SVG tab keeps its own empty-scan rule only for the known-target
  set (undo validation); its selection is preserved exactly like the upload
  tabs'.

## Round 2 — the fix did not hold in the real app (same day)

The user re-tested the shipped fix with the exact repro (Deselect all → tick 2
rows → restart the page) and **the 100 checks came back**. Why the first round
was insufficient: it made *this* build write correctly, but the snapshot is one
document that *older* pages also write — and `run_app_ftp.bat` opens a new tab
on every run, so tabs of earlier builds accumulate. Any of them flushes the 100
checks it booted with, and the next reload reads them as the newest state. The
guard cannot help a page that does not have it yet.

Round 2 therefore removes the shared copy instead of policing it:

- The checked ids moved to their own document, `iconSplitter.selection.v1`
  (`lib/selectiondoc`, `state/selectionstore.ts`). Older builds have never heard
  of that key, so no older page can overwrite the newer pick.
- The session snapshot stores the selections **empty** (`clearSelectionOf`) and
  keeps the tab, sheets options and view filters. Its ids are still *read* while
  no selection document exists (an upgrade from an older build), and the
  autosave writes them into the new document on mount, so the snapshot stops
  being read from then on.
- Both documents keep the "no page resurrects a newer write" rule, each with its
  own stamp and its own last-change time.
- The reload now names itself: `session.restored` (`debug`) logs the build stamp,
  the tab, the number of restored rows and which document they came from, and the
  log dock head shows the build (`lib/buildstamp`) — a tab opened before a
  rebuild runs older code, and the report must be able to say so.

### Witnessed failures before round 2

| Test | Before | After |
|---|---|---|
| an older-build page flushes its 100 checks after the new pick | 100 restored | the 2-row pick restored |
| a check gesture writes the selection document | no document at all | `[pair…]` in the same task |
| the session snapshot after a pick | carries the checked ids | `upload.checked: []` |
| a first run over a legacy snapshot | ids dropped | ids migrated into the document |
| an existing document (other page, newer stamp) | overwritten | kept |
| the build stamp on a page without the meta | — | `dev` |
