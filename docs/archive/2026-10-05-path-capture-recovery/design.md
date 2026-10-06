# Capturing the picked folder's path — and what to do when the first try fails

Date: 2026-10-05. Report (with a screenshot of the folder bar):

> work, but stil unable to capture full path of folder user choose. fix

The screenshot shows the state the row is in:

```
Open folder   Rescan   Scope: split output only
FULL PATH  _split_output   full path not captured
```

The list is right (the previous task's fix), but the path never arrived, and the
row says only *that* it did not.

## 1. Where the path can possibly come from (measured facts, unchanged)

| Source | What it gives | Verdict |
|---|---|---|
| `showDirectoryPicker()` result | `kind` + `name` only — no drive, no parents, by design (anti-fingerprinting) | never a path |
| `File` from `handle.getFile()` | `name`, `size`, `lastModified`; `path` is empty | never a path |
| `<input webkitdirectory>` / folder drop | `webkitRelativePath` **inside** the picked folder | never a path |
| `chrome.fileSystem.getDisplayPath` | Chrome-Apps-only, removed | gone |
| `navigator.clipboard.readText()` | Explorer's *Copy as path* (Ctrl+Shift+C) — the one honest source | **the source** |
| `parent.resolve(child)` | the segments from a folder the app already named down to the pick | the second source (I-51) |
| a `paste` event | the same clipboard text, delivered by the browser on the user's own keystroke | **the fallback channel** |

So the capture can fail for exactly four reasons, and today all four look the
same on screen (nothing):

1. the clipboard holds a **copied folder item** (plain Ctrl+C in Explorer — the
   shell puts a *file object*, not text, on the clipboard), so the read returns
   a bare name;
2. the browser **blocked the read** — the `clipboard-read` permission was
   denied, the document was not focused, or the page runs in an iframe whose
   `allow` list omits `clipboard-read` (the preview case);
3. the user **copied the path after picking** (the normal order is the opposite);
4. **nothing had been copied at all**.

## 2. The design

### I-52 — a capture is a conversation, not a single attempt

The pick stays the primary capture (read before the dialog — the click's
activation is freshest — and once after it if the first read was empty). What is
new is that a failed capture now leaves three things behind:

1. **a way to act**: `Rescan` (the existing button, unchanged in the toolbar)
   re-attempts one capture for the *current* root when its path is still
   unknown. No dialog, one click.
2. **a channel that always works**: a `paste` anywhere outside a text field
   adopts the text for the visible root **when its leaf is exactly the root's
   own name** (`how: "copied"`). A paste event needs no permission and is
   allowed in iframes, so this is the recovery path when the browser blocks
   `navigator.clipboard`. The row updates live (RULE 24) because the writer
   notifies the same subscribers (I-36).
3. **a truthful, actionable row** (RULE 12/4): the note next to the name names
   both ways out — `full path not captured — press Ctrl+Shift+C in Explorer,
   then Rescan (or Ctrl+V here)` — and the toast says which one applies
   (`the browser blocked the clipboard: … press Ctrl+V here`). The whole
   sentence is in the row's `title` too, so a long path never hides it. The row
   cannot know whether the browser will allow the read, so it offers both.

### What is never done (RULE 13/4)

* No path is ever invented: outside the picker only an **exact leaf match** is
  adopted. A pasted parent folder (`…\test_processing_2`) does not become a
  completed guess, and a pasted word/URL/markup is ignored silently.
* No hidden snooping: the clipboard is read on a user gesture only — the pick,
  `Rescan`, or the user's own paste. Nothing polls it.
* No new control: no field, no paste box, no "Use copied path" (removed in
  I-45). The recovery rides on the two controls the bar already has and on the
  user's paste.

## 3. Module plan (RULE 18: 150–300 lines per file, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/lib/clipboardpath.ts` | `readClipboardText()` returns `{ text, state: "text"\|"empty"\|"blocked"\|"unsupported" }` so "blocked" stops being indistinguishable from "empty"; `adoptCopiedText` unchanged | 33 → ~55 |
| `src/ui/rootcapture.ts` | **new**: `retryCapture(rootName)` (Rescan/scan hook, exact match only), `captureFromPaste(text, rootName)` (pure decision), `bindPasteCapture(rootName)` (document listener, ignores field targets, returns its unsubscribe) | ~70 |
| `src/ui/pickroot.ts` | reads the typed result; `pickMessage` now also speaks when the capture failed (hint or blocked reason) | 86 → ~100 |
| `src/ui/FolderBar.tsx` | the row's note states the action; `FolderPathRow` binds the paste capture while a root is shown | 75 → ~95 |
| `src/selection/rootsource.ts` | `rescan` calls `retryCapture` and says the capture line when one lands | 179 → ~185 |
| `src/svg/scan.ts` | `scanSources` does the same | 173 → ~179 |

## 4. TDD order

1. `tests/clipboardpath.test.ts` — `readClipboardText` distinguishes text /
   empty / blocked / no-API.
2. `tests/rootcapture.test.ts` (new) — `captureFromPaste`: the exact leaf is
   adopted; the parent, a word, a URL and an empty text are not; a known path is
   not overwritten by a non-matching paste. `retryCapture`: unknown + exact on
   the clipboard → saved, message returned; known → nothing read, nothing said;
   unknown + unrelated text → nothing saved.
3. `tests/pickroot.test.ts` — a captured pick is unchanged; a failed capture
   names the action (`Ctrl+Shift+C`, `Rescan`) and, when blocked, the reason
   (`Ctrl+V`).
4. `tests/selection_scan.test.ts` — rescan on a root whose path is unknown, with
   the exact path now on the clipboard, saves it and says `Folder path captured`;
   a second rescan stays quiet.
5. `tests/svg_io.test.ts` — `scanSources` the same.
6. `tests/folderbar.test.tsx` — the note when unknown; the paste listener: a
   pasted exact path appears in the row without any pick, a paste inside a text
   input is ignored, and no control is added.
7. `npm run verify`, `npm run quality:changed`, then the browser probe (§5).

## 5. Verification (headless Chromium, real OPFS)

| State of the clipboard at pick time | Expected after the fix |
|---|---|
| the exact path (Ctrl+Shift+C) | row shows it (unchanged) |
| a copied folder **item** (read → the bare name) | row: the two ways out; toast: `in Explorer press Ctrl+Shift+C on the folder, then Rescan`; **click Rescan** with the path now copied → exact path + `Folder path captured: …` |
| **read blocked** (stub rejects) | row: the two ways out; toast: `the browser blocked the clipboard: … press Ctrl+V here`; **Ctrl+V** with the path copied → exact path |
| the parent folder copied | the pick's `completed — check it` guess (unchanged, I-46) |
| nothing | the action hint; nothing invented |

## 6. Rejected alternatives

* **A "Capture path" button next to the row.** A new control for exactly what
  `Rescan` already is; the bar must stay two controls (I-44/45).
* **Reading the clipboard on any click.** Works, but reads the user's clipboard
  without them asking — hidden snooping (RULE 13), and it would fire on every
  button in the app.
* **Completing a leaf-only clipboard into a path.** `_split_output` alone names
  no drive; anything built from it is invented (I-39).
* **Accepting a pasted parent as a `completed` guess outside the picker.** The
  pick is the moment the user chose *this* folder; a later paste is not a
  request to guess. Exact match or nothing.
* **Waiting for the folder handle to expose a path.** It does not, and it will
  not: the API is deliberately path-blind (I-35, §1).

## 7. As shipped

The plan held. Two things were decided while measuring:

1. **The row names both ways out.** It has no way to know whether the browser
   will allow the read (that depends on the permission and on the page's
   embedding), so its note offers the Explorer copy + `Rescan` *and* `Ctrl+V`;
   the toast — which does know the state at pick time — says which one applies
   (`blocked` vs. simply nothing copied). A note naming only `Rescan` would send
   a user whose clipboard is blocked into a loop.
2. **The snapshot capture is gesture-guarded** (`ui/rootcapture.byUserGesture`,
   `navigator.userActivation.isActive !== false`): `Rescan`/scan call the retry
   before any `await`, so a click is still a gesture, while the boot-time scan —
   which restores a folder and scans it with no interaction — can never read the
   clipboard. That is what keeps I-45's promise ("only the pick-time capture
   writes the path memory") true as amended by I-52, and it is tested.

Measured in headless Chromium 153 against a real OPFS tree
(`/tmp/probeenv/probe_path_capture.mjs`, six states):

| Clipboard at pick time | Result |
|---|---|
| the exact path (Ctrl+Shift+C) | `EXACT` — row and toast both carry it |
| a copied folder **item** (the bare name) | row + toast actionable; **Rescan then captures the exact path** |
| the read blocked (throws) | toast names the block and `Ctrl+V`; **Ctrl+V then captures the exact path** |
| the parent folder | `completed — check it` (unchanged, I-46) |
| nothing | actionable note, nothing invented |
| the real Clipboard API (no stub, permission granted) | `EXACT` — the shipped path works without a stub |

Screenshots: `/home/user/path-capture-not-captured.png`,
`/home/user/path-capture-real-clipboard.png`.
