# Environment-setup performance — phase 2 plan (2026-10-08)

**Plan only. No code in this change** (RULE 16.6 step 2 — design in a doc
first). Every number below was **measured in this sandbox on 2026-10-08** on
`arena/0e47c2f0-iconsplitter` @ `a986951` (base `arena/b4d96c50-iconsplitter`,
a depth-1 shallow single-branch clone; 2 CPU, 3.9 GB RAM, warm npm cache).
Each measurement names the command that produced it.

---

## 1. Correction of the record

The 2026-10-06 "ARENA AGENT ENVIRONMENT-SETUP REPORT" studied `origin/main`.
**Most of it is already built on this lineage** by
`docs/archive/2026-10-07-env-setup-performance/design.md`. Re-verified here:

| Report item | Claim | Verified on this branch (2026-10-08) | Status |
|---|---|---|---|
| O1 / F1, F7 | `node_modules/` + `dist/` tracked | `git ls-files \| grep -cE '^(node_modules\|dist)/'` → **0**; 559 tracked files total | **done** (on this lineage only — see F-A) |
| O2 / F3 | no root agent entry point | `AGENTS.md` exists, **96 lines / 5,978 B** (its own "≤ 120 lines" claim holds) | **done** |
| O3 / F4 | toolchain unpinned | `.nvmrc` `22.12.0` · `.npmrc` (fund/audit/update-notifier off, prefer-offline, engine-strict) · `engines` `^20.19.0 \|\| >=22.12.0` · `packageManager` `npm@10.9.2` · `npm run setup` | **done, 2 files left** (F-C) |
| O5 / F5 | verify runs the suite twice | `node tools/verify.mjs --plan` → **5 lanes, one** vitest lane; `--full` → 6 lanes, two | **done** |
| O6 / F6 | browser probe per session | `CODE_VERIFICATION.md` §9 declares it optional; no playwright/puppeteer dep | **done (by declaration)** |
| O7 / F8 | design handoff = raw HTML, folder with spaces | `design/` (renamed), `design/README.md` SPEC contract | **done** |
| O8 / F9 | gate assumes a full clone | `tools/quality.mjs` has `--base`, `--files`, shallow hint | **built, but see F-B** |
| O9 / F10 | verify needs bash | `tools/verify.mjs` (node); `tools/pre_push_check.sh` is gone; `tools/hooks/pre-push` execs node | **done** |
| O10 | devcontainer + CI | `.devcontainer/devcontainer.json` present; **`.github/` absent here and 404 on `main`** | **half done** (F-D) |
| O11 / F11 | doc map rows are paragraphs | `docs/README.md` rows are one-liners | **done** |
| O4 / F2 | `docs/current` ≈ 277 KB | now **336,370 B / 5,065 lines** — it grew | **not done** (F-E) |

So phase 2 is not "build the report". It is: **fix one gate that lies, finish
three small pins, run the two measured speed experiments, do the doc split that
was deferred, and hand four owner steps over with their evidence.**

## 2. Measured baseline (all commands run here)

| What | Command | Measured |
|---|---|---|
| Install | `time npm run setup` | **7.7 s**, 280 packages (warm cache) |
| Types lane | `time npx tsc --noEmit` | **10.6 s** |
| Lint lane | `time npm run lint` | **7.2 s** |
| Quality lane (changed) | `time npm run quality:changed` | **0.57 s** |
| Suite | `npm run test:fast` | **128 files / 1374 tests / 86.76 s** |
| Coverage lane | inside `verify:fast` | **110.5 s** (= +23.7 s over the plain suite) |
| Build lane | inside `verify:fast` | **6.8 s** → `dist/index.html` 1,484.03 kB (gzip 425.99 kB) |
| Fast gate total | `time npm run verify:fast` | **2 m 16.7 s** baseline · **2 m 10.5 s** re-run on the changed tree · `ALL LANES PASSED` |
| Pack | `git count-objects -vH` | **48.59 MiB / 12,972 objects** |

Blob accounting (`git cat-file --batch-check --batch-all-objects`, deduped,
compressed, path-attributed):

| Slice | Size | Share |
|---|---|---|
| `node_modules/` + `dist/` (main's tree only) | **39.7 MiB** | 83.5 % |
| `design/Arena setup analyze/` | **6.1 MiB** | 12.8 % |
| everything else (`src`, `docs`, `tests`, `tools`, other `design/`) | **1.7 MiB** | 3.7 % |

Clone cost, measured twice the same way (`git clone --depth=1`):

| Target | Wall clock | Working tree | `.git` | Files checked out |
|---|---|---|---|---|
| `main` | 3.56 s | **246 MB** | 43 MB | **11,835** (of which `node_modules` 200 MB) |
| `arena/b4d96c50-iconsplitter` | 1.14 s | **46 MB** | 8.0 MB | **584** |

Doc context cost (`wc -lc docs/current/*.md`):

| File | Bytes | Lines | RULE 18 ideal |
|---|---|---|---|
| `SYSTEM_OF_RECORD.md` | 136,251 | **1,873** | 60–200 |
| `QUALITY_RECHECK.md` | 123,608 | **2,019** | 60–200 (append-only — never read) |
| `UI_SELECTORS.md` | 44,846 | 608 | 60–200 |
| `AGENT_RULES.md` | 21,882 | 333 | 60–200 (dense, not padded) |
| `CODE_VERIFICATION.md` | 9,783 | 232 | 60–200 |
| **total** | **336,370** | **5,065** | — |

## 3. Remaining findings

**F-A [HIGH] `main` still carries everything the report complained about.**
`gh api repos/marnikus/IconSplitter/contents?ref=main` lists `node_modules`,
`dist` and `design temp`; `contents/AGENTS.md?ref=main` → **404**. Main's tip is
`5e635ce`, 2026-10-06, "Merge branch 'arena/01a0f966-iconsplitter'". There are
**35 `arena/*` remote branches** and **1 open PR** (#1, `arena/973cc25e`). An
agent that clones `main` today gets the 246 MB / 11,835-file checkout and none
of the pins. All phase-1 value is stranded on branches.

**F-B [HIGH] The default fast gate checks nothing in a sandbox and reports
PASS.** Reproduced here, not inferred:

```text
$ git rev-parse --is-shallow-repository      → true
$ git merge-base origin/main HEAD            → exit 1
$ npm run quality:changed
  note: shallow clone — no merge-base with origin/main; comparing vs HEAD only…
  Changed files vs HEAD: (none)
  GATE PASSED                                 ← exit 0, zero files gated
$ node tools/quality.mjs --changed --allow-legacy --base origin/main
  …97 files listed, all [OK], GATE PASSED     ← exit 0, 97 files gated
```

The hint is honest, but `verify:fast` still prints `ALL LANES PASSED` for a
quality lane that gated **0 files**. Tree-vs-tree diffing works fine in this
shallow clone, so the correct behaviour is available — it is just not the
default. This is a correctness bug in the gate, and it costs nothing to fix.

**F-C [MEDIUM] Two `.bat` files still install unpinned.**
`run_app.bat:21-24` and `run_dev_server.bat:21-24` call `npm install`, while
`install_dependencies.bat:30` and `README.md:92` correctly say `npm ci`. A
Windows user who double-clicks `run_app.bat` gets the non-reproducible install
the pin exists to prevent. (`.devcontainer` duplicates the `npm ci` string
instead of calling `npm run setup` — same one-source-of-truth problem.)

**F-D [MEDIUM] CI is written but not installed.** No `.github/` at HEAD or on
`main` (404 both). The workflow is staged at
`docs/archive/2026-10-07-env-setup-performance/verify.yml`;
`CODE_VERIFICATION.md` §"CI equivalent" records that the 2026-10-07 agent push
was rejected for lack of the `workflows` permission. **This session's token is
different but not proven**: `gh api repos/marnikus/IconSplitter` reports
`permissions: {admin: true, push: true}` while `gh api /user -i` returns an
**empty `X-Oauth-Scopes`** header (fine-grained PAT). Whether it carries
*Workflows: read and write* is **unchecked** — S12 probes it before assuming.

**F-E [MEDIUM] `docs/current` is 336 KB and grew 8 % since the report.**
`SYSTEM_OF_RECORD.md` is 1,873 lines against RULE 18's 60–200. Structure
(`grep -n '^## '`): §1–§11 = **1,293 lines / 100,963 B** of live truth;
**§12–§20 = 580 lines / 35,288 B** of dated narrative — and every one of those
nine sections has a matching `docs/archive/<date>-<topic>/` folder already
(§12→`2026-10-01-history-session`, §13→`2026-10-05-global-log`,
§14→`2026-10-05-folder-path-copy`, §15→`2026-10-05-per-pair-metadata`,
§16→`2026-10-05-folder-bar`, §17→`2026-10-05-picked-output-root`,
§18→`2026-10-05-root-independent-pairs`, §19→`2026-10-05-path-capture-recovery`,
§20→the 2026-10-07 key-vault work). RULE 17: `docs/current/` holds only what is
true today; a doc that no longer describes reality becomes a **one-line
pointer**, never a deletion.

**F-F [LOW] `AGENTS.md` numbers have already drifted.** It states "124 files /
1320 tests", "~75 s" and `verify:fast` "~1.9 min"; measured today: **128 /
1374 / 86.76 s** and **2 m 16.7 s**. One commit of real work moved them.
Counts that must drift do not belong in a bootstrap file.

**F-G [LOW] The review lanes have no script.** `knip` and `jscpd` are
devDependencies and `CODE_VERIFICATION.md` §7 gives bare `npx` commands, but
`package.json` scripts are `setup dev build preview lint test test:fast
coverage quality quality:changed verify verify:fast hooks:install` — neither
lane is one command away, so agents skip them.

**F-H [LOW] `design/Arena setup analyze/` is 33 MB of saved web page.**
115 files / 32.4 MiB uncompressed / 6.1 MiB (12.8 %) of all blob bytes; the
single biggest file is `Arena_setupenv_inalize_perfomance.html` at **21 MB**.
It is a browser "save page as" of the report itself — the report's content is
already distilled into the 2026-10-07 archive doc. Already flagged as an owner
decision in the last `QUALITY_RECHECK.md` entry.

## 4. The full list of steps

Four phases. A = correctness, B = measured speed, C = doc budget, D = owner.
"Agent" = doable in an Arena session; "Owner" = needs repo admin or a token
permission the agent may not hold.

### Phase A — make the gate tell the truth (agent, ~1 h 15 min total)

**S1 — Make the quality lane auto-base itself on a shallow clone, and never
report a green that gated nothing.** · fixes F-B · effort 45 min · **do first**
1. In `tools/verify.mjs`: when `git rev-parse --is-shallow-repository` is
   `true`, no `--base` was given, and a base ref resolves, pass
   `--base origin/main` to the quality lane automatically (tree-vs-tree needs
   no merge-base — verified above: 97 files, exit 0).
2. Add `--no-auto-base` to opt out, and surface it in `--plan` / `--plan --json`
   so the lane plan stays a testable contract.
3. When the changed set is genuinely empty, the lane must print
   `PASS (nothing to gate)` — never a bare `PASS` — so a reader cannot mistake
   "no files" for "checked".
4. TDD first, extending the existing seams: `tests/verify_runner.test.ts`
   (plan JSON gains the auto-base under a shallow repo; opt-out flag reaches
   the args; lane order and single-vitest-lane invariant unchanged) and
   `tests/quality_base.test.ts` (empty set prints the marker, exit stays 0).
5. Exit gate: in *this* sandbox `npm run verify:fast` names 97 files in the
   quality lane instead of `(none)`.

**S2 — Stop publishing drifting counts in `AGENTS.md`.** · fixes F-F · 15 min
1. Replace "124 files / 1320 tests", "~75 s", "~1.9 min" with the measured
   2026-10-08 figures **and a date stamp**, or drop the count and point at
   `QUALITY_RECHECK.md` (dated, so correct by construction).
2. Rule to write down: `AGENTS.md` carries commands and reading order; the
   ledger carries counts.

**S3 — Finish the pin in the two `.bat` files and the devcontainer.** · fixes
F-C · 15 min
1. `run_app.bat` + `run_dev_server.bat`: `npm install` →
   `npm ci --prefer-offline --no-audit --no-fund`, keeping the existing
   "no lockfile → `npm install`" fallback. CRLF must survive
   (`.gitattributes` has `*.bat text eol=crlf`).
2. `.devcontainer/devcontainer.json`: `postCreateCommand` → `npm run setup`
   (one source of truth for the install command).
3. Exit gate: `grep -rn "npm install" *.bat` shows only the documented
   fallback.

**S4 — Give the review lanes scripts.** · fixes F-G · 10 min
1. `package.json`: `"dup": "jscpd src --min-tokens 60"`, `"dead": "knip"`,
   `"review": "npm run dup && npm run dead"`.
2. `CODE_VERIFICATION.md` §7 quotes the scripts instead of bare `npx`.
3. Exit gate: both run; findings either zero or recorded in the ledger.

### Phase B — measured speed experiments (agent, ~1 h, revert-if-not-faster)

**S5 — Run the three independent pre-test lanes concurrently.** · 30 min
1. Types (10.6 s), Lint (7.2 s) and Quality (0.57 s) are mutually independent
   and currently sequential = **18.4 s**; the sandbox has `nproc = 2`.
2. Bound concurrency at 2, keep per-lane `PASS/FAIL (s)` lines, and report in
   **declared** order regardless of completion order.
3. TDD: `--plan` contract unchanged; new test asserts result ordering is
   declared-order.
4. Exit gate: 3 timed runs; keep only if `verify:fast` drops **≥ 10 s**, else
   revert and record "no win" here. Expected ~7 s (~5 %) — worth stating
   honestly, not overselling.

**S6 — Measure vitest worker/pool tuning; keep only a proven win.** · 30 min
1. Today: `vitest.config.ts` sets no `pool`/`maxWorkers`; 128 files / 1374
   tests / 86.76 s on 2 CPU; coverage adds 23.7 s.
2. Matrix, 3 runs each, median: default · `pool: 'threads'` ·
   `maxWorkers: 2` · `isolate: false`.
3. `isolate: false` risks cross-test leakage — only admissible with the full
   suite green **and** a shuffled/second-order run green.
4. Exit gate: keep a config only if ≥ 10 % faster with 128/1374 still passing
   and `src/lib` line coverage ≥ the recorded baseline; otherwise record "no
   change" in this folder. No config change without a measured win.

### Phase C — the doc budget (agent, owner review, ~2–3 h)

**S7 — Fold `SYSTEM_OF_RECORD.md` §12–§20 into pointers.** · fixes F-E · 1–2 h
1. For each of the nine sections, check every normative statement is already
   an `I-<n>` in §5 or covered by the matching archive design doc. **Anything
   not covered is promoted into §2/§5 first** — content moves, never vanishes.
2. Replace the section with one row of a pointer table (RULE 17's one-line
   pointer), naming the archive folder.
3. Exit gate: SOR ≤ ~1,300 lines; the `I-<n>` count in SOR is unchanged or
   higher; §10 still names all nine folders; `npm run verify:fast` green.

**S8 — Only if S7 leaves §2 over ~600 lines: split it by tab into
`docs/current/sor/<tab>.md`**, SOR becoming the index. Same treatment is
optional for `UI_SELECTORS.md` (608 lines). Owner review required: `I-<n>`
anchors are quoted across 35 branches, so the index must keep every anchor
resolvable from SOR by one grep. Exit gate: SOR ≤ ~300 lines, no anchor lost.

**S9 — Rotate `QUALITY_RECHECK.md` by year** (`docs/archive/quality-recheck/2026.md`
+ one-line pointer). Lowest priority and stated as such: `AGENTS.md` §2 already
forbids reading it, so its **context** cost is 0 — this is repo bytes only.

### Phase D — owner steps (evidence attached, agent cannot finish them)

**S10 — Merge this lineage into `main`.** · fixes F-A · the highest-value step
in the whole plan
1. Resolve the 35 `arena/*` branches and PR #1, then land the lineage that
   already untracks `node_modules/`/`dist/`, renames `design temp/` and carries
   `AGENTS.md`, `.nvmrc`, `.npmrc`, `tools/verify.mjs`, `.devcontainer/`.
2. Exit gate: `gh api contents?ref=main` lists **no** `node_modules`, `dist` or
   `design temp`, and `contents/AGENTS.md?ref=main` returns 200; a fresh
   `git clone --depth=1` of main measures **46 MB / 584 files** instead of
   246 MB / 11,835 (both measured above).

**S11 — Install the CI workflow.** · fixes F-D
1. **Probe first**: push `docs/archive/2026-10-07-env-setup-performance/verify.yml`
   to `.github/workflows/verify.yml` as a one-file commit on a scratch branch.
   If the remote rejects it, the token lacks *Workflows: write* → hand to the
   owner with this doc as the request. (Unchecked today; see F-D.)
2. Keep `fetch-depth: 0` (the quality lane's merge-base), `node-version-file:
   .nvmrc`, `cache: npm`, `npm ci --prefer-offline`, `npm run verify:fast`.
3. Exit gate: a workflow run appears on the PR and goes green.

**S12 — Remove or externalize `design/Arena setup analyze/`.** · fixes F-H
1. Preferred: delete the folder — the report's substance lives in
   `docs/archive/2026-10-07-env-setup-performance/design.md`; if the raw page
   must be kept, attach it to a GitHub release or move it to Git LFS.
2. Exit gate: lineage clone drops from **46 MB → ~13 MB** and
   `git ls-files design | wc -l` from **122 → 7**.

**S13 — Optional history rewrite** (`git filter-repo --invert-paths --path
node_modules --path dist`) — only after S10. Depth-1 clones are already small
once main's tree is clean; this shrinks **full-history** clones, where 39.7 MiB
of `node_modules` blobs (83.5 % of all blob bytes) still travel. Rewrites
history → owner only, with every branch merged first.

## 5. Sequencing and dependencies

```text
S1 (gate truth) ──┐
S2 S3 S4          ├── Phase A: one commit each, any order, no owner
                  ┘
S5, S6  ← after S1 (S5 edits the same file; S6 is isolated)
S7 ── then S8 only if needed ── then S9        ← Phase C
S10 ── then S11, S12 ── then S13 (optional)    ← Phase D, owner
```

S1 before S5 because both edit `tools/verify.mjs`. S10 before S11/S12 so CI
runs against a clean main. S13 last, always.

## 6. Expected budget after the phases

Anchored on the measurements in §2, not on the report's estimates:

| Step | Today (measured) | After | By |
|---|---|---|---|
| Clone of `main` | 246 MB / 11,835 files / 3.56 s | 46 MB / 584 files / 1.14 s | S10 |
| …and without the saved page | 46 MB / 584 files | ~13 MB / 469 files | S12 |
| Install | 7.7 s warm | 7.7 s (already pinned) | done |
| Fast gate | 2 m 16.7 s | ~2 m 05 s (if S5 wins) | S5 |
| Quality lane correctness | 0 files gated | 97 files gated | S1 |
| `docs/current` | 336,370 B / 5,065 ln | ~301,000 B / ~4,485 ln | S7 |
| Mandatory read before first edit | `AGENTS.md` (96 ln) + one SOR section | unchanged, but SOR sections get smaller | S7, S8 |

Durations are single-machine warm-cache numbers on 2 CPU; treat them as
anchors, not promises. The **correctness** rows (S1, S10) do not depend on
timing at all.

## 7. Explicitly not doing

* **No playwright/puppeteer dependency** — re-confirming the 2026-10-07
  decision; the happy-dom suite is the acceptance gate (RULE 8),
  `CODE_VERIFICATION.md` §9.
* **No split of `AGENT_RULES.md`** — 333 lines but dense and mandatory; its
  cost is real reading, not padding.
* **No change to the coverage lane** — its +23.7 s buys the RULE 16.3
  threshold gate; `test:fast` already gives the TDD loop a coverage-free run.
* **No `git filter-repo` inside a session** — history rewrites are owner-only
  (S13).

## 8. Risks and unchecked items

* **F-D token capability is unchecked.** S11 is written probe-first for that
  reason; if the push is rejected the step becomes an owner request, not a
  failure of the plan.
* **S7 anchor risk.** `I-<n>` references are quoted by other branches; the
  promote-then-pointer order and the "anchor count unchanged or higher" gate
  exist to make a lost invariant impossible to merge silently.
* **S5/S6 may find nothing.** Both carry revert-if-not-faster gates; a
  recorded "no win" is a valid outcome.
* **Timings are one sandbox.** 2 CPU / 3.9 GB / warm npm cache; a 16-core CI
  runner will rank S5/S6 differently — which is why S11 (CI) matters.
* **Not measured:** `npm ci` cold-cache time (no cold cache here), Windows
  `.bat` behaviour (no Windows in the sandbox), and any full-history clone.

## 9. Acceptance for this change (RULE 16.7)

Docs-only, so the RULE 16 size gate has no `src/` files to check:
`node tools/quality.mjs --changed --allow-legacy --base origin/main` was run
and gates **97 files, all `[OK]`, exit 0** (the pre-existing set — this change
adds none). `npm run verify:fast` was run **on the changed tree**:
**ALL LANES PASSED in 2 m 10.5 s** (pre-change baseline on the same sandbox:
2 m 16.7 s; `128 files / 1374 tests`). This doc is dated in `docs/archive/`
(RULE 17) with its one-line row added to `docs/README.md`, and a dated entry
appended to `QUALITY_RECHECK.md`.
