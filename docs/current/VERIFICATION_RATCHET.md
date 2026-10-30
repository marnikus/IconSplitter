# Verification — hook, ratchet, overrides and CI

Background for [Code Verification](CODE_VERIFICATION.md); read only when a gate result needs explaining.

## Git hook — automatic enforcement

`tools/hooks/pre-push` execs `node tools/verify.mjs --full` before every push
once installed (`npm run hooks:install`).

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
| `tools/quality.mjs` | RULE 16 gate: TS AST metrics + ratchet + changed detection via merge-base, `--base`/`--files` for shallow clones + untracked files |
| `tools/quality_baseline.json` | Baseline per-file/per-function offender records — ratchet, grandfathered |
| `tools/verify.mjs` | Combined lanes (cross-platform, node): types + lint + gate + tests + coverage + build; `--full`, `--plan`, `--base` |
| `tools/hooks/pre-push` | Hook exec-ing `node tools/verify.mjs --full` |
| `tools/install_hooks.sh` | Installs the hook into .git/hooks |
| `eslint.config.js` | Hygiene errors + complexity/nesting warns (flat config) |
| `vitest.config.ts` | Test lane + coverage thresholds (src/lib ≥ 80% lines) |
| `docs/current/AGENT_RULES.md` | Detailed rules, thresholds, anti-gaming, override format |
| `docs/current/CODE_VERIFICATION.md` | This file |

## CI equivalent

A ready-to-paste GitHub workflow (checkout `fetch-depth: 0` so the gate finds
the merge-base, Node from `.nvmrc`, npm cache, `npm ci`, `npm run verify:fast`)
is staged at `docs/archive/2026-10-07-env-setup-performance/verify.yml`.
Installing it into `.github/workflows/` needs the `workflows` token permission
(an owner step — the agent push of 2026-10-07 was rejected without it).
Locally, the same thing is:

```bash
node tools/quality.mjs --changed --allow-legacy --json > quality.json
# fail the job if any failures are reported
npm run verify
```
