# SVG confirmation preview + global log — design (2026-10-01)

**Status: design only.** Nothing here is implemented; the app behaves exactly as
`docs/current/SYSTEM_OF_RECORD.md` says. Written TDD-first (RULE 16.6) and sized for the reader's context
budget (RULE 18): this hub plus seven focused files, each ≤ 200 lines. Deviations found while implementing are
recorded in `docs/current/QUALITY_RECHECK.md`, not by editing this folder (RULE 17).

One request, two features ("SVG CONFIRMATION & GLOBAL LOG"):

1. **Full prompt preview.** The Generate SVG confirm popup shows the exact request that will be sent, and the
   request that is sent *is* that object — preview and payload cannot drift because there is one builder.
2. **Global log.** A docked, minimisable log on every tab records user actions, state changes, generation
   stages, API requests/results, retries, errors, tokens and cost — and never a secret.

## Reading map

| File | Read it for |
|---|---|
| `docs/archive/2026-10-01-svg-confirm-global-log/research.md` | what exists today: send path, event/state flows, drift risks, measured limits |
| `docs/archive/2026-10-01-svg-confirm-global-log/confirm-preview.md` | feature 1: `PreparedRun`, dialog anatomy, invariants C-0…C-7 |
| `docs/archive/2026-10-01-svg-confirm-global-log/log-contract.md` | feature 2: ownership, schema, storage, redaction, retention, interfaces, L-1…L-9 |
| `docs/archive/2026-10-01-svg-confirm-global-log/log-panel.md` | the dock: layering, follow-scroll machine, actions, a11y, handles |
| `docs/archive/2026-10-01-svg-confirm-global-log/modules.md` | isolated module plan, legacy-file budgets, RULE 16/18/19 check |
| `docs/archive/2026-10-01-svg-confirm-global-log/test-plan.md` | TDD protocol, characterise-first extractions, phases, kill list, the VERIFY matrix |
| `docs/archive/2026-10-01-svg-confirm-global-log/test-cases.md` | the cases every test file must prove, one sentence each |

## How the pieces connect

```
Generate click ─► requestGenerate(ids) ─► dialog: prepared = prepareRun(current state)      [feature 1 · pure]
                                            │ Generate now ─► confirmGenerate(prepared)
                                            ▼
 runGeneration({ prepared }) ─► per batch: composite ─► verify ─► withImage ─► send (+ retries)
        │ RunEvent (+3 new kinds)                                  │ posts exactly the previewed request
        ├─► onRunEvent ─► tab UI state                             ▼
        └─► svg/runlog ─► log(…) ─► sanitize ─► ring buffer ─► dock + localStorage                [feature 2]
 history record / undo · tab switch · the four say()s ─────────────► log(…)        (same facade)
```

## Requirements → where specified → what proves them

| # | Requirement (from the request) | Specified in | Proven by |
|---|---|---|---|
| REQ-1 | Popup shows the exact final prompt: grid summary, ordered position + filename list, order/naming instructions, complete editable rules | confirm-preview §1, §4 | `svg_confirm.test.tsx` |
| REQ-2 | Preview equals the sent request; no hidden additions | confirm-preview §3 (C-0…C-4) | `svg_payload`, `svg_confirm` equality tests |
| REQ-3 | Docked at the bottom on every tab; minimise / restore | log-panel §1–2 | `log_ui.test.tsx` (all 5 tabs) |
| REQ-4 | Auto-scroll while at the bottom; stop on scroll-up; resume on return | log-panel §4 | `log_scroll`, `log_ui` |
| REQ-5 | Copy all, Clear, set max displayed/stored entries | log-panel §5 | `log_ui`, `log_store` |
| REQ-6 | Entries carry timestamp, level, feature, action, ids, safe details; cover actions, state, stages, API, retries, errors, tokens, cost | log-contract §2–4 | `svg_runlog`, `log_taps` |
| REQ-7 | Never log keys, tokens, credentials, sensitive payloads | log-contract §5 | `log_redact`, `log_secret_flow` |
| REQ-8 | Persists within limits | log-contract §6–7 | `log_store` |
| REQ-9 | Research first; document ownership, schema, storage, redaction, retention, interfaces; isolated modules; tests | this folder | review of this folder |

## Decisions (reasons live in the linked file)

| # | Decision |
|---|---|
| D1 | **Prepare once, show, send the same object.** `prepareRun` (pure) builds an immutable `PreparedRun`; the dialog renders it; Confirm hands that object to the runner; the runner sends `request` with only the image URL filled in. The runner stops building prompt text. |
| D2 | The prompt is shown as the **four parts it already has**, verbatim, in order. Only the rules are editable, bound to the stored prompt (one stored value, one setter, RULE 10). The order/naming line is shown and locked — the response parser depends on it. |
| D3 | **Byte-compatible:** for the same inputs the text sent is identical to today's (golden test). This design changes where the text is built, not what it says. |
| D4 | A **fingerprint** (existing `fnv1a32` + length over the image-elided request) is shown in the dialog and logged at accept and at every send — audit evidence that sent == shown. Not a security primitive. |
| D5 | **Fail closed:** an unfilled image slot, an unbuildable composite, a source whose `size:mtime` changed since the plan, or a posted request whose measured fingerprint differs from the previewed one sends nothing for that batch and says why. |
| D6 | The log is a **module-scope store above the tabs** (pattern of `state/appstore.ts`), mounted once next to `Shell`; features write through one facade and never import the store. |
| D7 | **Two layers as in every feature:** pure rules in `src/lib/log*.ts` (schema, redaction, buffer, format, scroll, prefs — inside the coverage lane); wiring and UI in `src/log/`. |
| D8 | **Observer, not instrumentation:** the runner stays log-free and emits `RunEvent`s (three new kinds); `svg/runlog.ts` subscribes beside `onRunEvent`. Other features tap existing seams (history `record`/`run`, `appstore.tab`, the four `say`s). |
| D9 | **Redaction in three layers** — closed schema (allow-listed keys, typed `usage`), value scrubbing (registered secrets + shapes + blobs), size caps — applied on write, on read and on Copy-all. The runner passes the log no key, body or image. |
| D10 | **Retention:** ring buffer of the newest N (100/250/500/1000/2000/5000, default 1000) — one value for stored *and* displayed; repeat folding; flood guard; persisted tail ≤ 256 KB in `iconSplitter.log.v1`. |
| D11 | **Follow = scroll position.** No pause checkbox; a pure state machine decides; "Jump to latest" is a scroll shortcut, not a second setting. |
| D12 | **Dock:** `position: fixed` bottom, z-index 10 (below dialogs), height published as `--log-dock-h`; the five fixed-bottom toasts/busy chips clear it. |
| D13 | **Not undoable, not in the timeline:** the log records what `SYSTEM_OF_RECORD.md` §12.5's right column omits. Clear is destructive by design and leaves one `log.clear` breadcrumb. |
| D14 | **No new dependency** (single-file offline build, RULE 20): no virtualisation or clipboard library. |
| D15 | **Legacy files are netted down before any tap** (`runner.ts` 298, `useBatch.ts` 300, `SvgDialogs.tsx` 269 gate-lines; `App.tsx` RULE 16.5), with the existing 517 tests as the equivalence gate where they cover the code — and four new characterisation suites (retry loop, confirm dialog, batch presets, sheets toast) where little or nothing does. |

## Phases — each ends green on `tsc`, lint, quality gate, tests

| Phase | Content | Ships alone? |
|---|---|---|
| P0 | Behaviour-preserving extractions: `svg/send.ts`, `svg/confirm/` (move only), `batch/usePresetActions.ts`, `ui/useToast.ts` — each behind a characterisation suite written first | yes |
| P1 | `composePrompt`, `svgpayload.ts` (pure) | with P2–P3 |
| P2 | Runner consumes `PreparedRun`; `request-sent/retry/ok` events; request id kept; stale-source guard | with P3 |
| P3 | Confirm dialog: prompt blocks, rules editor, pager, JSON, fingerprint | **feature 1 done** |
| P4 | Log pure core (`logentry/redact/buffer/format/scroll/prefs`) | with P5–P6 |
| P5 | `src/log` store, storage, logger, secrets, boot; `writeKey` returns boolean | with P6 |
| P6 | Dock UI mounted in `Workbench`; clearance edits | **feature 2 usable** |
| P7 | Taps and adapters: history, tab, four `say`s, `svg/runlog`, keystore secret registration | connects both |
| P8 | Hardening (flood guard, 5 000-row check), docs, quality re-check | — |

## Assumptions and open questions (defaults chosen so work can start)

| # | Question | Default |
|---|---|---|
| A-1 | Should the order/naming line be editable? | No — locked and labelled "required by the app". |
| A-2 | Do rules edited in the popup apply to this run only? | No — same stored value as the tab textarea; persists at once. |
| A-3 | A source changed since the scan: block or warn? | Block (it also keeps the sidecar fingerprint truthful). |
| A-4 | Dock default | Open on first run; the choice persists. |
| A-5 | Max entries control | A fixed-choice select (no destructive intermediate values while typing). |
| A-6 | Persist the log across reloads? | Yes — newest tail within 256 KB. |

## Current-doc updates when this ships (RULE 17)

`docs/current/SYSTEM_OF_RECORD.md` §2 behaviour, §5 invariants I-19…, §6 storage rows (two keys), §7 modules,
§8 tests, §11 UI inventory · `docs/current/UI_SELECTORS.md` §P dialog rows + new log-dock section ·
`docs/current/QUALITY_RECHECK.md` dated record · `docs/current/AGENT_RULES.md` optional RULE 25 appended
("log what you do, never what you must protect"; the 24 numbers never change). Already done with this
design: the `docs/README.md` map row, the §10 pointer, and the stale `svg-generate-selected` row in
`UI_SELECTORS.md` (it said "arms first"; the code opens the confirm dialog).

## Out of scope

Changing the model-facing prompt text · log export to file, filters, search, row expansion, resizing ·
telemetry of any kind · sidecar schema changes (including storing the provider request id) ·
cross-window sync · virtualisation.
