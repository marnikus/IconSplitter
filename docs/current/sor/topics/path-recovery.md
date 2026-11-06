# Path recovery

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 19. When the browser will not hand over the folder's path (2026-10-05, I-52)

Report, with the row on screen:

```
Open folder   Rescan   Scope: split output only
FULL PATH  _split_output   full path not captured
```

The list was right; the path never arrived and the row offered nothing to do
about it. Measured cause (headless Chromium, `probe_path_capture.mjs`, the
browser's clipboard stubbed per state): a pick captures the path from the
clipboard, and that read can fail in four ways the app could not tell apart —
the clipboard held a **copied folder item** (plain Ctrl+C puts a shell object
there, not text), the read was **blocked** (permission, focus, or an iframe
whose `allow` list omits `clipboard-read`), the user copied the path **after**
picking, or nothing was copied at all. In every one of them the row read
`full path not captured` and stopped.

I-52 turns the single attempt into a conversation:

* the pick is unchanged (read before the dialog, once after it if the first read
  was empty);
* **`Rescan`** — the existing button — makes one more exact-match attempt when
  the root's path is unknown, so a copy made after the pick lands with one
  click instead of another trip through the dialog;
* **`Ctrl+V`** anywhere outside a text field adopts the text for the root on
  screen: a paste event needs no permission and works inside iframes, so this is
  the way out when the Clipboard API itself is blocked;
* the read now reports `text` / `empty` / `blocked` / `unsupported`, and the UI
  says which: the toast names the reason, the row (`title` included) names both
  ways out.

What never changes: nothing is invented (outside the picker only an exact leaf
match is adopted — a pasted parent folder is not completed into a guess), no
read happens without the user's own gesture (a boot-time scan is silently
refused), and no new control appears — the bar is still one green button, one
`Rescan` and one read-only row. Design:
`archive/2026-10-05-path-capture-recovery/design.md`.
