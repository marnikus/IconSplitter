# Getty web upload — browser, profile and self-check

Parent: [Getty web upload](stock-upload-getty-web.md). Handles:
[selectors/stock-upload](../selectors/stock-upload.md).

## 1. Launch and flags

- Default `chrome --headless=new`, throwaway profile; `--getty-headed`
  (`GETTY_WEB_HEADED=1`) shows the window; a visible window is never killed.
- `--getty-profile <folder>` (`GETTY_WEB_PROFILE`) keeps the browser between runs
  so Getty's sign-in survives (ten idle minutes close it),
  `--restore-last-session` revives a session-only login, and cookies are kept in
  `iconsplitter-session.json` (0600, never logged) so a killed window starts
  signed in.
- `--getty-check` prints `browser:`, `launch:`, `socket:`; `--getty-reset
  --getty-profile <folder>` ends that browser; `--getty-cdp` (`GETTY_WEB_CDP`)
  attaches to `--remote-debugging-port=9222`. `GETTY_WEB_BROWSER` overrides the
  executable; `GETTY_WEB_UPLOAD_TIMEOUT_MS` (180 s) and
  `GETTY_WEB_READY_TIMEOUT_MS` (300 s) bound the waits.

## 2. One profile, one browser, freed by the helper

A browser answering on the folder's port is attached to; a locked folder without
one is freed by ending its browsers, clearing locks and relaunching.
