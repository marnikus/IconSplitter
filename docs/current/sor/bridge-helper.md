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
  reports `update: { watching, commit, restarts, served: { stamp, builtAt } }`, so a
  helper that already picked up a new build can be told from one that needs the
  window closed — and an open page can tell whether the bundle under it is still
  the one it loaded (§4).
- **A restart is a full restart.** The launchers pass `--build`, so the supervisor
  runs `npm run build` *before* starting the new helper — the same work
  `run_ftp_bridge.bat` does on a fresh launch (`--build-cmd` / `--no-build` /
  `BRIDGE_REBUILD=1` change it; the first start is not rebuilt, the launcher just
  did). The new helper gets this window's own flags (`--getty-headed`,
  `--getty-profile …`). A failed build prints `rebuild failed (…) — serving the
  previous bundle` and the helper starts anyway; the reload of the page picks up the
  bundle that was built.
- Dependency changes are not its business: after a pull that changes
  `package.json`, run `install_dependencies.bat` (`npm ci`) once.

## 3a. A stalled or cancelled transfer never ends the window

A socket the user already cancelled can fail long after its request answered: a
`STOR` reply timer that fires after `/ftps/close`, a data channel that stalls during
the TLS handshake, a reply whose promise the caller walked away from. Node's default
is to kill the process for an unhandled rejection — one 30 s FTP timeout used to end
the whole window mid-run.

- `tools/bridge/guards.mjs` installs `unhandledRejection` and `uncaughtException`
  handlers in `server.mjs`: the reason is logged once (`helper: … was logged, not
  fatal`) and the helper keeps serving. The request that owned the socket already
  has its own failure, so nothing is hidden from the app.
- The two sources are fixed as well: `observed()` marks the early `STOR` reply as
  handled (it starts before the data channel's TLS handshake finishes), and the
  reply reader's timeout only ever settles **its own** waiter — an older timer can no
  longer steal a newer read or leave it hanging.
- Reasons are scrubbed of credentials only when the secret is 4+ characters; a
  one-letter password used to mask every "p" in the sentence instead of protecting
  anything.
- If the helper does crash, the supervisor restarts it and says so; when it stops
  trying it prints `the helper stopped (1) N times — stopping after N restart(s)`.

## 4. Fresh app bundle, same helper — the page reloads itself

`dist/index.html` is rebuilt automatically when `src/` is newer or carries another
`iconsplitter-src-hash` (`tools/bridge/distfresh.mjs`), and a supervised restart
rebuilds it too (§3). The open tab used to keep the old bundle until someone pressed
F5; it now swaps by itself and says so in one short line.

- The build writes its `src/` fingerprint into the page as
  `<meta name="iconsplitter-src-hash">`; `GET /health` reports the stamp of the file
  the helper is serving. Every 15 s the page compares the two
  (`src/lib/updatewatch.ts`, `src/lib/runbusy.ts`, `src/ui/rebuildwatch.tsx`).
- Equal stamps: nothing happens, no request beyond the poll. Different: a bar at the
  top of the page says `New build found — reloading this page now`, and the page
  reloads after ~0.9 s so the line can be read. The page that
  comes back says `New build is running — rebuilt from <commit> at HH:MM` for 8 s;
  the note travels through `sessionStorage`, so it survives the swap.
- **Never mid-run.** Each panel reports its own `running` / `uploading` flag; while an
  upload, a split run or a generation is in flight the bar says `reloading when this
  run finishes` and offers `Reload now`. The reload goes as soon as the last run ends,
  so no transfer is cut and no queue is lost. `✕` on the bar drops it entirely.
- One automatic reload per (own → served) pair. A page that comes back on the old
  bundle anyway (a copy of `dist/index.html` opened from disk, not served by this
  helper) sees `this tab keeps the old build — press reload` instead of reloading
  forever.
- A page with no stamp is not watched (nothing to compare), and a dev-server page
  just gets its own app back from `/health`, so `npm run dev` is unaffected.

## 5. Tests

`tests/bridge_restart_rebuild.test.ts` — a restart builds before starting the new
helper (and the first start does not), the restarted helper gets the window's flags,
a failed build still starts the helper and says so, and `--build-cmd` alone does not
turn the step on. `tests/bridge_crash_guard.test.ts` — a stalled FTPS server answers a failure and the
helper stays up, `/ftps/close` during a stalled upload leaves the window alive past
the reply timeout, the reply reader's waiters settle independently, the guards
survive an unhandled rejection in a real process, and a crash loop stops with a
readable line. `tests/bridge_update_watch.test.ts` — the stamp follows bytes, `readCommit` reads
HEAD and detached HEAD and is silent outside git, a busy helper is never restarted,
every launcher starts the supervisor (never the bare server), the supervisor
re-runs the helper after `75` and stops on a clean exit, and a live helper exits
`75` when the watched code changes while staying up with `--no-update-watch`.
`tests/update_reload.test.ts` — the stamp is read from the page and followed
through a rebuild by a live helper, a fresh bundle reloads a page while an in-flight
run holds it, one reload per pair, and the confirmation survives the swap.
`tests/rebuild_watch_ui.test.tsx` — the real hook and toast: reload after a new
stamp, nothing when the stamps match, a held reload while an upload runs, `Reload
now`, dismiss, and a failed poll that asks again.
`tests/bridge_ftps.test.ts`, `tests/bridge_sftp.test.ts`, `tests/bridge_getty_web.test.ts`
own the routes themselves.
