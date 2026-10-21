# Shared log, secrets and gate tests

Focused test inventory; [all tests](../TESTS.md).

* `log_lib.test.ts` — the log's pure core: the entry shape, key/data-URL
  redaction on write, the cap clamp (0/12→50, 250→200, 600→500, 99999→1000),
  the ring buffer, `formatEntry`/`formatLogText` and a damaged or foreign stored
  payload (valid entries kept, re-sanitised on read)
* `log_scroll.test.ts` — the follow rule: at the bottom, inside the 24 px slack,
  and short content is "at the bottom" too
* `log_store.test.ts` — subscribe/notify, the 150 ms debounce, the cap trimming
  display **and** storage, a restart restoring the log, `clearLog()` leaving one
  `log.cleared` entry, the remembered minimize state, corrupt → defaults
* `log_layout.test.tsx` — **the port's bug gate**: the dock is the shell's last
  row and a sibling *after* `app-main`, never `fixed`/`sticky`/`absolute`; the
  shell is a viewport column; `.v2`/`.svg` are floored at the band they are
  given (never `100vh`, never a fixed height that could collapse the list); the
  fixed toasts read `--app-dock-h`, which the dock publishes and moves with
  minimize/restore
* `log_ui.test.tsx` — DOM: one dock on every tab with its head/body/empty state,
  the tab switches recorded once each, level + feature + action on a row, a key
  written into an entry never shown, follow/pause/resume on the real scroll
  events, Copy all == `formatLogText(entries)`, Clear, the cap (120 → 50 keeps
  `step-71 … log.max-entries`), and minimize surviving a restart
* `log_wiring.test.tsx` — the real emitters: a pushed edit (`{feature:"history",
  action:"push"}` with its label and count), undo + the failed apply, a scan's
  summary and its `review-decisions.json` warning, `key-saved` with the mask and
  never the key, and `withRunLog` handing the event to the live UI before it
  writes the entry
* `secret_hygiene.test.ts` (extended) — a key written through the real log store
  appears neither in the entry, the stored payload, nor the copied text
* `verify_runner.test.ts` — the lane plan of `tools/verify.mjs`, spawned for
  real: fast mode runs the suite exactly once (the coverage lane), `--full`
  adds the standalone lane, lane order, quality-lane args, `--base` passthrough
* `quality_base.test.ts` — `tools/quality.mjs --base/--files`, spawned for
  real: explicit ref/list, loud failure on an unknown ref or a missing file,
  honest empty set for non-src, the shallow-clone fetch hint

Shared progress arithmetic/layout and cross-tab adapter tests: [process progress](../process-progress.md#tests-and-safety).
