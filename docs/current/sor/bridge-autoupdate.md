# Helper self-update — committed code only (2026-11-13)

Parent: [helper](bridge-helper.md). Code: `tools/bridge/autoupdate.mjs` (watchers),
`updategate.mjs` (when), `appbuild.mjs` (staged bundle), `supervise.mjs` (launcher).

The helper used to rebuild the app and restart itself from whatever bytes were on
disk every 10 s, so a half-written edit (an import of a file not created yet) broke
the build, and broken helper code crash-looped the window. Now an update happens
only when **all** hold:

1. **quiet** — the watched files kept the same stamp for `--update-quiet-ms`
   (env `BRIDGE_UPDATE_QUIET_MS`, default 20 s);
2. **no git operation running** — no `index.lock`, merge, rebase, cherry-pick, revert;
3. **committed** — `git status --porcelain --untracked-files=all` lists nothing under
   the watched paths (`src/`, `index.html` for the app; `tools/bridge/` for the helper).
   The window says once: "… changed but is not committed yet (file) — it updates once
   the change is committed". Outside a git checkout the quiet window alone decides.
   `BRIDGE_UPDATE_ON=save` restores "any saved change" (still quiet-gated).

**Helper code**: before handing over, the new code runs `server.mjs --self-test`
(every module must load, exit 0; `--self-test-script` overrides it in tests). If it
does not load, the window says why and **this helper keeps serving**; it retries when
the code changes again or after 2 min. Never during an upload or an app build.

**App code**: built into `.dist-staging-*` next to `dist/` (vite reads
`ICONSPLITTER_OUT_DIR`), swapped into `dist/` only when `index.html` exists and is
stamped for exactly the sources it was built from (an edit during the build retries).
A failed build leaves the previous bundle; it retries on the next change or after
2 min. A page load builds only a **missing** bundle, never a stale one. The
supervisor's restart build uses the same staged builder and resets its crash count
after a helper ran for a minute.

Tests: `bridge_update_gate` (gate, git status, staged build, commit wait, self-test,
no build on page load), `bridge_app_rebuild`, `bridge_restart_rebuild`,
`bridge_update_watch`.
