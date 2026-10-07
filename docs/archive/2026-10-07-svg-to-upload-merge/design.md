# SVG to upload — the three-branch merge (2026-10-07)

Request: «create merge of 3 branches as shown exact in report» —
`design temp/SVG tab generation/tab review merging report/merge report.html`.
The report's §10 decision is what this change builds:

| Branch | Report role | What was taken |
|---|---|---|
| `arena/d658a5b8-iconsplitter` @ `a3d608a` | **engine base** | `src/lib/up*.ts` (scene → fit → SVGO → raster → JPEG segment surgery → EPS → readback), `src/upload/*` (row engine, stage machine, package protocol, browser adapters) |
| `arena/140ece1a-iconsplitter` @ `25ff58a` | workflow/settings donor | its review-workbench rules live in the base's own `statemodel`/`uploadactions` shape: one undoable `uploadSettings` apply, per-icon overrides that never erase a global edit, check-all scoped to the visible ids, the session-keyed key store |
| `arena/01a0f966-iconsplitter` @ `18ed0e96` | recovery/metadata/artifact-review donor | durable attempt journal + accepted-metadata draft, provenance carried with every accepted answer, select-and-review semantics for `interrupted` rows, IPTC `ObjectName` 2:05 (not 2:07) |

No branch was merged wholesale and no branch's tree was checked out over
another's: the engine was laid in first (commit `c508c5a`), then the report's
release blockers were fixed and the donor behaviours were rebuilt inside the
base's seams, each with a test that fails without it.

## 1. Delivered package

```
<pair>/export/current.json                      ← the ONLY commit pointer (R01)
<pair>/export/attempts.json                     ← the durable journal (R10)
<pair>/export/generations/<gen>/<base>.svg|jpg|eps
<pair>/export/generations/<gen>/record.json     ← the record schema v2 (R24)
```

* A generation is written **whole** (rebuilt outputs plus byte copies of every
  kept one) and only then does the pointer move — one small file, one atomic
  close. A failure anywhere in the pass leaves the previous generation, its
  pointer and the row's state exactly as they were.
* The record names its identity (`rootName`, `pairId`, `dirPath`), the source's
  **content** hash and byte count, the effective settings, the accepted metadata
  with its provenance, what was requested, and the exact size/SHA-256 of every
  output as committed (R02/R08).
* The last two generations survive a commit; pruning is best-effort and never
  fails a commit.
* A pre-v2 folder (`export.json`) is classified `stale` and refused with a
  visible "re-export" reason (R24) — its hashes describe a path, so nothing in
  it can be reused.

## 2. Recovery (R10, report §5)

`src/lib/upjournal.ts` (pure rules) + `src/upload/jobjournal.ts` (the IO half)
record one attempt per stage and the accepted metadata:

* every stage transition is on disk **before** the next stage starts;
* an `interrupted` row is produced exactly once — the write is the proof — and
  the sentence is the user's: with a draft, `Interrupted at <stage> — the
  accepted metadata is saved; a re-export reuses it and does not ask the model
  again`; when a paid stage was entered without one, `Interrupted at <stage> —
  a paid request's outcome is unknown; nothing is resent automatically`;
  otherwise `Interrupted at <stage> — re-export to finish`;
* a run that crashed **after** its own commit is settled as `processed` (the
  pointer, not the journal, is the truth of "did this publish?");
* the draft carries the full provenance (model, request id, tokens, estimated
  cost), so a recovered AI answer is still recorded as an AI answer — never as
  something a human typed;
* the journal holds no key, no image bytes and no request payload.

## 3. Blockers closed in this change (each with its test)

| Id | What was wrong | Where it is fixed | Test |
|---|---|---|---|
| R01 | outputs published beside an old manifest | pointer + immutable generations | `up_pipeline` (pointer last, failed pass keeps the old generation), `up_acceptance` (pointer write fails → previous package current) |
| R02 | source identity by path/stat | SHA-256 of the bytes (`readSourceBytes` → `raster.sha256`) | `up_acceptance` (same size + mtime, edited bytes ⇒ different identity) |
| R03 | metadata cache keyed like a stat | cache keyed by the content hash (`stores.metaKeyOf`) | `up_acceptance`, `upload_ui` (cache hit by content) |
| R04 | `<style>` removed without materializing it | `upprepare.materialize` writes resolved presentation only where it differs from the parent | `up_stylebake` |
| R05 | title written to IPTC 2:07 | `ObjectName 2:05`, `EditStatus` left empty | `up_iptc` (write + independent read) |
| R06 | "present metadata" counted as verified | `upverify` compares SVG **and** JPEG fields with the accepted metadata; validate is a hard gate | `up_verify`, `up_pipeline` |
| R07 | one fingerprint for pixels and encoding | `upfinger` raster (MP) vs encode (quality); `planReexport` schedules re-embed for pixels-equal | `up_finger`, `up_pipeline` |
| R08 | pre-embed JPEG stats published | stats recomputed from the final bytes after the segment surgery | `up_acceptance` (record vs committed bytes) |
| R10 | a closed tab lost the paid answer | durable journal + draft (report §5) | `up_journal`, `up_recovery` |
| R18 | preferred version accepted unapproved | `chooseVersion` requires `generated` **and** `approved` for every candidate | `up_sources` |
| R19 | "select all" as a no-op | `checkAllIds` scopes exactly the ids it is given | `up_acceptance` |
| R21 | a required output failure published anyway | the stage machine returns before `commit`; only an EPS skip is `partial` | `up_acceptance` (JPEG failure ⇒ no export folder at all) |
| R24 | one schema identity, folder identity | schema id + version in one place; icon-scoped records and generations | `up_export`, `up_sources`, `up_acceptance` (two pairs, one directory) |
| R25 | ~21 MB Arena capture in the tree | not carried into this branch (the tree holds only the UI templates) | `git ls-files "design temp"` |

## 4. Acceptance runs (this checkout)

```
npx tsc --noEmit                  clean
npm run lint                      0 errors (11 warnings, all pre-existing; 3 legacy files)
npx vitest run                    1213 tests / 116 files — all green
npm run coverage                  93.5 % statements / 96.3 % lines; src/lib lines gate (≥80 %) passes
node tools/quality.mjs --changed --allow-legacy
                                  GATE PASSED (new files ≤300 lines, CC ≤10, params ≤4)
npm run build                     vite single-file build: PASS
```

`node tools/quality.mjs` **without** `--allow-legacy` still fails on three
untouched files (`src/App.tsx`, `src/lib/detect.ts`, `src/lib/render.ts`); that
is the pre-existing baseline the ratchet exempts, not a regression of this
change.

## 5. What this change does NOT do (honest limits)

* The 140ece1a donor's **filters/sort/search UI, dry-run audit line and
  revocation of replaced object URLs** are not ported yet: the base's panel
  shows status filters and per-row state, not the full workbench. The base's
  export preview is built from the export copy in memory; published-artifact
  previews (reading the committed SVG back) are still to come.
* Consent/abort exists as the confirm dialog + `cancelled` checks between
  stages; there is no AbortController around an in-flight provider request yet.
* The real browser run (Chromium/Edge, `showDirectoryPicker`, canvas encode) has
  not been performed **in this checkout** — the canvas and the provider are
  injected, so what is proven here is the wiring and the bytes' bookkeeping, not
  a canvas encoder's output. The donor branch's browser probes
  (`origin/01a0f966`) remain the reference for that step.
* The donor behaviors listed above still live on `origin/01a0f966`; the port is
  phase-by-phase (report §7), and each phase will land as its own commit with
  its own failure fixture.
* Coverage of `upraster.ts`/`upsvgo.ts` remains low because their browser halves
  need a real canvas; the pure halves and the seams are covered.
