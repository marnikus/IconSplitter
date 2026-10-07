# Merge Report Integration — Hardening the d658a5b8 base with selected donors (2026-10-07)

## 1. Goal
Implement the merge exactly as prescribed in `design temp/SVG tab generation/tab review merging report/merge report.html`:

* **Base**: `arena/d658a5b8-iconsplitter` (`a3d608a`) — export engine, SVGO gate, local EPS, JPEG decode seam, direct Gemini, clear boundaries.
* **Workflow donor**: `arena/140ece1a-iconsplitter` (`25ff58a`) — richer workbench interactions, **not** its pipeline.
* **Recovery donor**: `arena/01a0f966-iconsplitter` (`18ed0e9`/`0b9d68c`) — durable recovery, pre-export provenance, correct IPTC, saved-JPEG preview, typed log.

No whole-branch cherry-pick. One engine, two focused donors, hardening-first (report §7).

Shared ancestor: `e94ade3664b54a53c97684fe82f9984e23891739`.

## 2. What is reused as-is
Same as d658 design §2.1: `discoverApprovedSources`, `FolderBar`/`pickroot`/`rootpath`/`scanseq`, `pairmeta`/`pairpreferred`, `svgpreview`/`svgbackground`/`zoom`, `log/logstore`, `HistoryProvider`/`apply`, `fs.ts`, `session.ts`/`appstore.ts`.

## 3. Release blockers fixed first (report §4, hardening Phase 1)

| ID | Finding | Fix |
|---|---|---|
| R01 | Publication not atomic | Staged commit: files written to `export/.tmp-<id>/`, verified, then moved; `export.json` last; prior generation retained; failure fixtures for every write position. |
| R02 | Source hashing uses file path | Read source bytes, SHA-256 once, carry immutable value through planning/record. Test: same path/size/mtime, different content → new SHA. |
| R03 | Metadata cache identity & restore unsound (`size:mtime`, empty reset, no hydration) | Key = `rootId:pairId:sha256:policyVersion`; hydrate accepted metadata from durable store before paid fallback; persist generation results before first export. |
| R04 | Styles removed without baking | `bakeOutStyles` materializes every resolved `fill`/`stroke`/`fill:none`/caps/joins on copied elements before removing `<style>`. Source-vs-prepared render parity fixture. |
| R05 | Wrong IPTC ObjectName (2:7) | Use 2:5 ObjectName; keep base UTF-8 + segment-size guards; independent reader fixture. |
| R06 | Metadata readback incomplete | Validate both XMP and IPTC field values against accepted; policy validation at export boundary; independent packet fixture. |
| R07 | Planner / physical-stroke disagree | MP changes invalidate SVG/EPS geometry (strokeUserUnits depends on target raster); distinct fingerprints for visual vs raster; retain unchanged output entries. |
| R08 | Final JPEG hash describes raw file | Derive stats from final embedded bytes only; verify committed readback. |
| R09/10 | Exception isolation, cancellation, recovery | Per-icon try/catch → typed result; pool survives one failure; Gemini sender accepts parent AbortSignal; durable interrupted journal with explicit Retry. |

## 4. Donor adaptation (report §5)

### P0 — must-have

* **Durable metadata records/drafts** (01a0f966): `metastore.ts` — persisted accepted/draft, prompt/provider/model, pre-export survival; identity = root/pair/content-hash/policy; migrate conflicting keys; retain direct Gemini.
* **Whole-job recovery** (01a0f966): `jobstore.ts` — `running|queued → interrupted` on next load, `restoreInterrupted` once per page, toast `upload.restored`, no auto-resend.
* **Consent & abort** (140ece1a): confirmation dialog with redacted request, linked AbortController; keep base refusal/truncation checks.
* **IPTC mapping** (01a0f966): 2:5 ObjectName.

### P1

* **Filters/audit/settings/undo** (140ece1a): search, sort, independent filters, discovery audit line, per-icon inheritance markers, Reset, gesture-coalesced undo (`uploadundo.ts`).
* **Published preview** (01a0f966): `readPublishedJpeg` reads saved `export/*.jpg` via object URL; SVG preview reads saved artifact; root/generation cache keys; revoke replaced blobs.
* **Typed log & model policy** (01a0f966): `uploadlog.ts` icon/outcome vocabulary, no data field, exact model refusal via `models.get/list`.
* **Two-named-tags rule**: extend base `upmeta` validator with donor's two-named-tags without weakening JSON/label parsing.

### P2

* **Explicit units/optional stroke** (01a0f966): `units.ts` pt/px/% with 96/72 conversion; decide physical-stroke contract; percentage basis.

## 5. What is NOT ported
* 140ece1a: scan/credential ref alias, retained-output loss, unguarded readback, broad 5xx retry.
* 01a0f966: `chosenVersion` without `review===approved`, no-op `toggleAll`, selective planner gaps, publishing after required raster failure, split cancellation paths, path-based code cache.

## 6. Schemas & persistence (Phase 2)
One DTO, explicit migration: `export.json v:1` with `pairId, iconBase, source{relPath, version, sha256}, settings, metadata, outputs{svg,jpeg,eps}, state, failure, committedAt`. Include `rootId`, `contentHash`, `policyVersion`, `generation{prompt,provider,model,requestId,usage}`, `pricingVersion`. Change of source hash → stale metadata; edited accepted record → new metadata fingerprint, no model call; interrupted ≠ failed.

## 7. Recovery, consent, cancellation (Phase 3)
One `AbortController` per run, journal `iconSplitter.upload.inflight.v1` and `iconSplitter.upload.jobs.v1`, `restoreInterrupted` once, StrictMode-safe, typed log.

## 8. Workflow & artifact review (Phase 4)
One `visibleRows` derivation; header checkbox exact scope; hidden selections clearly scoped; both published-artifact previews; safe logging (no key/tag/payload).

## 9. Verification (Phase 5)
`npm run verify` (tsc, eslint, quality gate, tests, coverage, build) + Chromium probe with fake FSA, real filesystem handles, single-file build, independent IPTC/EPS tools. SYSTEM_OF_RECORD, UI selectors, failure/recovery contract updated to observed behavior.

## 10. Acceptance matrix (report §8) — fixtures below map 1:1
Declined preferred → allowed fallback; in-place edit → new SHA; identical stats → separate identities; generate/accept/close → survives; rescan/re-export → no provider call; metadata-only edit → no AI; MP vs quality → correct artifacts; class styles → parity; zero padding/thick stroke → no clipping; wrong metadata → hard failure; IPTC readback → 2:5; final hashes → equality; EPS filled/stroked → independent renderer; optional EPS → Partial; JPEG failure → prior generation; publication failure → recoverable; cancel/restart → finished kept/interrupted once; corrupt record → visible issue; root switch → newest only; shared dir → independent manifests; filtered bulk/undo → exact scope; unavailable model → refusal; hygiene → no credential leakage; dev/build → parity.

## 11. Open limitations (honest, not hidden)
* Flat `export/` per pair — one icon per parent dir assumed; two pairs sharing a dir get distinct `export/<iconBase>.json` or preflight refusal (R24).
* ICC profile sRGB-implied; no embedded ICC blob.
* EPS local subset only; text/gradients/filters → Partial with reason.
* Points → px uses 96 DPI (`1pt = 4/3 px`); 2.2pt = 2.9333px; docs corrected.

## 12. TDD plan (rules 16 & 18)
* `tests/merge_r02_sourcehash.test.ts`, `merge_r05_iptc.test.ts`, `merge_r08_jpegstats.test.ts` — red before, green after.
* `tests/merge_recovery.test.ts` (jobstore), `tests/merge_filters.test.ts` (visibleRows), `tests/merge_preview.test.tsx` (published JPEG).
* Coverage ≥80% `src/lib`; new `src/lib` modules 100% statements; gate `funcLoc≤30, params≤4, CC≤10, nesting≤4`.
