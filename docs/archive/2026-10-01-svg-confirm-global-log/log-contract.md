# Global log — contract (2026-10-01)

Feature 2 of `docs/archive/2026-10-01-svg-confirm-global-log/design.md`. UI and scrolling are in
`docs/archive/2026-10-01-svg-confirm-global-log/log-panel.md`; module sizes in `modules.md`.

## 1. Purpose

Toasts clear themselves in 3–4 s and live in four unrelated places; the undo timeline holds only undoable
edits. Tab switches, folder picks, batch runs, exports, every API request, retry, token and cost are recorded
nowhere. The log is that record. It is **telemetry, not state**: no feature reads it, it is not undoable, and
it never leaves the browser except as the user's own Copy-all (RULE 20).

## 2. Ownership

| Concept | Owner (single writer) | Readers |
|---|---|---|
| Schema, vocabulary, validators, parse/serialize | `src/lib/logentry.ts` | everyone (types) |
| The entries (the buffer) | `src/log/logstore.ts` — only `logger.append` writes | `useLog`, Copy-all, storage |
| Redaction | `src/lib/logredact.ts`, called by the store on write, by `parseLog` on read, by `formatAll` on export | — |
| Secret registry (memory only) | `src/log/secrets.ts`; `svg/keystore.ts` calls `watchSecret` / `forgetSecret` | `logger` (passes the list to the scrubber) |
| Persistence of both keys | `src/log/logstorage.ts` | — |
| Dock prefs (`max`, `minimized`) | `src/log/logstore.ts`, validated by `lib/logprefs.ts` | dock |
| *What a feature says* | the feature's own adapter: `svg/runlog.ts`, `state/statelog.ts` (history + tab), `logStatus` calls | — |
| Run id | `confirmRun` (`newId("r")`); session id: `logger` at boot | adapters |

Direction is one-way: features → `src/log/logger.ts`. `src/log/**` and `src/lib/log*.ts` import nothing from
`svg/`, `batch/`, `selection/` (a static boundary test enforces it).

## 3. Entry schema

```ts
type LogLevel = "info" | "warn" | "error";
type LogFeature = "app" | "history" | "log" | "sheets" | "batch" | "selection" | "svg";  // selection = both review tabs
type LogValue = string | number | boolean | null;
interface LogIds { run?: string; batch?: string; request?: string; source?: string; hist?: string }
interface LogUsage { input: number|null; output: number|null; total: number|null;
                     cost: number|null; estimated: number|null; currency: string }   // same shape as lib/svgrequest Usage
interface LogInput { level: LogLevel; feature: LogFeature; action: string; message: string;
                     ids?: LogIds; data?: Record<string, LogValue>; usage?: LogUsage; fold?: string }
interface LogEntry { v: 1; id: string; at: string; sid: string; level: LogLevel; feature: LogFeature;
                     action: string; message: string; ids: LogIds; data: Record<string, LogValue>;
                     usage?: LogUsage; repeat?: number }
```

| Field | Rule |
|---|---|
| `id` | `${sid}-${n}`, monotonic per session, never reused |
| `at` | ISO-8601 UTC with milliseconds, from the logger's clock |
| `action` | dotted lowercase `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){0,2}$`, ≤ 40 chars |
| `message` | one line (newlines → space), ≤ 240 chars |
| `ids` | the five keys only; each value ≤ 64 chars. `run` + `batch` together identify a request (`batch_1_4` alone repeats across runs) |
| `data` | ≤ 24 keys, **keys must be in `LOG_DATA_KEYS`**, values primitive, strings ≤ 160 chars, no nesting |
| `usage` | numbers only. `cost` = provider-reported, `estimated` = calculated; never merged or relabelled (I-18). Text uses `costLabel` ("reported" / "Estimated") |
| entry | ≤ 2 KB serialised; over-long text is cut with `…(+N)` |

## 4. Vocabulary (the actions the first release records)

| `feature.action` | Level | ids | `data` keys | Emitted from |
|---|---|---|---|---|
| `app.boot` | info | — | `restored`, `max`, `persist` | `log/boot` |
| `app.tab.open` | info | — | `from`, `to` | `state/statelog` (`installTabLog` subscribes to `appstore`; `bootStores` installs it) |
| `app.storage.failed` | warn | — | `where` | `log/logstorage` (once per transition) |
| `history.entry.push` | info | `hist` | `type`, `origin`, `count`, `gesture` | `state/statelog`, called from `HistoryProvider` `record` (folded per gesture) |
| `history.undo` / `history.redo` | info | `hist` | `type`, `origin` | `state/statelog`, called from `HistoryProvider` `useApply` |
| `history.apply.failed` | error | `hist` | `type` | same |
| `<tab>.status` (sheets, batch, selection, svg) | info / error | — | — | the four `say`s + the six direct toast writes (level from `err`) |
| `batch.process.start` / `.done` / `.stop` | info / warn | — | `selected` / `saved`, `skipped`, `failed` | `useBatch` (module-level, survives unmount) |
| `svg.scan.done` | info / warn | — | `approved`, `missing`, `unreadable`, `corrupt` | `svg/scan` |
| `svg.key.save` / `svg.key.clear` | info / warn | — | `where` = `device` \| `session` — **never the key** | `keyactions` |
| `svg.model.change` | info / warn | — | `model`, `reasoning`, `resetCount` | `useModelSync` (a changed model or a reset note — not the first resolution on mount) |
| `svg.rules.edit` | info | — | `chars`, `hash` — **never the text** (fold 2 s) | `setPrompt` |
| `svg.confirm.open` / `.cancel` / `.accept` | info | `run` (accept) | `selected`, `requests`, `fp` | `actions` |
| `svg.run.start` / `.done` / `.cancel` | info / warn / error | `run` | `sources`, `requests`, `model`, `retries`, `timeoutMs` / `saved`, `failed`, `missing`, `invalid`, `cancelled` + `usage` | `actions` (`done` message = `summaryLine`) |
| `svg.batch.start` / `.done` | info / warn | `run`, `batch` | `count`, `cols`, `rows`, `hash` / `saved`, `failed`, `missing` | `svg/runlog` |
| `svg.request.sent` | info | `run`, `batch` | `attempt`, `of`, `fp`, `chars`, `model` | new `request-sent` event |
| `svg.request.ok` | info | `run`, `batch`, `request` | `status`, `ms`, `attempt` + `usage` | new `request-ok` event |
| `svg.request.retry` | warn | `run`, `batch` | `attempt`, `of`, `kind`, `status`, `waitMs`, `reason` | new `request-retry` event |
| `svg.request.failed` | error | `run`, `batch` | `kind`, `status`, `retryAfterMs`, `count`, `reason` | existing `request-failed` |
| `svg.item.saved` / `svg.item.failed` | info / error | `run`, `batch`, `source` | `position`, `version`, `icons`, `warnings` + `usage` (share) / `position`, `kind`, `reason` | `item-saved` / `item-failed` |
| `log.clear` · `log.max` · `log.copy` | info / warn | — | `removed` · `from`, `to`, `dropped` · `entries`, `ok` | the dock |
| `log.flood` · `log.restore.failed` | warn | — | `suppressed` · — | store / boot |

New `RunEvent` kinds: `request-sent {batchId, attempt, of, fp, chars}`,
`request-ok {batchId, attempt, status, ms, requestId, usage}`,
`request-retry {batchId, attempt, of, kind, status, waitMs, error}` — `error` already redacted by `send.ts`.
`onRunEvent` ignores kinds it does not know, so the UI is unaffected. History entries log their `count`, never their id list (a select-all holds thousands); `bootLog` / `installTabLog` are idempotent, because tests and StrictMode call boot paths more than once.

## 5. Redaction

| Layer | What it does |
|---|---|
| 1 Structure | Unknown `data` keys, nested values and extra `ids` keys are dropped; `usage` is numeric-only (non-finite → null). A secret has no field to live in. |
| 2 Value scrub | Every string (message, data values, ids): registered secrets (exact), `KEY_SHAPE` via `lib/svgsecret.redact`, `Bearer …` values, `name=value` where the name contains key, token, secret, password, auth, credential, cookie or session, URL userinfo and sensitive query values, JWT shape, `data:` URLs and base64 runs ≥ 120 chars → `‹blob N chars›`. |
| 3 Caps | the length limits in §3. |

Applied on write (store), on read (`parseLog` re-sanitises each entry, so an old or tampered payload cannot
reintroduce a secret) and on Copy-all (covers a secret registered after the entry was stored). `sanitizeInput`
is idempotent and never throws; the registry list is passed in (RULE 3), not read from module state.

**Never enters the log, by construction:** the API key and the `Authorization` header (the runner hands the
adapter neither; `send.ts` redacts messages with the key before emitting, as the final-failure path does
today) · prompt text and rules (length + hash only) · image data URLs and composites (hash + byte count) · SVG
documents · provider response bodies (status + kind + redacted ≤ 160 chars) · file contents · directory handles ·
storage dumps. File and folder *names* and relative paths are kept — they identify an image in a run and the log never leaves the browser; contents never are. *Honest limit:* scrubbing is defence in depth — a secret of an unknown shape typed into a field
that is logged verbatim would pass layer 2, which is why layer 1 and the adapters carry the guarantee.

## 6. Retention

| Rule | Value |
|---|---|
| Max entries — stored **and** displayed (one control, RULE 10) | choices 100 / 250 / 500 / 1 000 / 2 000 / 5 000, default 1 000 |
| Ring | newest N kept; oldest dropped on append and at once when the max is lowered |
| Fold | same `fold` key (default `feature\|action\|level\|message`) as the *previous* entry within 2 s → previous gets `repeat+1`, message refreshed |
| Flood guard | > 100 admitted entries in a rolling second → the rest are dropped and one `log.flood` warn records the count (guards the effect-loop class of bug) |
| Persisted tail | the newest entries that fit 256 KB serialised |
| Sessions | each entry carries `sid`; the list draws a break where it changes |
| Clear | empties memory and storage, then adds one `log.clear` breadcrumb |

## 7. Storage

| Key | Contents | Owner |
|---|---|---|
| `iconSplitter.log.v1` | `{ v: 1, savedAt, entries }` | `log/logstorage` |
| `iconSplitter.log.prefs.v1` | `{ v: 1, max, minimized }` (validated, clamped to the choices) | `log/logstorage` + `lib/logprefs` |

Write: debounce 500 ms after the last append; immediately for `error`; flush on `pagehide` and
`visibilitychange → hidden`. `writeKey` returns a boolean (was `void`; callers unaffected). A failed write sets
`persist: "unavailable"`, the dock says so (RULE 2/4), and the next flush retries with half the byte budget.
Read: `parseLog` → `{ entries, status: "empty" | "ok" | "corrupt" }`; per-entry guard keeps the valid ones;
`corrupt` starts empty with one `log.restore.failed` warn — distinct from a first run (RULE 4, RULE 13).
Boot merges `persisted ++ already-buffered`, then trims. *Rejected:* IndexedDB (append-only puts, huge quota) —
needs DB v3, an async hydration race and fake-indexeddb tests for a convenience tail; revisit for file export or
> 5 000 entries. *Limitation:* two browser windows overwrite each other's tail (last writer wins), as session and
history do today.

## 8. Interfaces

| Module | Exports | Contract |
|---|---|---|
| `lib/logentry` | `parseLog`, `serializeLog(entries, budget)`, `isEntry`, `LOG_DATA_KEYS` | pure, never throws |
| `lib/logredact` | `sanitizeInput(input, secrets)` | pure, idempotent |
| `lib/logbuffer` | `admit(buf, entry, ctx)`, `trimTo`, `emptyBuffer` (`ctx = {now, max}`) | pure |
| `lib/logformat` | `formatEntry`, `formatAll(entries, now)` | pure; the Copy-all text |
| `lib/logprefs` | `parseLogPrefs`, `serializeLogPrefs`, `MAX_CHOICES` | pure |
| `log/logger` | `log(input)`, `logger(feature)` → `{info, warn, error}(action, message, extra?)`, `logStatus(feature, msg, err)`, `newId(prefix)` | the only import a feature needs; never throws; ≤ 3 params |
| `log/secrets` | `watchSecret`, `forgetSecret` | memory only |
| `log/logstore` | `getLog`, `subscribeLog`, `clearLog`, `setMax`, `setMinimized`, `copyAllText`, `resetLog` (tests) | module scope |
| port | `type LogSink = (i: LogInput) => void` | injected into adapters; tests pass a recorder |

## 9. Invariants

| id | Statement |
|---|---|
| L-1 | No entry is stored unsanitised: the store is the only writer and `sanitizeInput` runs first. |
| L-2 | `log()` never throws and never blocks a feature (RULE 9); internal failures increment a `dropped` counter the dock shows (RULE 2 — no empty catch). |
| L-3 | The log is not a timeline: not undoable, not replayed, never read by features. |
| L-4 | Every `say` — the four implementations and the six direct writes — is mirrored 1:1 (level from `err`). |
| L-5 | Usage/cost keep I-18: reported and Estimated are never merged; the basis is in the text. |
| L-6 | Stored = displayed = copied: one max, one array (RULE 24). |
| L-7 | The log survives tab switches and unmounts: a run started on Generate SVG keeps logging after its panel is gone. |
| L-8 | Local only (RULE 20): no network call, no analytics; the one export is the user's clipboard. |
| L-9 | After a restart the entries return within limits; a corrupt payload costs one ignored load and one warn (RULE 13). |
