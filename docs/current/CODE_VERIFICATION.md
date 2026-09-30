# Code Verification Before Push — RULE 16 Enforcement

Per `AGENT_RULES.md` RULE 16 + RULE 18, every production change must pass the
quality gates before push. Adapted from `Process-Images-in-Areana/docs/current/CODE_VERIFICATION.md`
to this TypeScript toolchain; thresholds are identical, tooling is the TS equivalent.

## Why

The sister project enforces gates LOC 30/150, params 4, methods 15, CC 10,
cognitive 15, nesting 4, coverage 80%/75% via an executable gate and a pre-push
hook. Icon Splitter preserves the same thresholds with the **TypeScript gate**
(`tools/quality.mjs`), a **per-file baseline ratchet** (fails on any growth, even
in legacy), **ESLint hygiene/complexity lanes**, **Vitest coverage lane** and a
**single-file production build** check.

Adding code without verification leads to: long functions hiding complexity,
god components, untestable logic, coverage drop, anti-gaming (`fooPart1`,
options-bag dodges), and silent evidence loss.

## What to run before every push

### 0. Install (once)

```bash
npm install          # dependencies + dev tooling (eslint, vitest, coverage, typescript)
npm run hooks:install   # optional: enforce the gate automatically on git push
```

### 1. Types (syntax lane)

```bash
npx tsc --noEmit
```

### 2. Lint (hygiene errors + complexity/nesting warns)

```bash
npm run lint
```

Errors fail the lane (unused vars, bad directives, hook misuse). Complexity >10
and nesting >4 are **warnings** here; `tools/quality.mjs` owns the hard fail
lines + ratchet so legacy hotspots stay lintable.

### 3. Quality gate — changed files only (legacy allowed + ratchet)

```bash
node tools/quality.mjs --changed --allow-legacy
```

- Checks only files changed vs merge-base `origin/main` (fallback `HEAD~1`),
  including **untracked new files** (`git ls-files --others`) so a brand-new
  over-line file cannot slip past.
- Hard fail lines (new code): function LOC > 30, params > 4, CC > 10,
  nesting > 4, new file > 300 lines.
- **Baseline ratchet:** `tools/quality_baseline.json` records per-file line
  count and per-function offender maxima. Any current value above the recorded
  one **fails** even with `--allow-legacy`; recorded offenders may hold but
  never grow. New over-line functions in baseline files fail.
- Anti-gaming: names ending in `Part<N>`/`_part<N>` (and chunk/step variants)
  fail unconditionally.

### 4. Full gate (all files) — for review

```bash
node tools/quality.mjs                  # strict: legacy also fails
node tools/quality.mjs --allow-legacy   # legacy downgraded to warnings
node tools/quality.mjs --json           # machine-readable
```

### 5. Tests (RULE 8 — real logic)

```bash
npm test                     # vitest run
```

Tests execute the real `analyze` / `detect` / `renderIcon` logic against
synthetic pixels and recording canvas shims. If a test passes with the feature
deleted, it is not a test.

### 6. Coverage (RULE 16.3)

```bash
npm run coverage             # vitest run --coverage (v8 provider)
```

- Thresholds enforced in `vitest.config.ts`: `src/lib` lines ≥ 80%.
- Recorded baseline (2026-09-30): lines 100%, branches 95%. Never decrease.
- Every new lib function needs a test that would fail if the function were
  deleted; canvas-dependent paths go through the shims in `tests/`.

### 7. Duplication + dead code (review lanes, not pre-push)

```bash
npx jscpd src --min-tokens 60        # copy-paste detection
npx knip                             # unused exports/deps (vulture equivalent)
```

Run before releases and after refactors; zero **new** findings on a diff.

### 8. Combined pre-push check (runs lanes 1–6 + build)

```bash
npm run verify          # = bash tools/pre_push_check.sh
```

Lanes: tsc + eslint + quality gate (changed, ratchet) + vitest + coverage +
`vite build` (single-file output must succeed).

## Git hook — automatic enforcement

`tools/hooks/pre-push` runs `tools/pre_push_check.sh` before every push once
installed (`npm run hooks:install`).

- If any lane fails, the push is blocked.
- Bypass only with `git push --no-verify` with an explicit reason and manual
  verification done.
- Uninstall: `rm .git/hooks/pre-push`.

## Baseline ratchet — how it works

`tools/quality_baseline.json` stores, per file: `file_lines`, `func_count` and
per-function `{loc, params, cc, nesting}` offender records.

- For each over-line function: not in baseline, or any metric grown vs its
  recorded entry → **FAIL** (`[new/grown vs baseline]`).
- Recorded offenders at or below their record → `[LEGACY]` warning with
  `--allow-legacy`, failure without it.
- File growth above recorded `file_lines` → **FAIL**.
- `--allow-legacy` may suppress recorded values, never new growth.

Negative tests (must stay red when tried): (i) adding a 44-LOC function to a
baseline file fails; (ii) a new untracked file with a 44-LOC function fails;
(iii) an over-line new function in a legacy file fails even with
`--allow-legacy`.

Regenerate baseline (integrator only, single writer):

```bash
node tools/quality.mjs --write-baseline
```

## Override format

If a breach is unavoidable due to a real constraint, add:

```ts
function wideLegacyAdapter(a: A, b: B, c: C, d: D, e: E) {
  // quality-override: params=5 reason=frozen export contract shared by ZIP, folder and clipboard paths
}
```

- Strict: `quality-override: <metric>=<value> reason=<≥20 chars>`
- metric ∈ `loc, params, cc, nesting, coverage, dup`
- Reason must name a constraint (frozen contract, single string payload,
  browser API shape), not "faster to ship"
- One per metric per symbol; stale overrides must be deleted

## Remediation order (RULE 19)

1. **Nesting > 4** → guard clauses, early return, flatten
2. **CC > 10** → lookup tables / strategies, not `fooPart1`
3. **Cognitive > 15** → name predicates, simplify booleans
4. **LOC > 30** → extract helper with a real responsibility name

Verify after every step: `node tools/quality.mjs --changed` and `npm test` —
steps 1–3 must be behaviour-preserving (suite stays green).

## Files

| File | Purpose |
|---|---|
| `tools/quality.mjs` | RULE 16 gate: TS AST metrics + ratchet + changed detection via merge-base + untracked files |
| `tools/quality_baseline.json` | Baseline per-file/per-function offender records — ratchet, grandfathered |
| `tools/pre_push_check.sh` | Combined lanes: types + lint + gate + tests + coverage + build |
| `tools/hooks/pre-push` | Hook calling pre_push_check.sh |
| `tools/install_hooks.sh` | Installs the hook into .git/hooks |
| `eslint.config.js` | Hygiene errors + complexity/nesting warns (flat config) |
| `vitest.config.ts` | Test lane + coverage thresholds (src/lib ≥ 80% lines) |
| `docs/current/AGENT_RULES.md` | Detailed rules, thresholds, anti-gaming, override format |
| `docs/current/CODE_VERIFICATION.md` | This file |

## CI equivalent

```bash
node tools/quality.mjs --changed --allow-legacy --json > quality.json
# fail the job if any failures are reported
npm run verify
```

## Quick checklist (RULE 16 §16.6)

1. Read `SYSTEM_OF_RECORD.md` + `AGENT_RULES.md` rules 1–15 + 20–24 and RULE 18 ideals
2. Design in `docs/archive/<date>-<topic>/` if complexity moves across files
3. Tests first (RULE 8)
4. Measure: `node tools/quality.mjs --changed --allow-legacy` — any fail → redesign per RULE 19
5. Run: `npm run verify` — must pass before push
6. Update current docs in the same change (RULE 17)
