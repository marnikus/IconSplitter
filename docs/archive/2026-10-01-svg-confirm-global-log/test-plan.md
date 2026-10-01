# Test plan — TDD phases and the VERIFY matrix (2026-10-01)

Part of `docs/archive/2026-10-01-svg-confirm-global-log/design.md`. Module names and budgets:
`docs/archive/2026-10-01-svg-confirm-global-log/modules.md`. Baseline: 57 files / 517 tests green, coverage
`src/lib` 97.47 % lines (measured 2026-10-01).

## 1. Protocol (RULE 8, RULE 16.3, RULE 16.6)

1. **RED.** Write the phase's tests first and run them. Each must fail for the *right* reason — the assertion
   or the missing export it is about — not for a typo. Keep the red output in the PR description.
2. **GREEN.** The smallest code that passes. No behaviour the tests do not name.
3. **Delete check.** For each new function, break it (delete the body, invert a boolean, off-by-one the cap) and
   confirm at least one test fails (§4). A test that passes with the feature deleted is not a test.
4. **REFACTOR in RULE 19 order** (nesting → CC → cognitive → size), suite green after each step.
5. **GATE** — `npx tsc --noEmit` · `npx eslint src tests tools --max-warnings 1000` ·
   `node tools/quality.mjs --changed --allow-legacy` · `npx vitest run` · `npx vitest run --coverage` (P4, P5, P8) ·
   `npm run verify` before any push. A new `src/lib` or `src/log` function with no covering test fails the phase.

Real logic, fakes only at ports: `fetch` (`vi.stubGlobal`, as `svg_cost_io.test.ts`), `navigator.clipboard`,
`localStorage` failures, scroll geometry, `FakeDir`. Never mock the module under test. Key-shaped samples are
assembled from parts, as `secret_hygiene.test.ts` does, so the hygiene gate stays green.

## 2. P0 — equivalence-gated extractions (no behaviour change)

| Extraction | What covers it today | Characterise first (new, **green on today's code**) |
|---|---|---|
| `svg/send.ts` out of `runner.ts` | happy path only: both `runGeneration` tests in `svg_cost_io` use `retries: 0`; `svg_send` tests one transport attempt. **The retry loop is untested.** | new `tests/svg_retry.test.ts` (fake timers + a fetch sequence): 429 with `retry-after` then 200 → two identical posts after exactly that wait · 503 twice then 200 → waits 500 ms then 1 000 ms · 401 → one post, an echoed key is masked in the error · a fetch that never settles → one post (a timeout is never retried) · abort during the wait → no further post · retries exhausted → one `request-failed` after N+1 posts |
| confirm dialog → `svg/confirm/` | the dialog is opened only in `svg_ui` l.238–242 (sampling text); the test titled "confirms before sending and never sends twice" asserts the no-key guard and nothing else | first cases of `tests/svg_confirm.test.tsx`: ordered manifest per request · Cancel and Close dismiss without a request · *Generate now* closes the dialog and posts once per batch · a second click is still one run · the contact-sheet preview shows grid and hash, and reports a build failure |
| `batch/usePresetActions.ts` out of `useBatch.ts` | none — no test imports `useBatch` or `BatchPanel` | new `tests/batch_presets.test.tsx`: save / load / delete a preset through the real hook (IDB handle store mocked as in `svg_ui`), asserting `localStorage`, `presetNames` and the toast text |
| `ui/useToast.ts` out of `App.tsx` | none — `App` is only rendered inside `Workbench` tests | new `tests/sheets_toast.test.tsx`: a non-image file through the hidden input shows the toast (`data-testid="toast"`, error styling), it clears after 3 200 ms (fake timers), a second toast restarts the timer |

These four suites pass on the *current* code before any extraction and stay green after — they are the
equivalence gate RULE 16.5 asks for ("touch legacy only with tests that lock current behaviour first"). The 517
existing tests stay green with **zero edits** through P0.

## 3. Phases — RED first, then GREEN

| Phase | RED (test files, written first) | GREEN (modules) | Exit |
|---|---|---|---|
| P0 | `svg_retry`, `svg_confirm` (today's cases), `batch_presets`, `sheets_toast` — characterisation, green at once | the four extractions | 517 + new all green, no existing test edited |
| P1 | `svg_payload` | `svgprompt` (extend), `svgpayload`, `wireHeaders` | golden strings pinned *before* touching `svgprompt` (C-0) |
| P2 | `svg_send` and `svg_retry` (extended with the events), `svg_cost_io` helper passes `prepared` and derives `fingerprint` from `getFile()` | `runner` on `prepared`, `send`, `composite` guard, three events | wire body == prepared request; refused batch does not stop the next |
| P3 | `svg_confirm` (new cases) | `svg/confirm/*`, `actions` (`confirmGenerate(prepared)`), `types` | **feature 1 complete** — the headline equality test is green |
| P4 | `log_entry`, `log_redact`, `log_buffer`, `log_format`, `log_scroll`, `log_boundaries` | the six `lib/log*` files | coverage of the new lib files ≥ 90 % |
| P5 | `log_store` | `logstore`, `logstorage`, `logger`, `secrets`, `boot`, `writeKey` boolean | persists within limits; corrupt/quota/unavailable handled |
| P6 | `log_ui`, one `workbench_ui` case | dock components, `useLog`, `useStickyScroll`, css, clearance edits | **feature 2 usable** on all 5 tabs |
| P7 | `log_taps`, `svg_runlog`, `log_secret_flow` | `statelog`, `runlog`, the status taps, keystore registry | every `say` mirrored; no secret reaches store, storage or Copy-all |
| P8 | flood in `log_ui`; 5 000-row render | flood guard wiring, docs, re-check | `npm run verify` green; QUALITY_RECHECK record |

The cases each file must prove — one sentence per test — are in `docs/archive/2026-10-01-svg-confirm-global-log/test-cases.md`.

## 4. Delete-check kill list (each mutation must turn a named test red)

| Mutation | Must fail |
|---|---|
| `prepareRun` request text ≠ `parts.text`; or the runner builds text itself | `svg_payload` equality · `log_boundaries` (C-1) |
| `withImage` also rewrites the text part | `svg_payload` deep-equal |
| store appends without `sanitizeInput`; `parseLog` skips re-sanitising | `log_redact` · `log_secret_flow` · tampered-payload case |
| `atBottom` comparison inverted; `EPS` off by one | `log_scroll` boundary · `log_ui` follow |
| ring keeps N+1 / drops newest | `log_buffer` · `log_store` |
| `writeKey` result ignored | `log_store` quota case |
| a status tap removed from any one of the four `say`s or six direct writes | `log_taps` |

## 5. VERIFY matrix

| VERIFY clause | Proven by |
|---|---|
| popup preview == API payload | `svg_confirm` "blocks joined equal the posted text" · "JSON view equals the posted body" · "edit, then send" · `svg_payload` wire equality · fingerprint on screen == logged at accept == logged at `request.sent` |
| log works across tabs | `log_ui` all five tabs, same entries · `log_taps` four panels · a run that finishes while another tab is open still reaches the store |
| persists within limits | `log_store` every `MAX_CHOICE`, 256 KB, reload, corrupt, quota, unavailable |
| respects scroll behaviour | `log_scroll` (pure) + `log_ui` (stubbed geometry) |
| redacts secrets | `log_redact` · `log_secret_flow` · `log_boundaries` · `log_taps` registry |

## 6. Negative cases that shaped the design

A provider error body that echoes the key, the header and an image data URL · a key pasted into the rules · a
persisted payload of the wrong version, with a 3 MB string, with `__proto__` · 10 000 `log()` calls in one tick (the
effect-loop class of bug) · `localStorage` that throws on write or read · no or blocked clipboard · a tab switch
mid-run · emptied rules · one selected image · ten selected at four per request · a file replaced between scan and
confirm · a double click on *Generate now* · circular `data` passed to `log()` · a catalog refresh while the dialog is open.

## 7. Manual checks (not automatable in happy-dom — record results in QUALITY_RECHECK)

Toast and dock clearance at 1280×720 on each tab · scroll anchoring when the ring trims while paused (Chrome, Edge) ·
real clipboard from the single-file `dist/index.html` opened as `file://` · keyboard-only pass over the dock and the
dialog · a screen-reader pass (the list must not be announced entry by entry) · bundle size vs the `modules.md` §6 budget.
