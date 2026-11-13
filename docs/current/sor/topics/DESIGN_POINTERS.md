# Dated design pointers

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 10. History of designs — pointers

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana`
  `docs/current/*` (AGENT_RULES 24 rules, CODE_VERIFICATION, DOM_SELECTORS →
  UI_SELECTORS, QUALITY_RECHECK); metrics reports intentionally not ported.
* 2026-10-01 — batch processing designed TDD-first:
  `docs/archive/2026-10-01-batch-processing/design.md` (module map, browser
  constraints, rule budget, negative tests).
* 2026-10-01 — Selection review designed TDD-first:
  `docs/archive/2026-10-01-selection-review/design.md` (pairing model, atomic
  decision protocol, rename carry, hotkeys, a11y).
* 2026-10-01 — Selection review V2 designed TDD-first from the prepared HTML
  template: `docs/archive/2026-10-01-selection-v2/design.md` (layering, list
  review rows, zoom slider, selection vs decision state, bulk scope, a11y
  deviation from the template's `role="listbox"`).
* 2026-10-01 — Generate SVG designed TDD-first from the SVG-generation prompt:
  `docs/archive/2026-10-01-generate-svg/design.md` (approved-only discovery,
  contact-sheet batching, name+title matching, validate-before-write,
  per-source sidecar versioning, token/cost honesty, RULE 20 key handling).
* 2026-10-01 — preview background + task cost designed TDD-first:
  `docs/archive/2026-10-01-svg-preview-cost/design.md` (preview-only frame and
  the contrast rule, one cost decision with a versioned rate card, cost basis +
  pricing version in the sidecar).
* 2026-10-01 — multi-request confirmation, reasoning limits, tier waits and the
  preview/zoom fixes designed TDD-first:
  `docs/archive/2026-10-01-svg-batches-limits-preview/design.md` (splitter +
  validator, the paginated confirmation, per-request outcomes, one zoom value,
  the preview's layout-only stylesheet). Its effort **icon caps and total
  timeout were reversed on 2026-10-05** — see the entry below.
* 2026-10-05 — one JSON per image pair (the pair's approval **and** its SVG
  history, no global metadata): `docs/archive/2026-10-05-per-pair-metadata/design.md`
  (contract, naming, the read-only legacy fallback, module plan, TDD order,
  verification, rejected alternatives, I-41…I-43).
* 2026-10-05 — long SVG generations must survive, not be truncated:
  `docs/archive/2026-10-05-svg-long-requests/design.md` (the user's batch size
  at every tier, SSE streaming + `stream_options.include_usage`, the stall
  window replacing every total timeout, four distinct outcomes with a stall
  reported as *outcome unknown*, kept request ids, the in-flight journal and
  its explicit restart recovery, ticking elapsed + Cancel).
* 2026-10-07 — SVG to upload built TDD-first from the prepared template:
  `docs/archive/2026-10-07-svg-to-upload/design.md` (discovery through the
  pair sidecars, settings and undo, the Gemini metadata prompt and transport,
  SVGO/JPEG/EPS pipelines, the per-icon `export.json` and its atomic commit,
  no automatic uploading).
* 2026-10-07 — environment-setup performance (agent sandboxes):
  `docs/archive/2026-10-07-env-setup-performance/design.md` (shallow-clone-safe
  quality gate `--base/--files`, pinned toolchain, root `AGENTS.md`, the node
  verify runner replacing `pre_push_check.sh`, devcontainer + CI, doc-map
  hygiene; the O4 doc split is deferred there with reasons).
