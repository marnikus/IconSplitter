# The SVG source list: approved AI outputs only, one row per AI path (2026-10-05)

Reported after the previous fixes: the Generate SVG list still shows (1) the same
AI source several times and (2) reference images — names without `_AI` — as
images to generate from.

> **1. Duplicate rows: the same AI source/SVG appears multiple times.**
> **2. Reference images without "_AI" are incorrectly listed as SVG-generation
> sources.**
> … **problem still exist 1. duplicates of same image in list** …
> **problem still exist 2 incorrect detection of reference image in folder and AI
> image that should be generated here: `icon-airplane-landing.png` — this name
> clearly has no "_AI" so it ref image. but app detected it as Image to generate
> SVg wich is wrong**

with the audit they asked for:

> **• Scan the complete dataset, not samples.**
> **• Report total files, eligible AI sources, references excluded, duplicates
> removed, missing files, and final unique rows.**
> **• Verify every row: is an approved AI image, contains "_AI" by naming policy,
> exists on disk, appears once only, maps to the correct sidecar and newest SVG.**
> **FIX • Build the list from approved AI outputs only. • Require the canonical
> AI naming rule, including "_AI". • Exclude original/reference images from SVG
> tab. • Deduplicate by normalized stable source ID/path, not row index or split
> folder. • Map only the newest SVG version to each unique AI source.**

## 1. What actually produced the two symptoms

Both are the same mistake: **the list was built from decisions, not from files.**

`src/svg/sources.ts` built its rows in two halves and concatenated them:

```ts
const sources = sortSources([...approved.map(toSource), ...recordSources(orphans)]);
```

1. `toSource(pair)` never required the AI file to exist. For a pair whose AI side
   is gone it used `expectedAiPath(pair)` — an **invented** `<stem>_AI<ext>` name
   built from the surviving reference — and gave the row `fingerprint:"missing"`
   while still offering Generate. A pair is only `(source, ai)`; when `ai` is
   null the pair *is* a reference image, so the row was a reference wearing an
   invented AI name.
2. `recordSources(orphans)` turned **every approved decision record whose
   `pair_id` did not match this scan** into a row, using
   `r.ai_result ?? r.source ?? r.pair_id`. Two consequences, both reported:
   * a record with no `ai_result` (a pair approved in Selection while its AI
     image was already missing) listed **the reference file** as a source —
     `icon-airplane-landing.png`, exactly the screenshot;
   * two records naming the same `ai_result` (an old id plus a new one — the ids
     drift whenever a file moves between `split_NN` folders) each produced a row
     for the same file: the duplicate, with *both* rows claiming `Files missing`
     because a record-only row has no file behind it.

Nothing deduplicated the two halves, and nothing checked that a row's path was
unique, that its name carried `_AI`, or that the file was on disk.

The sidecar/version half was already right: `toRow` maps one source onto
`newestValid(sidecar)` and the row's preview, Copy and Code all read that same
version (`previewTargetOf`), so "only the newest SVG version per AI source"
holds once the source half is correct.

## 2. The contract (what a row is now)

A row exists **iff** all of these hold:

1. a file on disk parses as a canonical AI name (`parseAiName`: `…_AI`,
   `…_AI_7`, `…_AI_9_01`) with a **raster** image extension, and is neither one
   of this app's own version artifacts (`_v2.svg`) nor one of its own outputs
   (`…_AI.svg`) — an artifact is never a source, or a second run would feed it
   back into generation (I-34);
2. that file is the AI side of a pair the Selection workflow **approved** — by
   the pair's own id, or by an approved record whose `ai_result` names that
   exact path (ids drift when a file moves; the recorded approval does not);
3. nothing else already claimed the same normalized AI path.

The approval of rule 2 is attributed: **the first decision record naming a
claimed path is that path's approval**, and only a *second* record naming it is
a duplicate. Without that, every folder that was reorganised inside
`_split_output` (which moves the derived ids away from the recorded ones) would
report its whole approved set as duplicates, and the user's own duplicate —
two records for one image — would drown in the noise.

Everything else is **reported, never listed** — the information the earlier
"keep missing pairs visible" rule was protecting is kept, but it is no longer
dressed up as a generation row:

| Case | Reported as |
|---|---|
| an approved pair whose AI image is gone (or was never there) | `ai-missing` — *no AI image (`X_AI.png`) beside `X.png`* |
| an approved record with no files left on disk | `no-files` — *only the decision record remains for `<path>`* |
| an approved record naming a reference image (`ai_result` null) | `not-ai-output` — *`<path>` is a reference image, not an AI output* |
| an approved pair whose AI side is this app's own `…_AI.svg` output | `artifact` — *`<path>` is this app's own SVG output, not an AI image* |
| a **second** approved record naming a path a row already has | `duplicate` — *duplicate record for `<path>` — the same source is already reported* |

and the scan reports the audited numbers the user asked for:

```
Audit — 312 files · 96 AI sources · 12 references excluded · 3 missing files · 2 duplicates removed → 93 rows
```

(`files` = every file the walk saw, `AI sources` = canonical AI **raster**
images on disk (artifacts are in no bucket), `references` = image files that are
not AI sources, `missing` = the `ai-missing` + `no-files` cases, `duplicates` =
the extra records for an already-claimed path — N records for one path are one
row and N−1 removed, `rows` = the final unique list. It is shown in the source
bar — `svg-audit` — and logged as the scan's detail with the same numbers as
fields, so a short list is never a mystery.)

## 3. Module plan (RULE 18: ideal 150–300 lines, functions ≤ 20)

| File | Change | Size |
|---|---|---|
| `src/svg/sourcelist.ts` | **new**: the selection rules — eligibility (canonical `_AI` **and** raster), approval by pair id or by path, the attribution + dedupe, the exclusions, the audit counts and their one-line text | 247 |
| `src/svg/sources.ts` | `discoverApprovedSources` calls it; `toSource`/`expectedAiPath`/`recordSources` deleted | 155 → 137 |
| `src/svg/SourceLine.tsx` | the audit line (`svg-audit`) next to the scope copy | 71 |
| `src/svg/SvgPanel.tsx` | the banner for excluded sources (`svg-warn-excluded`), and the row-problem banner reworded to "listed source(s)" | 260 |
| `src/svg/scankey.ts` | the exclusions and the audit join the snapshot key (`auditKey`) | 41 |
| `src/svg/scan.ts` | the scan log carries the audit as its detail + fields, and warns for the exclusions | 158 |
| `src/index.css` | one class (`.svg-audit`, muted 10 px, under the scope copy) | +1 |

`lib/pairing`, the sidecar IO, `lib/svgfile` and the row model are untouched:
the pairing was never wrong, and neither was the version mapping.

## 4. TDD order (red before green, per cycle)

1. `tests/svg_sources.test.ts` (**new**) — the rules, against a root built like
   the reported one:
   * a reference-only approved pair (`ai_result: null`) → **no row**, one
     `not-ai-output` exclusion;
   * the same AI path in two records with different ids → **one row**, one
     `duplicate` exclusion;
   * an approved pair whose AI image was deleted → **no row**, `ai-missing`;
   * an approved record with nothing on disk → **no row**, `no-files`;
   * the audit numbers (files / AI outputs / references / missing / duplicates /
     rows) for that root;
   * every row: name contains `_AI`, file exists, is a raster, path unique —
     the user's own per-row checklist, asserted as a loop over the fixture;
   * the attribution rule: a stale record naming a row's path is **not** a
     duplicate, a second one is (`N−1` reported), and a `declined` pair's own
     record beats an older approved record for the same path;
   * two AI files with the same name in different `split_NN` folders → **two**
     rows (different paths are different sources), and a `_vN.svg` artifact
     beside an AI image adds no row;
   * repeated discovery over the same tree (and a mirrored enumeration) → byte-identical rows, order and audit.
2. `tests/svg_ui.test.tsx` — the missing-AI pair is not a row, the banner names
   the reason, the audit line shows the numbers, and a row's newest version is
   still the one the preview/Copy use.
3. Update the tests that encoded the old contract (`tests/svg_io.test.ts`,
   `tests/svg_scan.test.ts`) — they asserted "a missing AI image stays a row",
   which this change reverses.

## 5. Verification

* `npm run verify` (6 lanes) and the RULE 16/18 recheck over the touched files.
* The audit numbers asserted on a fixture whose counts are known by hand, so a
  future change cannot quietly re-list a reference or a duplicate.
* The headless-Chromium probe re-run on both tabs at 1440×900 (the source bar
  grows a line; nothing may cover a row checkbox).
* The full-list audit the user asked for is produced **by the app** now: the
  scan line reports total files, AI outputs, references, missing, duplicates and
  rows for the *whole* picked folder, and every listed row satisfies the
  checklist by construction (asserted in the test above).

### 5.1 Results (2026-10-05)

* `tests/svg_sources.test.ts` — 11 tests, the reported root among them; the
  existing suites that had encoded the old contract updated
  (`tests/svg_io.test.ts`, `tests/svg_scan.test.ts`, `tests/svg_ui.test.tsx`,
  where the audit numbers are asserted as literals). Whole suite: 77 files,
  736 tests, all green.
* `npm run quality:changed` — GATE PASSED over all 15 changed files (RULE 16/18).
* Headless Chromium probe, 1440×900, a fake root with 12 healthy approved pairs
  **plus** the reported tree (one AI image named by three records, two approved
  references with no AI image; the probe's records carry ids from other folders,
  which is exactly how the ids drift in real use):

  | Check | Result |
  |---|---|
  | rows for that root | 13 = 12 healthy + the bunny **once** (before: the same image twice, plus the references) |
  | every row name | carries `_AI`; no reference image (`icon-airplane-landing.png`) listed |
  | `svg-audit` | `Audit — 30 files · 13 AI sources · 14 references excluded · 2 missing files · 2 duplicates removed → 13 rows` |
  | `svg-warn-excluded` | "4 approved source(s) are not listed — 2 with no AI image on disk, 2 duplicate records", with the first reasons spelled out |
  | scan log | `svg.scan · Audit — 30 files · … → 13 rows · aiSources=13 · duplicates=2 · files=30 · missing=2 · references=14 · rows=13` |
  | layout, both tabs | 3 scroll positions each: row controls visible, the dock covered 0 of 11 (SVG) and 0 of 15 (V2) visible controls, 0 blocked hit-tests, the window itself never scrolls, and a real mouse click on the last row's control toggles it (`false → true`) |

## 6. Rejected alternatives

* **Drop the exclusions silently.** The earlier rule (2026-10-05 determinism)
  was "never hide a pair — give it a status"; the answer here is not to hide it
  but to stop calling a reference a generation source, and to report every
  excluded approved source with its reason (banner + audit + log). Nothing is
  lost, nothing is invented.
* **Keep missing-AI rows but disable Generate.** The row would still be a
  reference image with an invented `_AI` path — the exact thing reported — and a
  disabled row that cannot ever be generated is noise. Reported, not listed.
* **Dedupe by row index or by split folder.** Both are unstable: the index moves
  when the sort changes, and two split folders are two real files. The key is
  the normalized AI path.
* **Report every record naming a claimed path as a duplicate.** Probed first:
  with the 12 healthy pairs approved by path (the real shape after any
  reorganisation inside `_split_output`), that reported 14 duplicates for 2 real
  ones and buried the user's own duplicate. The first record naming a path is
  the approval; only the next one is the duplicate.
* **Trust only the pair id (no path-based approval).** Then a moved file loses
  its approval and disappears — the ids are derived from the folder, so any
  reorganising inside `_split_output` would silently empty the list. The
  recorded approval names the path; the path is what the row is.
* **Re-walk the tree per row to check existence.** `pairEntries` already only
  ever reports files it saw on disk; the row comes from that scan, with its
  fingerprint.

## 7. Invariants

* **I-31 (SVG list, RULE 3/4):** a row in the Generate SVG list is an **existing
  canonical AI output** whose path an approved decision names — never an
  invented `_AI` name, never a reference image, never a path that is not on
  disk. A source that fails this is excluded *with its reason*, and the scan
  reports it; it is never silently dropped and never offered for generation.
* **I-32 (identity, RULE 6/24):** one normalized AI path = one row, whatever
  the row index, the split folder or how many decision records name it; the
  rows' order is the deterministic path order, so a reload or a repeated rescan
  yields byte-identical rows, order and audit.
* **I-33 (audit, RULE 4):** every scan states the whole picture — files walked,
  AI outputs on disk, references excluded, missing sources, duplicates removed
  and final rows — in the UI and in the log, so a different number than the user
  expects can be traced to a named reason. The exclusions and the audit are part
  of the snapshot key, so a changed count is a changed scan.
* **I-34 (naming, RULE 3):** a source must be a **raster** image. This app's own
  output (`…_AI.svg`) and its versioned artifacts (`…_v1.svg`) are never sources
  and are never counted as AI sources — otherwise a second run would feed an
  artifact back into generation, and the audit's counts would not add up. (The
  audit itself found this: the first probe run counted the app's own
  `fog_AI.svg` as an AI source.)
