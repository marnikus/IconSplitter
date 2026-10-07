# AGENTS.md — Icon Splitter (read this first · ~5 minutes)

Browser app (React 19 + Vite 7 + TS + Tailwind 4) that splits icon sheets,
reviews pairs, generates SVGs and prepares uploads — all client-side, built
into one self-contained `dist/index.html`. Rules: `docs/current/AGENT_RULES.md`.

## 0. Environment (pinned — do not guess)

- Node `22.12.0` (`.nvmrc`; engines allow `^20.19.0 || >=22.12.0`), npm 10 (`packageManager`).
- Install once: `npm run setup` (= `npm ci --prefer-offline`) — ~6 s warm, 1–2 min cold.
  `.npmrc` is engine-strict; the lockfile is the contract. Never plain `npm install` over a
  foreign-platform `node_modules/` — `npm ci` replaces it cleanly.
- Never commit `node_modules/`, `dist/`, `coverage/` — `.gitignore` names them; HEAD tracks none.
- Tests run in happy-dom: **no browser download is needed**. A real-browser probe is OPTIONAL
  (see `docs/current/CODE_VERIFICATION.md` §9); the suite is the acceptance gate (RULE 8).
- Secrets: none in the repo. The Requesty/Gemini keys live in the browser secret store
  (`src/state/safestorage.ts`). Never create/touch `.env*`, `*.key`, `secrets.json` —
  `tests/secret_hygiene.test.ts` scans every tracked AND untracked text file.
- Shallow sandbox clone? `git fetch --depth=100 origin main`, or gate with an explicit base:
  `node tools/quality.mjs --changed --allow-legacy --base origin/main` (tree diff, no merge-base).

## 1. Commands (exact; times measured in a warm Linux sandbox, approximate elsewhere)

| Goal | Command | ~Time |
|---|---|---|
| Types | `npx tsc --noEmit` | 10 s |
| Lint | `npm run lint` | 7 s |
| RULE 16 gate on changed files | `npm run quality:changed` | 1–3 s |
| TDD loop | `npx vitest run tests/<area>*.test.ts` | seconds |
| Whole suite, quiet | `npm run test:fast` | ~75 s (124 files / 1320 tests) |
| Before every commit | `npm run verify:fast` | ~1.9 min (suite runs once, via coverage lane) |
| Before push (hook parity) | `npm run verify` | ~3.1 min (adds the standalone suite lane) |

`tools/verify.mjs` is the one cross-platform runner (no bash needed); the pre-push hook execs it.

## 2. What to read, by task (do NOT read everything)

- Always: this file + `docs/current/AGENT_RULES.md` — the rule for your task, §16 (hard
  limits, overrides) and §18 (ideal sizes).
- Touching a tab: its section in `docs/current/SYSTEM_OF_RECORD.md` (index at the top;
  behaviour §2, invariants §5 as `I-<n>`, storage §6) and its handle section in
  `docs/current/UI_SELECTORS.md`.
- Verification questions: `docs/current/CODE_VERIFICATION.md` only.
- NEVER as context: `docs/current/QUALITY_RECHECK.md` (append-only ledger — append one dated
  entry at the end, read none of it), `docs/archive/**` (history; read one doc only when the
  task names it), `design/**/*.html` (build from SPEC/current docs), `dist/`.

## 3. Where things live

- `src/lib/` pure logic (incl. `src/lib/upload/`) — tests required, ≥ 80 % line coverage
  enforced (`vitest.config.ts`).
- One directory per tab: `src/App.tsx` (Single sheets), `src/batch/`, `src/selection/`,
  `src/selectionv2/`, `src/svg/` (Generate SVG), `src/upload/` (SVG to upload).
- Shared: `src/ui/` (Workbench shell + atoms), `src/state/` (session, global undo timeline,
  secret store), `src/log/` (global activity log), `src/utils/`.
- Tab registration + session restore: `TABS` in `src/ui/Workbench.tsx` + `src/state/`.
- Tests: `tests/<module>.test.ts(x)` — real logic, synthetic data, never mock `src/lib`
  (RULE 8). Tooling contracts are characterized too (`tests/verify_runner.test.ts`,
  `tests/quality_base.test.ts`).
- Design handoffs: `design/<tab>/SPEC.md` (+ html/png reference) — contract in
  `design/README.md`. Plans/root-cause docs: `docs/archive/<YYYY-MM-DD>-<topic>/design.md`.

## 4. Hard limits (RULE 16 — `tools/quality.mjs` enforces, baseline ratchet included)

function/component ≤ 30 lines (aim 4–20) · params ≤ 4 (group into domain types, never
`options: any`) · CC ≤ 10 · nesting ≤ 4 · new file ≤ 300 lines (aim 150–300) ·
hooks/component ≤ 15 (aim ≤ 10) · no `fooPart1` helpers · legacy files may hold their
recorded maxima but never grow. Over the ideal with reason:
`// ideal-size: <n> lines reason=<constraint>`. Over a hard line (rare):
`// quality-override: <metric>=<n> reason=<≥ 20 chars naming a real constraint>`.

## 5. Definition of done (every change)

1. Tests first (red), then code (green): `npx vitest run tests/<file>`.
2. `npm run verify:fast` clean at every commit; `npm run verify` before push.
3. Same commit (RULE 17): the `SYSTEM_OF_RECORD.md` rows you touched, new handles in
   `UI_SELECTORS.md`, a `docs/archive/<date>-<topic>/design.md` when the design moved
   complexity across files, its one-line row in `docs/README.md`, and one dated entry
   appended to `QUALITY_RECHECK.md` with the measured gate numbers.
4. Commit message: `<type>(<area>): <what> (I-<n>… when invariants moved)` + a
   `Verified:` line (lanes run, test count, build size).

## 6. Conventions

- Handles: `data-testid="<prefix>-<thing>"` — `tab-` (Workbench), `batch-`, `sel-`
  (Selection), `v2-` (Selection V2), `svg-` (Generate SVG), `upload-` (SVG to upload),
  shared `log-`, `hist-`, `preset-`; sheets uses bare ids (`file-input`, `export-*`).
  Semantic selectors first in tests (RULE 21); new handles go into `UI_SELECTORS.md`.
- Every user-visible step reports through the toast/global log (RULE 2); empty ≠ broken
  (RULE 4); interruption ≠ failure (RULE 7); long loops yield + isolate per-item failure
  (RULE 5).
- Persistence: `iconSplitter.<area>.v<n>` keys, validated on read, corrupt → defaults +
  one honest warning (RULE 13); full map in `SYSTEM_OF_RECORD.md` §6.
- Images and SVG bytes never leave the browser (RULE 20); exports pass the verification
  gate (RULE 15), are atomic and collision-suffixed (RULE 23); undo is ONE global timeline
  (RULE 12, `src/state/HistoryProvider.tsx`).
