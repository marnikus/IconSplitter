# The loopback helper (`tools/bridge/`) — one window, kept current

Behaviour of the sites it drives: [Upload (stock)](stock-upload.md) ·
[Getty web upload](stock-upload-getty-web.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. What it is

`tools/bridge/server.mjs` is one dependency-free Node process on `127.0.0.1:47391`
(loopback only, no CORS from anywhere else) that the Upload tab calls for everything
the browser cannot do: FTPS/SFTP transfers, Inkscape EPS conversion, Getty ESP OAuth,
and the Getty web upload driving Chrome/Edge. It also serves `dist/index.html`, so
`run_app_ftp.bat` can open the app from the same origin. `GET /health` is the probe.

## 2. Launchers and the supervisor

| Launcher | Starts |
|---|---|
| `run_ftp_bridge.bat` | build, free `47391`, `node tools/bridge/supervise.mjs` |
| `run_app_ftp.bat`, `run_app_inkscape.bat` | the same, in a second window, then the app |
| `run_inkscape_bridge.bat` | the same, Inkscape wording |

The supervisor (`tools/bridge/supervise.mjs`) is the window the user keeps open: it
runs the helper and starts it again when the helper asks for a restart (exit `75`,
§3) or when it crashed. A crash is retried up to `--max-restarts` (10) times; more
than ten restarts inside a minute stop the loop with a message, so a broken build is
visible instead of spinning. `--once` runs the helper once. Any argument the
supervisor does not consume (`--getty-headed`, `--getty-profile …`, `--port …`) goes
to the helper unchanged.

## 3. A `git pull` restarts it in place

The problem: the helper reads its code once, at boot. A pull that brings new helper
code used to leave the old code in memory until the window was closed by hand — the
app then talked to a helper that predated it (`restart run_ftp_bridge.bat`).

- At boot the helper hashes the bytes of its own files (`helperCodeStamp`,
  `tools/bridge/updatewatch.mjs`, over `tools/bridge/`, `--watch-dir` to change).
- Every `BRIDGE_UPDATE_CHECK_MS` (10 s; `--update-check-ms`) it re-hashes. A
  different stamp means new code: it logs
  `helper code changed (commit <sha>) — restarting with the new build` and exits
  with `RESTART_CODE = 75`, and the supervisor starts the new code.
- **It never restarts mid-run.** A request in flight, or a Getty batch whose
  metadata is being typed (`gettyWebBusy`), defers the restart; the window says
  `restarting when this run finishes`. Idle Getty browsers are handed back
  (`releaseIdleSessions`) before the exit, so no browser is orphaned.
- The stamp is content, not time: saving a file with the same bytes changes nothing.
  Outside a git checkout the note says `local changes` instead of a commit.
- Turn it off with `--no-update-watch` (`BRIDGE_NO_UPDATE_WATCH=1`). `GET /health`
  reports `update: { watching, commit, restarts }`, so a helper that already picked
  up a new build can be told from one that needs the window closed.
- Dependency changes are not its business: after a pull that changes
  `package.json`, run `install_dependencies.bat` (`npm ci`) once.

## 4. Fresh app bundle, same helper

`dist/index.html` is rebuilt automatically when `src/` is newer or carries another
`iconsplitter-src-hash` (`tools/bridge/distfresh.mjs`), so a pull shows the new UI on
the next page load without restarting anything. The helper only restarts when **its
own** files changed; an app-only pull needs a browser reload, not a new window.

## 5. Tests

`tests/bridge_update_watch.test.ts` — the stamp follows bytes, `readCommit` reads
HEAD and detached HEAD and is silent outside git, a busy helper is never restarted,
every launcher starts the supervisor (never the bare server), the supervisor
re-runs the helper after `75` and stops on a clean exit, and a live helper exits
`75` when the watched code changes while staying up with `--no-update-watch`.
`tests/bridge_ftps.test.ts`, `tests/bridge_sftp.test.ts`, `tests/bridge_getty_web.test.ts`
own the routes themselves.
