# Agent startup and environment optimisation report

Date: 2026-10-07. Scope: the saved Arena Agent Mode transcript, the SVG-to-upload
UI reference, and the current Icon Splitter checkout. This is an analysis report;
it changes no production behaviour.

## 1. Executive conclusion
The dependency install is **not** the main delay. In a cold local measurement,
`npm ci` completed in **5.623 s**. Most observed delay came from repeated project
rediscovery, repeated environment recovery after resets, rebuilding an ad-hoc
Chromium probe, and running the complete test suite twice in `npm run verify`.

Highest-value changes, in order:

1. add a short root `AGENTS.md` startup contract and pin Node/npm;
2. make tests fully offline and remove thousands of React `act()` warnings;
3. run the suite once with coverage in the final verification command;
4. check in a reproducible, optional browser-probe harness—not browser binaries;
5. compact stale/contradictory current docs to their RULE 18 context budget;
6. remove the 32.36 MiB saved Arena page bundle from normal Git history after
   this report is accepted.

A reasonable target is: **under 10 s to install**, **under 15 s to become
oriented on a routine task**, and **about 90–100 s for one final full gate**.
The current final gate took 160.828 s.

## 2. Evidence and scope
Two different inputs were present:

* `design temp/SVG to upload/SVG to upload UI temp.html` and
  `SVG to upload UI image.png` are a static UI specification for the sixth tab.
  They contain no Arena environment-startup record.
* The actual Arena transcript is
  `design temp/Arena setup analyze/Arena_setupenv_inalize_perfomance.html`.

The saved page exposes agent reasoning and visible tool records, but not Arena's
private container provisioning, clone timing, cache policy, or internal setup
telemetry. Conclusions about those platform internals would be speculation.

The saved transcript covers many tasks, not one startup:

| Observed item | Measured value | Interpretation |
|---|---:|---|
| Transcript messages | 43 | Long, multi-task session |
| Unique recorded Bash calls | 782 | Whole transcript, not startup only |
| Install-related calls | 16 / 111.2 s | Repeated after resets; overlaps other groups |
| Browser setup/probe calls | 85 / 648.9 s | Setup, diagnosis, and probes combined |
| Git fetch+reset recovery calls | 7 / 10.7 s | Environment-drift recovery, not normal work |
| Arena page bundle in Git | 115 files / 32.36 MiB | 90.6% of all tracked bytes |

Durations above are lower bounds from command wall times. They exclude agent
reasoning, UI latency, and web research, and categories can overlap.

### Ownership boundary
| Concern | Primary control | Fast-path rule |
|---|---|---|
| Container, clone, base tools, retention | Arena/platform | Provision once; expose cache telemetry |
| Runtime and dependency cache | Shared | Repo pins/key; platform persists by lock hash |
| Lockfile, scripts, docs, tests, browser recipe | Repository | Deterministic and idempotent |
| Command order, focused/full gate choice | Agent instructions | Discover once; do not reset/reinstall |

For the SVG-to-upload task specifically, before the first red test the transcript
shows six grouped shell rounds (`2 + 2 + 2 + 4 + 4 + 2` commands), three web
research rounds, and a 247-line design document. Much of that was explicitly
required by the task: understand, research provider/conversion capabilities,
study the template, design first, then TDD.

## 3. What the agent prepared before implementation
### Necessary preparation
The agent checked branch/status, installed locked dependencies, found the visual
references, read the rules, and mapped the scan, metadata, provider, queue, log,
undo, folder, render, and persistence seams. It researched the Gemini model,
SVGO, JPEG metadata, raster sizing, and genuine EPS; then wrote the required
design and a failing characterization test. These steps protect correctness,
secret hygiene, and RULE 16/18 compliance and should remain.

### Avoidable or repeatable overhead
1. **Repeated Git recovery.** The transcript repeatedly fetched and ran mixed
   resets after the sandbox branch/index drifted. This is not valid routine
   startup and risks masking worktree changes.
2. **Repeated installs.** `node_modules` and `/tmp` disappeared more than once,
   so the project and probe dependencies were reinstalled.
3. **Browser-tool rediscovery.** The agent repeatedly rediscovered package
   versions, Chromium extraction, shared libraries, launch flags, and probe
   script details. The recipe existed only in prior prose and ephemeral `/tmp`.
4. **Documentation reconstruction.** Current docs are large and internally
   stale, so the agent inspected code to decide which current statements were
   true.
5. **Duplicate final test execution.** `npm run verify` runs all Vitest tests,
   then runs all of them again under coverage.
6. **Noisy/non-hermetic tests.** The measured gate attempted real Requesty
   network access and emitted very large React warning output while still
   passing.
7. **Large irrelevant tracked capture.** Normal Git operations and broad search
   can traverse a 32.36 MiB saved web page and 99 downloaded JavaScript assets.

## 4. Current measured setup and gate cost
Environment measured on this branch:

* Node `v22.22.3`; npm `10.9.8`.
* No `.node-version`, `.nvmrc`, `packageManager`, or `engines` pin exists.
* Cold `npm ci --prefer-offline --no-audit --no-fund`:
  **5.623 s**, 280 installed packages, 272 MiB `node_modules`.
* Lockfile: 388 resolved package entries; package lock is present and valid.
* Full `npm run verify`: **160.828 s**, successful.
* Tests: **114 files / 1,212 tests**, all passed—twice.
* Plain test run: 62.57 s; coverage run: 76.20 s.
* Coverage: 97.51% lines overall in the reported table; enforced floor passed.
* Build: `dist/index.html` 1,417.92 kB, 408.93 kB gzip.
* Lint: 0 errors, 8 accepted legacy warnings.
* Verification stderr: 1.48 MiB, including 3,907 React `act()` warning strings
  and 86 `ECONNRESET` records for `router.requesty.ai` across the two runs.

Thus 138.77 s—86% of the full gate—was the two Vitest executions. Removing the
plain duplicate while retaining the coverage execution should save about 62 s
on this machine. It does not weaken tests: the coverage lane executes the same
real tests.

## 5. Repository conditions that increase orientation time
### 5.1 No machine-readable toolchain contract
The README states supported Node versions, but package metadata does not, and
`react-vite-tailwind` does not identify the app in logs. Rename it
`icon-splitter`; add `packageManager: "npm@10.9.8"`, Node/npm `engines`, and a
`.node-version` for Node 22.22.3 (or the selected Node 22 patch). Keep the lockfile
authoritative and use `npm ci`, not `npm install`, in fresh automation.

### 5.2 Current docs exceed their context budget and disagree
Measured current-document sizes:

| File | Lines |
|---|---:|
| `AGENT_RULES.md` | 333 |
| `CODE_VERIFICATION.md` | 198 |
| `UI_SELECTORS.md` | 532 |
| `SYSTEM_OF_RECORD.md` | 1,530 |
| `QUALITY_RECHECK.md` | 1,821 |
| Current docs total | 4,414 |

Examples of current contradictions:

* README and System of Record say five modes; `SVG to upload` is the sixth.
* System of Record still says a watcher runs every 30 seconds, then later says
  it was removed.
* It first describes active global `review-decisions.json` writes, then later
  correctly describes it as read-only legacy fallback.
* It says 75 test files / 704 tests; the measured tree has 114 / 1,212.
* README still documents 48–240 px zoom; current selectors specify 48–800 px.
* `docs/README.md` does not map the 2026-10-07 SVG-to-upload design.

This is both a RULE 17 truth problem and a RULE 18 context-budget problem.
Keep current docs factual and compact; move dated narrative to the existing
archive. An agent should not need to read historical reversals to know today's
contract.

### 5.3 Verification is correct but inefficient and noisy
`tools/pre_push_check.sh` treats tests and coverage as separate processes. Keep
both logical gates, but use one instrumented run as evidence for both. Also add
a global test setup that fails unexpected network calls. Individual transport
tests can opt into a fake fetch. Repair `act()` boundaries so warnings become a
failure budget of zero instead of 1.48 MiB of accepted noise.

### 5.4 Browser verification has no reproducible project seam
The browser probe was useful for layout and File System Access behaviour, but
its dependencies, extraction, libraries, launch flags, fixtures, and assertions
lived in `/tmp`. Sandbox resets erased them. Reconstructing that seam was the
largest observable avoidable setup cost.

Add an **optional** checked-in probe harness and a pinned nested lockfile, for
example `tools/browser-probe/`. A single `npm run probe:setup` should populate
`/tmp/iconsplitter-probe`; `npm run probe:ui` should execute it. Do not add the
Chromium binary to Git, and do not install probe packages during routine setup.
Only layout, real-browser canvas, File System Access, or shadow-DOM changes need
this lane.

### 5.5 The saved Arena page should not remain a normal tracked asset
The capture is valuable for this audit but is not an application input. It is
90.6% of tracked bytes and contains third-party minified bundles, reCAPTCHA, and
analytics resources. After acceptance, retain this report and—if needed—a small
sanitised excerpt or screenshot outside the normal repository. Removing it in a
future commit will shrink future checkouts; existing Git history needs a
separate, deliberate history-cleanup decision if total clone size matters.

## 6. Recommended project changes, prioritised
| Priority | Change | Expected effect |
|---|---|---|
| P0 | Root `AGENTS.md` with the exact runbook below | Stops repeated discovery |
| P0 | Pin Node/npm in package metadata + `.node-version` | Deterministic setup |
| P0 | Block unexpected network in Vitest; fix `act()` warnings | Offline, quiet gates |
| P0 | Execute Vitest once with coverage in final verify | About 62 s saved/run |
| P1 | Compact and correct current docs | Smaller, trustworthy context |
| P1 | Check in optional browser-probe setup/harness | One command, no rediscovery |
| P1 | Add `env:check` and `check:fast` scripts | Fast fail before implementation |
| P1 | Remove/move the raw Arena capture after audit | Much smaller checkout/search |
| P2 | Add CI with npm cache keyed by lockfile hash | Faster remote verification |
| P2 | Measure and split the slowest UI suites | Lower TDD feedback latency |

Implement these as a separate TDD change. Characterize the current setup and
verification first; do not change production code merely to optimize tooling.

## 7. Exact startup contract for future agents
This is the proposed content core for a concise `AGENTS.md`.

### Always
1. Work only on the branch Arena provided. Do not checkout/create another one.
2. Run `git status --short --branch`; never fetch/reset as routine setup.
3. Read all of `docs/current/AGENT_RULES.md`.
4. Read the compact current behaviour section relevant to the requested mode.
5. Read `CODE_VERIFICATION.md`; read `UI_SELECTORS.md` only for UI work.
6. Do not read the full dated quality log unless doing a release/recheck.
7. Never load or create API keys. Tests must use fakes; secrets stay browser-only.

### Dependencies
```bash
node --version
npm --version
if ! test -d node_modules || ! npm ls --depth=0 >/dev/null 2>&1; then
  npm ci --prefer-offline --no-audit --no-fund
fi
npm run env:check
```

Do not run a build, full coverage, browser download, or `npm run verify` during
startup. Start implementation only after the focused characterization test is
red for the intended reason.

### TDD loop
```bash
npx vitest run tests/<focused-seam>.test.ts
npm run check:fast
```

Write a test against the existing seam before production changes. Keep new
functions/modules within RULE 16/18, use explicit interfaces, bound loops and
buffers, and isolate per-item failures. Run the changed quality gate after each
coherent slice.

### Final gate
```bash
npm run verify
```

The optimized command should run typecheck, lint, changed-file quality gate,
one real test run with coverage, and the production build. Record actual counts,
coverage, warnings, and limitations. Use the optional browser lane only when the
change requires a real browser.

### SVG-to-upload references
Use exactly:

* `design temp/SVG to upload/SVG to upload UI temp.html`
* `design temp/SVG to upload/SVG to upload UI image.png`
* `docs/archive/2026-10-07-svg-to-upload/design.md`
* `src/lib/svgupload/`, `src/svgupload/`, and `tests/svgup_*`

The HTML/image are visual references, not executable requirements or setup
scripts. Existing behaviour and tests win where a static mock conflicts.

## 8. Suggested Arena project preferences
If Arena exposes project setup and cache preferences, configure:

* working directory: repository root;
* runtime: Node 22.22.x and npm 10.9.x;
* setup command: the conditional `npm ci` block above;
* cache key: SHA-256 of `package-lock.json`;
* cached paths, if supported: npm download cache and validated `node_modules`;
* preview: `npm run dev -- --host 0.0.0.0`;
* setup timeout: 120 s;
* no `apt-get`, browser download, build, test, or coverage during setup;
* no secrets or API keys in setup variables.

Arena's cache feature and exact preference fields are not visible in the saved
page, so these are project requirements to map onto whatever controls Arena
currently offers—not claims about Arena internals.

## 9. Acceptance criteria for the optimisation change
1. Clean setup reaches `env:check` in under 30 s; warm setup skips reinstall.
2. Setup never mutates Git history/branch and tests never use external network.
3. Test output has zero unapproved React `act()` warnings.
4. Final verification executes tests once and preserves coverage thresholds.
5. `AGENTS.md` is 60–120 lines; current docs are true and move toward 60–200.
6. Browser setup is one pinned, optional command with no tracked binary.
7. `npm run verify` stays green and records test/coverage/build evidence.

## 10. Verification performed for this report
No production file changed, so no new production path required a TDD test.
Repository-native gates were still run to establish the baseline:

* cold `npm ci`: passed in 5.623 s;
* `npm run verify`: **passed all lanes** in 160.828 s;
* TypeScript: clean;
* ESLint: 0 errors / 8 pre-existing warnings;
* tests: 114 files / 1,212 tests passed in both runs;
* coverage gate: passed, 97.51% reported lines;
* build: passed, single-file output 1,417.92 kB (408.93 kB gzip);
* secret handling: no key was requested, read, printed, or stored.

Remaining limitations: no Arena-internal provisioning telemetry was available;
transcript categories overlap; browser setup numbers include actual probes; the
network and React warning noise remains unfixed because this task requested an
analysis report, not a production/tooling refactor.
