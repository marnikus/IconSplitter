# Test cases — what each test must say (2026-10-01)

Part of `docs/archive/2026-10-01-svg-confirm-global-log/test-plan.md` (protocol, characterise-first extractions,
phase order, kill list, VERIFY matrix). Written *before* any code; a case here is a sentence a test must prove, and a
test that would pass with its feature deleted does not count (RULE 8). Phase → files:
P0 `svg_retry` · `svg_confirm` (today's cases) · `batch_presets` · `sheets_toast`; P1 `svg_payload`; P2 `svg_send`,
`svg_retry`; P3 `svg_confirm`; P4 `log_entry`, `log_redact`, `log_buffer`, `log_format`, `log_scroll`, `log_boundaries`;
P5 `log_store`; P6 `log_ui`; P7 `log_taps`, `svg_runlog`, `log_secret_flow`.

## Cases by file (≈ 160 new tests: 517 → ≈ 680)

**`svg_payload`** — batch text equals the golden `batchPrompt` string; single text equals the golden
`singlePrompt` string and the kind flips at exactly one item · blocks carry ids and only `rules` is editable ·
rules trimmed in the text, untrimmed in `PreparedRun.rules` · 9 sources at 4 per request give 4 / 4 / 1 and the
last uses the single template · the request holds exactly what the model accepts (reasoning: `max_completion_tokens`,
no temperature; classic: temperature + `max_tokens`; effort only when offered) · the image slot is `IMAGE_SLOT`
and `assertSendable` throws on it · `withImage` changes only the image URL and throws on zero or two slots ·
`elideImage` never mutates · the fingerprint is stable and moves with one character of rules, model, name or
position · `describeRequest` is read from the object · `wireHeaders` lists `Content-Type` and `Authorization` only.

**`svg_retry`** (P0 characterises today's loop; P2 adds the events) — the six cases of `test-plan.md` §2, then: `request-retry` carries
the attempt and the wait · every attempt emits `request-sent` with the same measured fingerprint.

**`svg_send` / `svg_cost_io`** — the posted body string equals `JSON.stringify(withImage(...))` (C-3) · every
retry posts the identical body · `request-sent → request-retry → request-ok` in order with attempt numbers and no
key in any event · a 429 emits `request-retry` with `waitMs` = retry-after · the provider request id reaches
`request-ok` · a changed `size:mtime` refuses that batch (`payload`), posts nothing and the next batch still runs
(C-4) · an unfilled image slot is never posted · a plan item whose source left the selection fails the batch.

**`svg_confirm`** (real panel + real runner + fake fetch; the `test-plan.md` §2 cases first, then) — four blocks on screen, in order, verbatim · **the
blocks joined with the single separators equal the text posted to the provider** · editing the rules in the popup
changes the tab textarea in the same render and the next send carries the edit (C-2, C-6) · editing the tab textarea
while the popup is open re-derives the preview · the pager shows each request's own text, the last of nine shows the
single template · empty rules disable *Generate now* and say why (C-5) · the JSON view equals the posted body
except the image URL and shows the key as hidden · Cancel and Close send nothing · a catalog refresh landing while
the dialog is open changes the sampling line and the click sends what is on screen · the contact-sheet preview
uses the shown request's plan items · Copy writes the exact text; a blocked clipboard says so.

**`log_entry`** — round trip · corrupt JSON → `corrupt`, empty/null → `empty` (distinct, RULE 4) · wrong version →
`corrupt` · damaged entries dropped, valid ones kept · `serializeLog` drops the oldest until the byte budget fits ·
an over-2 KB entry is cut, not dropped · bad level/feature/action rejected · `__proto__` and out-of-list keys dropped ·
prefs: invalid `max` → default, non-boolean `minimized` → default, `max` only from `MAX_CHOICES`.

**`log_redact`** — masks Requesty- and `sk-`-shaped keys · masks a registered key of *no* known shape · masks `Bearer`
values and `name=value` for key/token/secret/password/auth/cookie/session · URL userinfo and sensitive query values ·
data URLs and base64 runs → `‹blob N chars›` · JWT shape · unknown data keys, nested values, extra ids dropped ·
`usage` numeric-only · every cap · idempotent · never throws (circular object, throwing getter, huge string) ·
**false-positive guard:** file names, versions, 8–16-hex fingerprints and `usage` token counts survive untouched.

**`log_buffer`** — ring keeps the newest N · lowering the max trims at once · fold within 2 s, not beyond it, not
across different messages · gesture `fold` key · flood > 100/s drops the rest and records one `log.flood` with the
count; the window rolls · order stable. **`log_format`** — line shape, ids/data/usage text, reported vs Estimated,
`×N`, `formatAll` header, a secret registered *after* storage is masked at export, newlines flattened.

**`log_scroll`** (pure numbers) — `EPS` boundary (4 px at bottom, 5 not) · a list with no scrollbar counts as at bottom ·
every row of the §4 table in `log-panel.md` · intent-up pauses before any scroll event · appends while paused count
levels · minimised append · restore · clear.

**`log_store`** — append stamps id/at/sid and sanitises · one notification per append, stable snapshot when nothing
changed · ring at each `MAX_CHOICE` · persisted ≤ max entries and ≤ 256 KB · 3 appends in 500 ms → one write, an error
flushes at once, `pagehide` flushes · reload restores the newest within limits with a new `sid` · corrupt → empty +
one `log.restore.failed`, absent → silent · `setItem` throws → memory intact, `persist: "unavailable"`, one
`app.storage.failed`, retry with half the budget · `getItem` throws → works in memory · `log()` never throws and counts
`dropped` · Clear empties memory and storage and leaves one breadcrumb · Copy text equals `formatAll(stored)` ·
register/forget secret changes later masking.

**`log_ui`** (real `Workbench`) — the dock exists on every id in `TAB_IDS` and shows the same entries after each switch
(L-7) · minimise/restore flips `aria-expanded`, persists across a remount, publishes `--log-dock-h` · an append is
visible in the same tick (RULE 24) with level word + glyph · Copy all hands the clipboard `copyAllText()`, blocked →
message · Clear · lowering Max to 100 shows ≤ 100 rows at once and persists · follow: pinned on append → scroll up
(stubbed geometry) stops pinning, counts unseen, shows *Jump to latest* → back at bottom pins again and zeroes ·
wheel-up pauses before the scroll event · minimised appends do not pin, restore does · session break · empty vs
restore-failed vs not-persisted notes differ · `role="log"` with `aria-live="off"`; the status line announces ≤ once/s.

**`log_taps` / `svg_runlog` / `log_secret_flow`** — tab switch → `app.tab.open` · history push/undo/redo/apply-failed
logged; slider ticks fold into one entry · each of the four panels' toasts, **including the six direct writes**, appears
once with equal text and level from `err` (L-4) · key save/clear logs `where` only and (un)registers the secret ·
`svg.model.change` · table-driven: every `RunEvent` kind → expected feature/action/level/ids, data keys ⊆
`LOG_DATA_KEYS`, reported vs Estimated kept apart · **end to end:** a provider 401/500 whose body echoes the key, an
`Authorization` header and a data URL → afterwards neither `getLog()`, any `localStorage` value nor Copy-all contains
them; a key pasted into the rules logs `chars` and `hash` only.

**`log_boundaries`** (static, like `secret_hygiene`) — the import and name rules of `modules.md` §1. Existing tests
that change: `svg_cost_io` (the helper passes `prepared`; its hand-built `SvgSource` carries `fingerprint: "20:3100"` while
`FakeFile.getFile()` reports `size` = text length, and the scan derives fingerprints from `getFile()` — the fixture must do the
same or the C-4 guard rightly refuses it), `workbench_ui` (+ dock present). All other existing tests,
including `svg_lib` prompt tests (they become the C-0 evidence), stay untouched.
