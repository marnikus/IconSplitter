# SVG-to-upload: three-branch integration (2026-10-07)

Source of truth for the decision: `design temp/SVG tab generation/tab review
merging report/merge report.html` (the research report). This doc records what
was integrated, the release blockers repaired with regression tests, and the
limitations deliberately left for a follow-up.

## Decision (matches the report)

* Base = `arena/d658a5b8-iconsplitter` @ `a3d608a4` (the `src/upload` + `src/lib/up*`
  export engine). Its tree becomes the integration tree; no branch is merged unchanged.
* The integration is a two-parent merge commit on `arena/dd39e468-iconsplitter`
  whose tree is the base plus the retained research artifacts (the UI template
  and this report lineage). The unrelated ~21 MB Arena setup capture from the
  `01a0f966` line is dropped (report R25).
* Donors are adapted in small, testable commits, not wholesale:
  * `140ece1a` — workflow/settings/filters/undo (not yet ported; see limitations).
  * `01a0f966` — recovery / metadata provenance / correct IPTC mapping. The correct
    IPTC ObjectName mapping was applied directly to the base (R05).

## Release blockers repaired (each with a failing-then-passing regression test)

| # | Fix | File(s) | Test |
|---|---|---|---|
| R02 | Source identity is the content SHA-256, read once in preflight and carried through the plan and the committed record (was: hash of the relPath string) | `upload/job.ts`, `upload/jobartifacts.ts` | `up_pipeline.test.ts` "R02: …" |
| R05 | IPTC title written/read at ObjectName 2:5, never EditStatus 2:7 (legacy 2:7 only as read-back fallback) | `lib/upmetaxml.ts` | `up_metaxml.test.ts` "…interop (…R05)" |
| R06 | JPEG/SVG metadata readback is a semantic field-equality hard gate before publication (was: presence-only for JPEG) | `upload/jobartifacts.ts` (`jpegMetadataMatches`, `svgMetadataMatches`), `upload/job.ts` | `up_pipeline.test.ts` "…semantic gate (R06)" |
| R07 | A target-MP change invalidates the SVG and EPS geometry (physical stroke); a quality-only change does not | `lib/upfinger.ts` | `up_finger.test.ts` "R07: …" |
| R08 | Committed JPEG sha256/bytes always describe the final embedded bytes, never the raw pre-embedding render | `upload/job.ts` | `up_pipeline.test.ts` "R08: …" |
| R09 | A thrown dependency fault becomes a typed failed result; the pool can no longer reject as a whole | `upload/runner.ts` | `up_pipeline.test.ts` "R09: …" |

## Verification actually run (2026-10-07)

`npx tsc --noEmit` clean · `eslint` 0 errors (tolerated warnings only) ·
`node tools/quality.mjs --changed --allow-legacy` PASSED · `vitest run`
1175 passed (1166 base + 9 new) · `vitest --coverage` src/lib ≥ 80% ·
`vite build` single-file OK.

## Remaining limitations (explicitly NOT done; future integration work)

* R01 package-atomic publication (write immutable generation, then switch one
  commit pointer) — staged commit still writes live files sequentially.
* R03 metadata cache identity/hydration (root/pair/content-hash/policy, reuse a
  fresh accepted record before any paid call).
* R04 style baking (materialise every resolved presentation value before
  removing style rules) + source-vs-prepared render check.
* R10 run-level AbortSignal threaded into the Gemini sender (timeout controller
  exists; external signal not yet wired).
* Donor ports: durable recovery / Interrupted+Retry (01a0f966), consent+abort,
  richer workbench/filters/undo (140ece1a), published preview + typed log.
