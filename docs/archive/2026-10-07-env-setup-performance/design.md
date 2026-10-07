# Environment-setup performance — research + plan (2026-10-07)

Plan-of-record for making agent/sandbox environment setup as fast as possible,
per RULE 16.6 step 2 (design in a doc first). Source research: the
"ICON SPLITTER · ARENA AGENT ENVIRONMENT-SETUP REPORT" (2026-10-06), a saved
copy of which lives in `design/Arena setup analyze/` (renamed from
`design temp/` in this change).

Every number below was **re-verified in the sandbox on 2026-10-07** on this
lineage (base `286304a`, a depth-1 shallow clone) — the report studied
`origin/main`, and the plan itself was written on the sibling branch
`arena/12f110d4-iconsplitter`. This change **ports that plan onto the current
code**: same decisions, re-measured numbers, and the two places where the
lineages diverged corrected (F12, F13 below).

---

## 1. Findings, re-verified against this branch

| # | Report claim | Measured here (2026-10-07) | Status |
|---|---|---|---|
| F1 | `node_modules/` tracked on main | HEAD tree: **0** files under `node_modules/`; `origin/main` tree still lists **11,486**; tree diff HEAD↔origin/main = **11,757** files | already fixed in this lineage → verify-only (O1) |
| F7 | `dist/index.html` tracked | HEAD tree: **0** files under `dist/`; `origin/main` still tracks 1 | same — merging this lineage cleans main |
| F9 | quality gate assumes a full clone | **demonstrated live**: depth-1 clone → `git merge-base origin/main HEAD` exits 1, `HEAD~1` exits 128, `baseRef()` falls to `HEAD`, and `node tools/quality.mjs --changed --allow-legacy` prints `Changed files vs merge-base: (none)` → `GATE PASSED` **without checking anything**. Note: plain `git diff --name-only origin/main` (tree-vs-tree) *does* work in a shallow clone | fix now (O8) |
| F2 | docs/current ≈ 277 KB | AGENT_RULES 21.9 KB / 333 ln · CODE_VERIFICATION 7.4 KB / 198 ln · SYSTEM_OF_RECORD **129 KB / 1790 ln** · UI_SELECTORS 44.3 KB / 601 ln · QUALITY_RECHECK 111 KB / 1821 ln → **≈ 314 KB / 4743 lines** | mitigate now (reading protocol), heavy split deferred (O4) |
| F3 | no root agent entry point | no `AGENTS.md` / `CLAUDE.md` at root | fix now (O2) |
| F4 | toolchain unpinned | no `.nvmrc` / `.npmrc` / `engines` / `packageManager`; README + `install_dependencies.bat` say `npm install`; sandbox node v22.22.3, npm 10.9.8; **`npm ci` took 6 s** (warm cache) | fix now (O3) |
| F5 | verify runs the suite twice | `pre_push_check.sh` lane 4 `vitest run` + lane 5 `vitest run --coverage` — same tests twice; suite measured **124 files / 1320 tests**, 73 s | fix now (O5+O9) |
| F10 | verify needs bash | `"verify": "bash tools/pre_push_check.sh"` | fix now (O9) |
| F6 | browser probe re-invented per session | no playwright/puppeteer in devDependencies, no `tools/probe/` | declare optional (O6-lite, no new dependency) |
| F8 | design handoff = raw HTML + PNG, folder with spaces | `design temp/` = **121 tracked files, 34 MB** (the `Arena setup analyze/` saved page is the bulk) | rename + handoff convention (O7) |
| F11 | doc map rows are paragraphs | confirmed (60–120-word rows); **plus three archive folders have no row at all**: `2026-10-01-history-session`, `2026-10-07-svg-to-upload`, `2026-10-07-svg-to-upload-merge` | fix now (O11) |
| F12 | the plan's handle prefix note (`up-`, not `upl-`) | **this lineage is different again**: the tab lives in `src/upload/` + `src/lib/upload/`, its handles are **`upload-*`** (82 in `src/upload/*`, `UI_SELECTORS.md` §R), its tests are `upload_*.test.ts(x)` — the sibling branch's `svgupload/` + `up-*` names are not this code | AGENTS.md tells the truth from `src/` |
| F13 | the plan's test counts (118 files / 1250 tests) | this lineage: **124 files / 1320 tests** (73 s) | counts re-measured everywhere |
| NEW | — | **SOR drift**: §1 says "five modes" but `src/ui/Workbench.tsx` ships **six** tabs (`upload` / "SVG to upload"); §8 says "114 files / 1212 tests" (reality 124 / 1320); §10 has no pointer for the 2026-10-06/07 designs; the `ideal-size: 357 lines` comment is stale (file is 1790 lines) | minimal fix now (§1, §8 counts, §10 pointers, comment); remainder recorded as debt (§6) |

## 2. Decisions — report item → action in this change

| Item | Report ask | Decision here | Why |
|---|---|---|---|
| O1 (P0) | untrack `node_modules/` + `dist/` | **verify-only** | already untracked in this lineage; merging it removes them from main. History purge (`git filter-repo`) stays an owner step after all branches merge |
| O2 (P0) | root `AGENTS.md` ≤ 120 lines | **build**, adjusted to reality | 6 tabs, this lineage's real prefixes (`upload-`, not `up-`/`upl-`), real persistence keys, measured command times, reading protocol per task |
| O3 (P0) | pin toolchain | **build** | `.nvmrc` 22.12.0 · `.npmrc` (fund/audit off, prefer-offline, engine-strict) · `engines` = vite's own floor `^20.19.0 \|\| >=22.12.0` (no `<23` wall — Node 24 is LTS since 2025-10) · `packageManager` npm@10.9.2 · `setup` script; README + `.bat` switch to `npm ci` |
| O4 (P1) | split SOR by domain, archive the QR ledger | **defer the split; ship the mitigation** | splitting 129 KB of live invariants (I-n anchors quoted by many branches) is a multi-hour reference surgery that belongs in its own owner-approved change, not inside a tooling change. Mitigation now: AGENTS.md reading protocol + "how to read" index at the top of SOR + append-only note on QUALITY_RECHECK, so agents stop reading 250 KB they never needed |
| O5 (P1) | `verify:fast`, de-duplicate lanes | **build** | fast path drops the standalone `vitest run` (the coverage lane already executes every test); `--full` keeps pre-push parity |
| O6 (P1) | probe as repo asset *or* declare optional | **declare optional** | the report's own alternative. Adding `playwright-core` still leaves browser-binary management per sandbox; the happy-dom suite is the acceptance gate (RULE 8). AGENTS.md + CODE_VERIFICATION say so explicitly |
| O7 (P2) | `SPEC.md` next to the HTML, folder without spaces | **build, adjusted** | rename `design temp/` → `design/` + `design/README.md` handoff convention with the SPEC contract. The one live doc reference (SOR §1 mode 4) and the two live code comments (`src/index.css`) are updated in the same commit; archived docs keep their historical paths (RULE 17). **No retroactive SPEC for the already-built upload tab** — its current truth is SOR + UI_SELECTORS §R; a second spec would be a drift source (RULE 10 spirit) |
| O8 (P2) | shallow-clone-safe gate | **build** | `quality.mjs` gains `--base <ref>` (direct tree diff, no merge-base needed), `--files <list>` (git-free), and a printed `git fetch --depth=100 origin main` hint when the repo is shallow and merge-base fails |
| O9 (P2) | cross-platform verify runner | **build, merged with O5** | `tools/verify.mjs` (node, no bash) replaces `pre_push_check.sh`; the pre-push hook execs node; `--plan/--plan --json` prints the lane plan without running it (that is the test seam) |
| O10 (P2) | devcontainer + CI | **build** | `.devcontainer/devcontainer.json` (node 22, `npm ci` postCreate) + the CI workflow (`fetch-depth: 0` so merge-base works, `node-version-file: .nvmrc`, `cache: npm`, `npm run verify:fast`). The active path `.github/workflows/verify.yml` **was rejected by this session's GitHub App token** (`workflows` permission missing — the same rejection the plan's source branch hit), so the workflow is staged ready-to-paste at `verify.yml` in this folder; installing it is an owner step |
| O11 (P2) | doc map hygiene | **build** | `docs/README.md` archive rows collapse to one line each; the missing rows added; `AGENTS.md` listed under "Outside docs/" |

## 3. Change inventory

**Added**: `AGENTS.md` · `.nvmrc` · `.npmrc` · `tools/verify.mjs` ·
`.devcontainer/devcontainer.json` ·
`docs/archive/2026-10-07-env-setup-performance/verify.yml` (the CI workflow,
staged — see O10) · `design/README.md` (handoff convention) ·
`tests/verify_runner.test.ts` · `tests/quality_base.test.ts`.

**Edited**: `package.json` (engines, packageManager, scripts: `setup`,
`test:fast`, `verify:fast`, `verify`→node) · `tools/quality.mjs` (`--base`,
`--files`, shallow hint) · `tools/hooks/pre-push` (exec node runner) ·
`README.md` (pins, `npm ci`, six modes, agent pointer) ·
`install_dependencies.bat` (`npm ci`, CRLF preserved) ·
`docs/current/CODE_VERIFICATION.md` (runner, flags, optional probe, CI) ·
`docs/current/SYSTEM_OF_RECORD.md` (§1 six modes, §8 counts + tooling-test
rows, §10 pointer, reading index, `design/` path, ideal-size comment) ·
`docs/current/QUALITY_RECHECK.md` (append-only usage note + this change's
entry) · `docs/README.md` (map hygiene) · `src/index.css` (two live
`design temp/…` comments → `design/…`).

**Renamed**: `design temp/` → `design/` (121 files, `git mv`, content
untouched). **Deleted**: `tools/pre_push_check.sh` (replaced by
`tools/verify.mjs`; every doc that named it updated in the same change).

**No `src/` production code changes** (the two CSS lines are comments) → the
RULE 16 size gate legitimately reports "(none)" for this change; tsc/eslint/
vitest/coverage/build lanes all still run (tools and tests are linted and
type-checked).

## 4. TDD plan (tests written first, watched red)

`tests/verify_runner.test.ts` — spawns the real runner (RULE 8, no mocks):

* `--plan --json` lists exactly **one** vitest lane in fast mode and **two**
  in `--full` mode (fails if the de-duplication boolean flips);
* lane order types → lint → quality → (tests) → coverage → build; the quality
  lane carries `--changed --allow-legacy`;
* `--base <ref>` on the runner reaches the quality lane args;
* `--plan` exits 0 and runs nothing (side-effect-free seam).

`tests/quality_base.test.ts` — spawns the real gate:

* `--files src/lib/zoom.ts --json` gates exactly that file (one result);
* `--files` naming nothing in `src/` reports an honest empty set, not an
  error (RULE 4);
* `--base HEAD` names the ref in its changed-files line without needing a
  merge-base (the shallow-clone fix);
* on a shallow repo with no working merge-base, the hint
  `git fetch --depth=… origin main` is printed (conditional on
  `git rev-parse --is-shallow-repository`, so the test is honest on full
  clones too);
* flag-less `--changed` behaviour is unchanged (characterization).

## 5. Acceptance (RULE 16.7 applied to this change)

1. New tests red before the tools exist, green after; whole suite green.
2. `npm run verify:fast` and `npm run verify` (=`--full`) pass **through the
   new runner itself** (dogfood); the pre-push hook execs node on any OS.
3. `npx tsc --noEmit` + `npm run lint` clean; `quality.mjs --changed`
   honestly reports no `src/` files.
4. `AGENTS.md` ≤ 120 lines and true against `src/` (tabs, prefixes, keys,
   directories, commands spot-checked by grep).
5. Docs updated in the same change (RULE 17): CODE_VERIFICATION, SOR rows,
   docs/README map, dated QUALITY_RECHECK entry with measured numbers.
6. Report budget levers in place: clone (already clean) · install pinned
   (`npm ci`, 6 s warm) · reading protocol (a few k tokens instead of ~80 k
   before first edit — report §07 estimates) · one suite run per fast verify
   (≈ 35–45 % of verify saved) · no bash requirement · shallow-safe gate.

## 6. Deferred, debt and risks

* **O4 full split deferred** (see §2). Debt stays visible: SOR is 1790 lines
  against RULE 18's 60–200 ideal for context files; its stale
  `ideal-size: 357 lines` comment is corrected in this change, the split is an
  owner ticket.
* **Debt from earlier changes, recorded not silently fixed**: SOR §5 has no
  invariants for the upload tab beyond what §2/§3 state, §8's per-test
  inventory does not list every `upload_*` file, and §10 still lacks pointers
  for the 2026-10-06 `location-folder-of-file` and `svg-to-upload-merge`
  designs. This change repairs §1/§8-counts/§10 (the two planned pointers),
  nothing more.
* **`git filter-repo` history purge**: owner step after every arena branch
  merges; rewrites history, cannot ride along here.
* **`design/Arena setup analyze/` (34 MB saved web page, most of the 121
  tracked design files)**: candidate for removal or external storage — owner
  decision, not touched here.
* **engine-strict** blocks npm on node < 20.19 — intentional (that is the
  pin); README documents it.
* **Rename risk**: archived docs keep `design temp/...` paths (RULE 17 —
  archives are never edited to catch up); the live references (SOR §1,
  `src/index.css` comments) are updated in the rename commit.
* **Sandbox timings are warm-cache numbers** on one machine; AGENTS.md marks
  all durations as approximate.
