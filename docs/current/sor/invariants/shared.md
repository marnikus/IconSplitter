# Shared invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-23"></a>
* **I-23 (the log, RULE 10/12):** one log instance for the whole app, docked by
  `Workbench` on every tab. Features write through `log()` only — no feature
  touches `iconSplitter.log.v1` — and one entry is one `LogSpec` through one
  sanitiser, so the store, the rows and the copied text can never disagree.

<a id="i-24"></a>
* **I-24 (the log, RULE 20):** an entry never carries a key, an Authorization
  header, image bytes, a composite data URL or a full payload — only a mask, a
  hash and counts. Sanitising happens on write **and** on read, so a tampered
  stored payload cannot smuggle one either.

<a id="i-25"></a>
* **I-25 (the log, RULE 13):** the stored log is validated and clamped on read
  (foreign version or corrupt JSON → the default state, never a guess), keeps at
  most the configured cap (50/100/200/500/1000, default 200) in display **and**
  storage, is debounced 150 ms and flushed on pagehide, and `clearLog()` leaves
  exactly one honest `log.cleared` entry.

<a id="i-26"></a>
* **I-26 (the log, RULE 11/24):** the dock follows new entries only while it is
  at the bottom (24 px slack), stops the moment the reader scrolls up, resumes
  when they come back, and always says which of the two states it is in.

<a id="i-27"></a>
* **I-27 (the shell, RULE 3/24 — the port's fix):** the dock occupies a **layout
  row** of one viewport column (`.app-shell` → nav, `.app-main`, `.app-dock`);
  the panels are floored at the band that is left (`.v2`, `.svg`: `min-height:
  100%`) and grow with their content, so `.app-main` — never the window — is
  what scrolls. No interactive element is ever painted under the dock, at any
  scroll position, and the app's floating toasts are lifted above the dock's
  published height (`--app-dock-h`).

<a id="i-44"></a>
* **I-44 (one folder control, RULE 10/12):** every tab that scans a folder
  offers exactly one way to open the picker — the green `Open folder` button
  (`ui/FolderBar.OpenFolderButton`, testids `sel-open-folder` / `v2-open-folder` /
  `svg-open-folder`), labelled with the action and never with the folder's name,
  present in every state, with real hover, active and keyboard-focus states. The
  loaded folder's complete path is shown in its own full-width **read-only row**
  below the controls (`sel-folder-path` / `v2-folder-path` / `svg-folder-path`):
  text, never an input, never a button.

<a id="i-45"></a>
* **I-45 (no hidden scanning, no hidden writes, RULE 13/24):** only the user's
  `Open folder` / `Rescan` (plus the boot restore) scans a folder, and only a
  capture made for the user's own gesture writes the path memory — the pick,
  `Rescan`'s retry, or the user's own `Ctrl+V` (I-52). The 30 s Watcher and every
  copied-path control are gone from the UI *and* from the code (`SelState.watcher`,
  `useSelection.useWatcher`, `WATCH_MS`, `ui/RootPathField`, `ui/userootpath`,
  `lib/rootpath.saveRootPath`, `lib/clipboardpath.adoptCopiedPath`).

<a id="i-46"></a>
* **I-46 (the path row never lies, RULE 4):** the row shows the captured path
  word for word (whole value in its `title`, selectable like any text), or the
  folder's name with `full path not captured` when the browser withheld it
  (the `completed — check it` state is gone with the completion itself, I-59).
  Copies are unaffected (I-28): they hand over a folder path, the real one when
  captured and the folder-name fallback otherwise.

<a id="i-73"></a>
* **I-73 (one list selection, RULE 12/25):** Batch, Selection V2, Generate SVG
  and SVG to upload distinguish active from checked rows and use the same
  [Batch-authoritative gestures](../../rules/BEHAVIOR.md#rule-25). A plain row
  click never checks or clears rows; modifiers/checkbox/header act on their
  defined scope; hidden checks survive filters. Batch initially checks eligible
  rows; the other three start unchecked. A changed gesture is one global undo
  entry, including Upload.
  Tab-specific eligibility and paid confirmation still constrain bulk actions.

<a id="i-75"></a>
* **I-75 (per-task and single-vs-batch prompt memory, RULE 12/13/24 — 2026-10-20):**
  every AI task confirmation popup across tabs (`svg-generate`, `svg-regenerate`,
  `svg-image`, `upload-generate`, `upload-regenerate`) distinguishes single-icon
  (`single`) from multi-icon (`batch`) scope (`lib/taskprompts`, `state/taskpromptstore`,
  `iconSplitter.taskPrompts.v1`), remembers the last chosen preset independently
  for all 10 `TaskPromptKey` slots without clobbering the main editor prompt,
  validates stored choices on read against that tab's own preset store (`I-65`),
  and displays an explicit default-prompt indicator directly above the preset
  dropdown (`ui/TaskPromptPicker`).

