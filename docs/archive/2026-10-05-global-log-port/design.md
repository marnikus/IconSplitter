# Global log — port to the long-request branch (2026-10-05)

**Status: implemented.** The global log was designed and first shipped on branch
`arena/01a0f967-iconsplitter` (`694ceb3`, folder `docs/archive/2026-10-01-svg-confirm-global-log/`
there). This record is the PORT of that feature onto this branch, which had since grown the
long-request runner (`docs/archive/2026-10-05-svg-long-requests/design.md`): streaming, the stall
window, the in-flight journal and restart recovery. The shipped contract is
`docs/current/SYSTEM_OF_RECORD.md` §13; deviations from the source design are listed in
`docs/current/QUALITY_RECHECK.md` (2026-10-05, this port).

## Why a port record and not the original folder

The source folder designs TWO features: the confirmation *preview* (one request builder,
fingerprints, `PreparedRun`) and the global log. Only the log applies here — this branch keeps
its own confirmation dialog. The original docs stay on the source branch, unchanged (RULE 17);
this folder records what was carried over, what was adapted, and why.

## What was carried over unchanged

* The pure core: `src/lib/logentry.ts`, `logredact.ts`, `logbuffer.ts`, `logformat.ts`,
  `logscroll.ts`, `logprefs.ts` — schema, three redaction layers, fold → flood → ring, the words
  of a row and of Copy-all, the follow-scroll machine, prefs.
* The state + IO: `src/log/secrets.ts`, `session.ts`, `logstorage.ts`, `logstore.ts`,
  `logger.ts`, `boot.ts` — one module-scope store above the tabs, ONE sanitising writer,
  debounced persistence within 256 KB, the secret registry.
* The dock: `src/log/LogDock.tsx`, `LogToolbar.tsx`, `LogList.tsx`, `useLog.ts`,
  `useStickyScroll.ts`, `log.css` — on every tab, follow-scroll, Copy all, Clear, max entries.
* The tap contract: tab switch, history push/apply/fold, every toast (the four `say`s and the
  direct writes), batch process start/done/stop, selection toasts, key save/load/clear, model
  change, rules edit (length + hash), scan outcome, and every stage of a run.
* `safestorage.writeKey` returns a boolean (a refused write is honest, not swallowed).

## What was adapted, and why

| # | Source branch | This branch | Reason |
|---|---|---|---|
| A-1 | Dock = `position: fixed` + a shell padding variable | Dock is unchanged, but `LogDock` ALSO renders an in-flow spacer (`log-dock-spacer`, `height: var(--log-dock-h)`) as its first child | The source dock covered the last checkbox rows of the selection lists in a real browser — the bug this port had to fix. An in-flow spacer reserves the space in layout, whatever the page's own padding does (`tests/log_layout.test.tsx`) |
| A-2 | `svg/send.ts` emits `request-sent/-ok/-retry` and pre-redacts retry errors | `svg/runbatch.ts` does — it is this branch's sender | The long-request work never had a `send.ts`; `runbatch.ts` owns the attempt loop |
| A-3 | `confirm.accept` carries a run + request fingerprint (`fp`) | `confirm.accept` carries `selected` and `requests` only | This branch has no `PreparedRun` and no fingerprint; the request row carries the composite `hash` instead |
| A-4 | `request.sent` data: `fp`, `chars` | `hash` (the composite hash the batch already computes for its sidecar) | Same reason; the hash still ties the log row to what was on the sheet |
| A-5 | Run id: `newId("r")` in the logger | `newRunId()` from `svg/journal.ts` (`run_<36>-<random>`) | The journal already names runs for restart recovery; the log joins that id, not a second one |
| A-6 | `run.cancel` id from the prepared run | `refs.run.current` (set by `confirmRun`, cleared on `run.done`) | There is no prepared-run object to read the id from |
| A-7 | `svg.scan.done` `missing` = missing basenames | `missing` = `problems.length` | This branch's discovery lists per-file problems, not a `missing` array |
| A-8 | `batch.done` from saved/failed/missing counters | wraps the runner's `BatchOutcome` (`done` / `unknown`) — an unknown outcome says so | The long-request work added `unknown` (a stall can finish upstream); the log must not invent certainty |
| A-9 | `RunSummary` without `perRequest`/`unknown`/`outcomes` | `logRunDone` takes this branch's summary shape | The long-request work added them |
| A-10 | Tests police `svg/send.ts` as the only sender | `tests/log_boundaries.test.ts` polices `svg/runbatch.ts` | Follows A-2 |

## The bug this port had to fix (and prove fixed)

The source branch's dock was a fixed overlay and the shell padded the page by `--log-dock-h`.
In a real browser that padding did not reach the scroll containers of the selection tabs, so the
dock covered the last rows — the user could not click their checkboxes. The fix is structural,
not cosmetic: `LogDock` renders its own spacer in the flow directly above the fixed panel, so the
content column ends before the dock begins. `tests/log_layout.test.tsx` pins the spacer, the
`--log-dock-h` publication and the toast/busy clearance on every fixed element; the suite that
would have caught the bug is the checkbox selection suites themselves, green with the dock open.

## Tests (all ported RED → GREEN)

| File | Proves |
|---|---|
| `tests/log_entry`, `log_redact`, `log_buffer`, `log_format`, `log_scroll`, `log_store` | the pure core + the store, verbatim from the source |
| `tests/log_ui.test.tsx` | the dock on every tab, follow-scroll, copy/clear/max |
| `tests/log_layout.test.tsx` | the spacer fix and toast clearance (NEW for this port) |
| `tests/log_taps.test.tsx` | every toast mirrored once; history/tab/batch/key/model/rules taps |
| `tests/svg_runlog.test.ts` | the RunEvent → entry table, rewritten for this branch's events |
| `tests/log_boundaries.test.ts` | layering; `runbatch.ts` the only sender; nothing in the log can name the key |
| `tests/log_svg_flow.test.tsx` | a whole run under one run id, cancel, failed request — through the real panel |
| `tests/log_secret_flow.test.tsx` | a provider echoing key + header + data URL leaves nothing in log, storage or Copy-all |
