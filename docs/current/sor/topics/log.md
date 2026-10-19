# Global activity log and dock

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 13. The global activity log, and the shell that stopped the dock blocking rows (2026-10-05)

Ported from `arena/01a10c14-iconsplitter@aaedf2e` ("verbatim prompt preview +
global activity log"); the prompt preview and the reasoning-tier caps that
commit also carried stay out — the first is a different feature, the second a
reversal this branch documented on 2026-10-05. Full record:
`archive/2026-10-05-global-log/design.md`.

### 13.1 What the log is

One docked panel, mounted once by `Workbench` as the last row of the app shell.
`src/lib/log.ts` owns the pure rules (schema, sanitising/redaction, the cap, the
ring buffer, formatting, validate-on-read); `src/log/logstore.ts` owns the live
state + the debounced persistence to `iconSplitter.log.v1`; `useLog` binds it to
React (`useSyncExternalStore`); `useAutoScroll` + `scroll.ts` own the follow
rule (24 px slack, pause on scroll-up, resume at the bottom); `LogHead`,
`LogList` and `LogRow` draw it. Entries are `{ id, at, level, feature, action,
ids, detail, data, v }` — `debug/info/warn/error`, one line, values trimmed
(`DETAIL_MAX_CHARS` 400, `VALUE_MAX_CHARS` 200, `DATA_MAX_KEYS` 12).

### 13.2 Who writes, and what may never be written

| Emitter | Entries |
|---|---|
| `ui/Workbench` | `app.open-tab` (the id of the tab, e.g. `tab=selectionV2`) |
| `state/HistoryProvider` | `history.push` / `history.push-gesture` (debug, the label + type + id count), `history.undo` / `history.redo`, `history.apply-failed` (error) |
| `svg/scan` | `svg.scan` (eligible/problems/unreadable/corrupt counts), `svg.scan-warning` (the same wording the user is told), `svg.scan-failed` (error) |
| `svg/actions` | `svg.root-picked`, `svg.prompt-reset`, `svg.config-changed`, `svg.sampling-changed`, `svg.review-decided`, `svg.confirm-opened`, `svg.generate-confirmed`, `svg.cancel-requested` (warn) |
| `svg/keystore` | `svg.key-saved` (the mask + whether it persisted), `svg.key-cleared` — never the key |
| `svg/runbatch` → `RunEvent` → `svg/runlog` | `svg.run-start`, `svg.request-start`, `svg.request-retry` (warn), `svg.item-start` (debug), `svg.item-saved`, `svg.item-failed` (error), `svg.request-failed` (error), `svg.request-done` (info, or warn for an unconfirmed outcome), `svg.cancelled` |
| `ui/pickroot` → the picking tab | `svg.root-picked` (`svg/actions`; the captured full path of the picked folder, or the completion flag) |
| `log/logstore`, `log/LogHead` | `log.cleared`, `log.max-entries`, `log.minimized`/`log.restored`, `log.copied` |

`withRunLog(sink)` wraps the runner's one event sink: the live UI gets the event
first, then the log records it, so the batch strip and the log can never
disagree. Two additions to this branch's own vocabulary made that honest rather
than approximate: `RunEvent.request-retry` (a retryable failure is now visible
while its wait runs instead of appearing only as the final report) and
`BatchOutcome.requestId` (a finished request's entry can name the provider id
that its sidecar and the in-flight journal already keep).

### 13.3 The shell, and the bug this port had to fix

The source branch docked the log with `position: fixed; bottom: 0` plus a spacer,
while every panel derived its height from the viewport (`.v2 { min-height:
calc(100vh - 3rem) }`). The dock therefore owned the bottom 236 px of the
viewport at every scroll position and received the clicks meant for the rows
painted there: at 1440×900 a hit test found two checkboxes per tab whose own
coordinates hit `log-body`/`log-entry`, and a real click on one left it
unselected (probe recorded in the archive doc). The fix is structural — the dock
is a row of `.app-shell`, `.app-main` is what scrolls, the panels are floored at
the band that is left and grow when their chrome needs more (a fixed-height
attempt collapsed the Generate SVG list to zero rows, which the same probe
caught), and the fixed toasts are lifted by `--app-dock-h`, the one value the
dock publishes. Invariants I-23…I-27; the layout gate is
`tests/log_layout.test.tsx`.
