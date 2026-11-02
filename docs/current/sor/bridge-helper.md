# The loopback helper (`tools/bridge/`) — one window, kept current

Behaviour of the sites it drives: [Upload (stock)](stock-upload.md) ·
[Getty web upload](stock-upload-getty-web.md). Handles: [selectors/stock-upload](../selectors/stock-upload.md).

## 1. What it is

`tools/bridge/server.mjs` is one dependency-free Node process on `127.0.0.1:47391`
(loopback only) that the Upload tab calls for everything the browser cannot do:
FTPS/SFTP transfers, Inkscape EPS conversion, Getty ESP OAuth and the Getty web upload
driving Chrome/Edge. It also serves `dist/index.html`, so `run_app_ftp.bat` opens the
app from the same origin. `GET /health` is the probe.

## 2. Launchers and the supervisor

| Launcher | Starts |
|---|---|
| `run_ftp_bridge.bat` | build, free `47391`, `node tools/bridge/supervise.mjs` |
| `run_app_ftp.bat`, `run_app_inkscape.bat` | the same, in a second window, then the app |
| `run_inkscape_bridge.bat` | the same, Inkscape wording |

The supervisor (`tools/bridge/supervise.mjs`) is the window the user keeps open: it
runs the helper and starts it again when it asks for a restart (exit `75`, §3) or
crashed. A crash is retried up to `--max-restarts` (10) times; more than ten restarts
inside a minute stop the loop with a message, so a broken build is visible instead of
spinning. `--once` runs the helper once; any argument the supervisor does not consume
(`--getty-headed`, `--getty-profile …`, `--port …`) goes to the helper unchanged.

## 3. A `git pull` restarts it in place

The problem: the helper reads its code once, at boot. A pull that brought new helper
code used to leave the old code in memory until the window was closed by hand.

- At boot the helper hashes the bytes of its own files (`helperCodeStamp`,
  `tools/bridge/updatewatch.mjs`, over `tools/bridge/`, `--watch-dir` to change) and
  re-hashes every `BRIDGE_UPDATE_CHECK_MS` (10 s; `--update-check-ms`). A different
  stamp logs `helper code changed (commit <sha>) — restarting with the new build`
  and exits `RESTART_CODE = 75`; the supervisor starts the new code.
- **It never restarts mid-run.** A request in flight, or a Getty batch whose
  metadata is being typed (`gettyWebBusy`), defers the restart; the window says
  `restarting when this run finishes`. Idle Getty browsers are handed back
  (`releaseIdleSessions`) before the exit, so no browser is orphaned.
- The stamp is content, not time: saving the same bytes changes nothing, and outside
  a git checkout the note says `local changes` instead of a commit.
- Off with `--no-update-watch` (`BRIDGE_NO_UPDATE_WATCH=1`). `GET /health` reports
  `update: { watching, commit, restarts, served: { stamp, builtAt } }`, so an open
  page can tell whether the bundle under it is still the one it loaded (§4).
- **A restart is a full restart.** The launchers pass `--build`, so the supervisor
  runs `npm run build` *before* the new helper starts — what a fresh launch does
  (`--build-cmd` / `--no-build` / `BRIDGE_REBUILD=1` change it; the first start is
  not rebuilt). The new helper gets this window's flags (`--getty-headed`,
  `--getty-profile …`). A failed build prints `rebuild failed (…) — serving the
  previous bundle` and the helper starts anyway.
- Dependency changes are not its business: after a pull that changes
  `package.json`, run `install_dependencies.bat` (`npm ci`) once.

## 3b. A pull that changes only the APP rebuilds the bundle in place

The restart above is for helper code. App commits (`src/`, `index.html`) used to
reach the page only when `index.html` was asked for again, so an open window kept the
previous build (reported 2026-11-02, "pulled but it did not rebuild"). The same 10 s
tick now compares the app stamp (`APP_WATCH`, the list the build stamps into the page)
with the one inside `dist/index.html` (`isDistStale`):

- A difference rebuilds `dist/` **in place** (`npm run build`, `--build-cmd` /
  `--build-cwd` / `BRIDGE_BUILD_CMD`), logging `app source changed (commit <sha>) —
  rebuilding the bundle…` then `app bundle rebuilt — the open page reloads onto it`.
- **The helper does not restart for app code**: an upload keeps its window, its Getty
  browser and its sign-in, and the page reloads itself as §4 describes. No F5.
- One build at a time; the same bytes never fail twice (`App rebuild failed (…)
  — serving the previous bundle`, printed once). Off with `--no-app-watch`, else
  `--app-dir <dir>`.

## 3a. A stalled or cancelled transfer never ends the window

A socket the user already cancelled can fail long after its request answered: a
`STOR` reply timer that fires after `/ftps/close`, a data channel that stalls during
the TLS handshake, a reply whose promise the caller walked away from. Node's default
is to kill the process for an unhandled rejection — one 30 s FTP timeout used to end
the whole window mid-run.

- `tools/bridge/guards.mjs` installs `unhandledRejection` and `uncaughtException`
  handlers: the reason is logged once (`helper: … was logged, not fatal`) and the
  helper keeps serving. The request that owned the socket has its own failure.
- The sources are fixed too: `observed()` marks the early `STOR` reply as handled
  (it starts before the data channel's TLS handshake ends), and the reply reader's
  timeout settles **only its own** waiter — an older timer can no longer steal a
  newer read or leave it hanging.
- Reasons are scrubbed of a credential only at 4+ characters: a one-letter password
  masked every "p" in the sentence instead of protecting anything.
- If the helper does crash, the supervisor restarts it; when it gives up it prints
  `the helper stopped (1) N times — stopping after N restart(s)`.

## 4. Fresh app bundle, same helper — the page reloads itself

`dist/index.html` is rebuilt by the app watch (§3b), a page load, or a supervised
restart (§3). The open tab swaps by itself and says so in one short line.

- The build writes its `src/` fingerprint into the page as
  `<meta name="iconsplitter-src-hash">`; `GET /health` reports the stamp of the file
  the helper is serving. Every 15 s the page compares the two
  (`src/lib/updatewatch.ts`, `src/lib/runbusy.ts`, `src/ui/rebuildwatch.tsx`).
- Equal stamps: nothing happens. Different: a bar says `New build found — reloading
  this page now`, and the page reloads after ~0.9 s so the line can be read; the page
  that comes back says `New build is running — rebuilt from <commit> at HH:MM` for
  8 s (the note travels through `sessionStorage`).
- **Never mid-run.** While an upload, a split run or a generation is in flight the bar
  says `reloading when this run finishes` and offers `Reload now`; the reload goes as
  the last run ends, so no transfer is cut and no queue is lost. `✕` drops the bar.
- One automatic reload per (own → served) pair: a page that comes back on the old
  bundle (a copy of `dist/index.html` opened from disk) says `this tab keeps the old
  build — press reload` instead of looping.
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
`tests/bridge_app_rebuild.test.ts` — app-only change: rebuilt in place, new `served`
stamp served while the helper stays up; unchanged app: no build; failed build:
reported once, previous bundle still served.
`tests/update_reload.test.ts` — the stamp is read from the page and followed
through a rebuild by a live helper, a fresh bundle reloads a page while an in-flight
run holds it, one reload per pair, and the confirmation survives the swap.
`tests/rebuild_watch_ui.test.tsx` — the real hook and toast: reload after a new
stamp, nothing when the stamps match, a held reload while an upload runs, `Reload
now`, dismiss, and a failed poll that asks again.
`tests/bridge_ftps.test.ts`, `tests/bridge_sftp.test.ts`, `tests/bridge_getty_web.test.ts`
own the routes themselves.
