# Environment-setup performance — follow-ups, re-measured (2026-10-08)

**Plan of record. This change ships documentation only — no `src/` or `tools/`
code.** It answers the same question as
`archive/2026-10-07-env-setup-performance/design.md` — what does an agent or a
sandbox pay before its first productive edit — one day later, on this branch
(`c075a9d`), with every number re-measured here rather than carried over.

Method: the 2026-10-06 report's O1–O11 items were each checked against the
working tree (a file exists / a command was run / an output is quoted), then
the gates were run end to end. Two new findings are measured here for the
first time (E1, E5); the rest are status or drift.

---

## 1. What the 2026-10-07 change actually delivered — verified today

| Item | Check run today | Result |
|---|---|---|
| O1 untrack `node_modules/`, `dist/` | `git ls-files \| grep -c "^node_modules/"` and `"^dist/"` | **0** and **0** — done in this lineage |
| O2 root `AGENTS.md` | `ls -la` | present, 5,978 B — done |
| O3 pin the toolchain | `cat .nvmrc .npmrc`, `package.json` | `22.12.0`; `engine-strict=true`; `engines` + `packageManager: npm@10.9.2`; `npm run setup` — done |
| O3 install cost | `npm ci --prefer-offline --no-audit --no-fund` | `added 280 packages in 6s` (warm) — matches the doc |
| O5+O9 one cross-platform runner | `tools/verify.mjs`, `package.json` scripts | present with `--plan/--json` seam; `verify` = `--full`; `tools/pre_push_check.sh` is gone — done |
| O8 shallow-safe gate | `node tools/quality.mjs --changed --allow-legacy` on this shallow clone (`git rev-parse --is-shallow-repository` → `true`) | prints `note: shallow clone — no merge-base with origin/main…` + the `git fetch --depth=100 origin main` hint, then `GATE PASSED` — done |
| O7 design handoff | `design/` tree | `design/README.md` present, no `design temp/`, 122 tracked files — done |
| O11 doc map | `docs/README.md` | one-line archive rows, AGENTS.md listed — done |
| O10 devcontainer | `.devcontainer/devcontainer.json` | present — done |
| **O10 CI workflow** | `ls .github` | **does not exist.** The workflow is still staged at `archive/2026-10-07-env-setup-performance/verify.yml` (836 B) because that session's GitHub App token lacked `workflows` permission — **not done** (E3) |
| **O4 split SOR / archive the ledger** | `wc -c -l docs/current/*.md` | **not done, and it grew** — see §2 E4 |

`docs/current` today: AGENT_RULES 21,882 B / 333 ln · CODE_VERIFICATION
9,783 B / 232 ln · SYSTEM_OF_RECORD **137,187 B / 1,886 ln** · UI_SELECTORS
45,209 B / 612 ln · QUALITY_RECHECK **126,947 B / 2,075 ln** =
**341,008 B / 5,138 lines** (2026-10-07 recorded ≈ 314 KB / 4,743 lines).

Baseline gates, run today for the record: `npx tsc --noEmit` clean ·
`npm run lint` **0 errors, 9 legacy warnings** (one of them
`src/upload/runmetadata.ts:84` complexity 11 > 10) · quality gate
`GATE PASSED` (no `src/` files changed) · suite **128 files / 1376 tests
passed, 82.21 s** · coverage statements 95.74 % / branches 89.27 % /
functions 96.82 % / lines 97.75 % · `npm run build` →
`dist/index.html` 1,485.05 kB (gzip 426.35 kB), 5.35 s.

## 2. New findings, measured here

**E1 [P0] the suite spends 41 % of its tracked time creating happy-dom — and
it is recoverable.** The baseline run ends with vitest's own advice:
`Environment happy-dom was created 128 times · 28.35 s total, 41% of tracked
time`, suggesting `pool: 'vmThreads'` or `isolate: false`. Both were measured:

| Command | Files / tests | Duration | Verdict |
|---|---|---|---|
| `npx vitest run` (today's config) | 128 / **1376 passed** | 82.21 s | baseline |
| `npx vitest run --pool=vmThreads` | 128 / **1376 passed** | **33.37 s** | **−59 %, nothing lost** |
| `npx vitest run --no-isolate` | 25 files failed / **86 tests failed**, 1290 passed | 148.30 s | **rejected — shared environment leaks state** |
| `npx vitest run --coverage` | 128 / 1376 passed | 88.20 s | coverage baseline |
| `npx vitest run --coverage --pool=vmThreads` | 128 / 1376 passed, identical coverage numbers | 85.78 s | no regression, no gain |

The honest reading: `pool: "vmThreads"` halves the command agents run most
(the TDD loop, `npm run test:fast`, and `verify --full`'s standalone lane) and
leaves the coverage lane — which `verify:fast` runs — essentially unchanged,
because that lane is bound by v8 coverage collection, not by environment
creation (`environment` drops from 38 % to 1 % and `worker` rises to 43 %).
`isolate: false` is not an option: it breaks 86 tests. So the change is one
line in `vitest.config.ts`, guarded by a contract test (E1 is a config change,
and a config nobody tests drifts).

**E5 [P1] `knip` cannot run in this sandbox, and it never could — the cause is
now known.** Reproduced today: `npx knip --no-progress` exits 1 with
`RangeError: Array buffer allocation failed` at
`node_modules/oxc-parser/src-js/raw-transfer/common.js:294`
(`new ArrayBuffer(ARRAY_BUFFER_SIZE)`). `ARRAY_BUFFER_SIZE = BLOCK_SIZE +
BLOCK_ALIGN` and `node_modules/oxc-parser/src-js/generated/constants.js:10`
sets `BLOCK_SIZE = 2147483632` — a **2 GiB raw-transfer buffer, cached per
core**, on a sandbox with **3,940 MB total** (3,653 MB free). Versions: knip
6.39.0, oxc-parser 0.150.0, node v22.22.3. This is not a heap limit, so
`--max-old-space-size` cannot help. Six of the nine `knip` mentions in
`QUALITY_RECHECK.md` already record the failure and substitute an
export-by-export consumer check; the dependency is still installed by every
`npm ci`. Decide it, don't keep
rediscovering it: either pin a knip whose parser path fits, run knip only in
CI (where memory is the runner's), or drop it and write the substitute check
into `CODE_VERIFICATION.md` as the documented lane.

**E6 [P2] the jscpd number has drifted and nobody owns it.**
`npx jscpd src --min-tokens 60` today: **33 clones / 365 duplicated lines
(1.26 %)** over 239 files — 12 of them in `src/index.css` alone (143 lines,
8.69 %). The last `QUALITY_RECHECK.md` entry recorded 12 clones for `src`.
Both numbers are honest; neither is a budget. `CODE_VERIFICATION.md` should
carry one recorded baseline (count and where it lives) so an entry can say
"no new clone" against something fixed.

**E8 [P2] doc drift in the two files agents read first.**
`AGENTS.md` §1 says `~75 s (124 files / 1320 tests)`; today it is 128 / 1376 /
82.2 s (and 33.4 s after E1). `SYSTEM_OF_RECORD.md` §2 still states the
settings ranges as padding 0–40, stroke 0.2–8 pt, MP 1–30, quality 0.98, while
`src/lib/upload/settings.ts` says 0–50, 0–24, 1–64 and 0.5–1 — carried debt
since the 2026-10-08 entry, and the most expensive kind of drift because §2 is
the authoritative section.

## 3. Decisions

| Id | Action | Effort | Fixes |
|---|---|---|---|
| E1 | `pool: "vmThreads"` in `vitest.config.ts` + `tests/vitest_config.test.ts` | 20 min | the 49 s per suite run |
| E2 | correct `AGENTS.md` §1's counts/times after E1 | 10 min | E8 (half) |
| E3 | install the staged CI workflow, or record it as an owner step with the exact command | 15 min (owner) | O10 |
| E4 | split `SYSTEM_OF_RECORD.md` into an index + `docs/current/sor/*.md`, move the QUALITY_RECHECK ledger to `docs/archive/` | 2–3 h | O4, F2 |
| E5 | decide knip: CI-only, version pin, or documented substitute | 30 min | the 12 stale ledger notes |
| E6 | one recorded jscpd baseline in `CODE_VERIFICATION.md` | 20 min | E6 |
| E7 | remove or externalize `design/Arena setup analyze/` (33 MB of the 122 tracked design files) | 10 min (owner) | repo weight |
| E8 | fix SOR §2's settings ranges | 10 min | E8 |

E4 is the only large one and stays owner-approved, exactly as 2026-10-07
decided; the concrete shape is in §5. Everything else is an hour of work
between them.

## 4. TDD plan

`tests/vitest_config.test.ts` — imports the real `vitest.config.ts` (no mocks,
RULE 8) and asserts the contract that makes E1 safe:

* `config.test.pool === "vmThreads"`;
* `config.test.isolate` is not `false` (the measured 86-test failure mode);
* `config.test.environment === "happy-dom"` and the `tests/**` include pattern
  is unchanged, so the suite that runs is still the suite that is documented;
* the coverage thresholds (`lines: 80`) and the `src/lib/**` include are
  unchanged — a pool change must never quietly relax the ratchet.

Nothing else here is testable code: E2/E4/E6/E8 are docs, E3/E7 are owner
steps, E5 is a dependency decision.

## 5. Implementation steps

1. **E1** — add `pool: "vmThreads"` to `vitest.config.ts`; write
   `tests/vitest_config.test.ts` first (red), then the config line (green);
   re-run the whole suite and record the new duration in `AGENTS.md` §1 and
   `CODE_VERIFICATION.md` (E2 in the same commit — the numbers and the change
   that produced them belong together).
2. **E8** — SOR §2's four ranges from `settings.ts` (read the constants, do
   not retype them from memory).
3. **E6** — run jscpd, record the baseline and its command in
   `CODE_VERIFICATION.md`.
4. **E5** — try the chosen knip strategy once, record the outcome; if it still
   cannot run here, write the substitute check down as the lane and say which
   environments run the real one.
5. **E3** — owner installs `verify.yml` at `.github/workflows/verify.yml`
   (needs `workflows: write`); until then the staged copy and this row are the
   record.
6. **E4** — its own change, own commit series: `SYSTEM_OF_RECORD.md` becomes a
   ≤ 150-line index (state model, the `I-<n>` list, pointers), one
   `docs/current/sor/<domain>.md` per mode ≤ 200 lines
   (sheets / batch / selection / selectionv2 / svg / upload / shell), and the
   QUALITY_RECHECK ledger moves to `docs/archive/quality-recheck/` with a
   one-line pointer and a fresh 200-line current file. Rule 17 keeps the
   archived copies unedited. Invariant NUMBERS and their anchors must survive
   verbatim — many branches quote `I-<n>`.
7. **E7** — owner decision on the 33 MB saved web page.

## 6. Acceptance

1. `tests/vitest_config.test.ts` red before the config line, green after.
2. The whole suite passes under the new pool: **1376 tests, 128 files**, with
   coverage numbers unchanged from today's 95.74 / 89.27 / 96.82 / 97.75.
3. `npm run verify:fast` and `npm run verify` both pass through
   `tools/verify.mjs` after the change (dogfood).
4. `AGENTS.md` ≤ 120 lines and true: every count and duration in §1 matches a
   run made in this change, not an inherited one.
5. One dated `QUALITY_RECHECK.md` entry with the measured numbers, and a
   `docs/README.md` row for this plan.

## 7. Not done here, and why

* **No production code** — this is the plan; the stock-hygiene plan
  (`archive/2026-10-08-stock-hygiene/design.md`) is its sibling and also
  ships as a doc.
* **`git filter-repo` history purge** — owner step after every arena branch
  merges; it rewrites history and cannot ride along.
* **Timings are warm-cache numbers on one sandbox** (node v22.22.3, 3,940 MB
  RAM, a depth-1 clone). They are reproducible with the exact commands quoted
  above, and they will differ elsewhere; `AGENTS.md` keeps marking durations
  approximate.
* **`verify:fast` was not re-timed as a whole** — only its coverage lane was
  measured (88.20 s → 85.78 s), so the plan claims a saving for the TDD loop
  and for `verify --full`'s standalone lane, and none for `verify:fast`.
