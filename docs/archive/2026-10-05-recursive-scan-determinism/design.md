# Design — reloading an unchanged folder must be a no-op

Date: 2026-10-05 · Status: implemented · Modes: Selection review (tab 4) and
Generate SVG (tab 5) — both read the same recursive scan

Prompt under work (verbatim intent):

* **PROBLEM.** Reloading the same unchanged folder returns different
  missing-AI counts; some approved pairs disappear from the list. e.g. 4 missing
  after one scan, 5 after the next.
* **RESEARCH.** Trace scan concurrency, file readiness, path normalization,
  cache/session restore, pairing and stale-row removal. Compare complete file
  snapshots *before* mutating UI/state. Add detailed per-file exclusion reasons.
* **FIX.** Scanning must be **deterministic and atomic**: stable normalized
  paths/ids, deterministic ordering; do not hide a pair until absence is
  confirmed after the full scan; **keep missing pairs visible with a status**
  instead of silently removing them; prevent overlapping scans and never let a
  stale result overwrite a newer one.
* **VERIFY.** Repeated scans of unchanged folders produce identical files,
  pairs, counts and order; plus reload, concurrent rescan, locked/slow files,
  rename, deletion and restart.

**This reverses a decision of `2026-10-01-generate-svg`.** That design decided
that an approved pair whose AI image is gone is *reported and not listed*
(`Discovery.missing: string[]`). The prompt says the opposite: the pair stays in
the list with a status, and "absence confirmed" is a property of the finished
scan, not of a row being dropped.

## 1. What is actually wrong today

| # | Defect | Where | Consequence |
|---|---|---|---|
| S1 | the filesystem's enumeration order **is** the algorithm's input | `src/lib/fs.ts:34` (`for await (const [, handle] of dir.entries())`), `src/lib/scan.ts:52` (`collect`), `src/lib/pairing.ts:65` (`if (!out.has(...)) out.set(...)`) | the same folder scanned twice can produce a different pair list, different row identity and different counts |
| S2 | an approved pair with a missing side is **removed** from the list | `src/svg/sources.ts:55` (`splitApproved` → `missing: string[]`, base names only) | the row vanishes; only a banner count remains; a file that alternates readable/unreadable moves the row in and out of the list → "4 missing … 5 missing" |
| S3 | a failed `getFile()` is laundered into data (`size: 0, mtime: 0`) and `unreadable` is defined as `size === 0` | `src/lib/fs.ts:51-58`, `src/svg/sources.ts:47` | a transient read failure becomes a real `0:0` fingerprint that `diffScan` and the fingerprint cache read as "changed"; a genuinely empty file is mislabelled "could not be read" |
| S4 | a **scan writes to the folder it scans** | `loadDecisions` → `createEmpty` (`src/selection/reviewstore.ts:20-31`) writes `review-decisions.json` when absent | a scan mutates its own input; the File System spec allows a concurrent iteration to include or omit an entry created mid-iteration, so two tabs scanning the same root can disagree |
| S5 | no scan is sequenced against another | `scanSources` (`src/svg/scan.ts:34`) is called by boot, Rescan and Choose folder; `rescan` (`src/selection/useSelection.ts:104`) by boot, Rescan and the 30 s watcher; no epoch anywhere | a slow, older scan resolves last and overwrites the newer snapshot ("stale results overwrite newer ones") |
| S6 | a finished scan commits unconditionally and in several steps | `scanSources`: `setRows` → `setDiscovery` → `setRootToken` → `saveSourceIndex` → `pruneChecked` | an unchanged rescan still replaces every row (flicker, lost row state, every preview re-reads its file); a throw after `setRows` leaves the state half-committed while the catch reports a failed scan |
| S7 | nothing survives that says *which file* was skipped and *why* | `Discovery.missing: string[]`, `Discovery.unreadable: string[]` | the user cannot tell a locked file from a deleted one |

### 1.1 S1 is not theoretical (proved by probe, then removed)

`parseAiName("icon-airplane-landing_AI_8_01.svg")` returns
`{base: "icon-airplane-landing", suffix: "_8_01", ext: ".svg"}` — a split folder
really does hold `…_8_01.png` **and** `…_8_01.svg`, and both are AI candidates
for the same `pairId`. A probe over `["…_8_01.png", "…_8_01.svg", "….svg.json"]`
in two insertion orders produced the same pair id but a **different `ai` side**:
the PNG in one order, the SVG in the other. `X_AI_v2.svg` (a versioned output)
does not parse as an AI name at all, so it became an orphan *source* row saying
"AI result missing" — a generated version adding a phantom row.

## 2. Research (2026-10-05)

| Source | Fact | Decision it drives |
|---|---|---|
| WHATWG File System §2.4.1 (`fs.spec.whatwg.org`, fetched) | "This is intentionally very vague about the iteration order… no guarantees are given about the exact order in which elements are returned"; entries created/deleted during iteration "might or might not be included" | the scan must impose its **own** order (D1) and must not treat a mid-write listing as truth (D3/D5) |
| Chromium issue 40691106 (`readEntries()` returns whatever batch it likes) | the enumeration API is not a stable contract; all entries arrive, order/batching is unspecified | same as above |
| MDN `FileSystemFileHandle.getFile()` | the returned `File` is "only readable as long as the underlying file on disk hasn't changed"; after a change `getFile()` must be called again | a failed read is *unknown* → one bounded retry, then a status, never a fabricated size (D3) |
| MDN `createWritable()` / WHATWG §2.3.2 | writes go to a temporary file replaced on `close()`; user agents *try* to ensure no partial writes (best-effort, UA-dependent) | a scan can still race a swap → retry + unreadable status, never data (D3) |
| Standard I/O retry practice (SO/file-lock answers) | a lock is transient; retry briefly, then report | one immediate retry, then report — never a sleep loop in a UI scan (D3) |

## 3. Decisions

**D1 — One canonical order, imposed by the walk.**
`walkTree` (`src/lib/scan.ts`) sorts every directory's children with
`compareNames` before recursing: case-insensitive by name, raw code units as the
tiebreak. This is the single gate, so any `TreeNode` producer (real FS, fakes,
future) yields the same flattened list. `readDirTree` keeps the FS order it was
given — order is the walk's responsibility, not the adapter's.

**D2 — `pairEntries` is a function of the entry *set*, not of its order.**
For one pair id, the AI side is chosen by an explicit priority instead of
"first writer wins": (1) a raster result (`isImageExt` and not `.svg`) beats
`.svg`, because the SVG is the *artifact* (`saveSvgVersion` writes `<stem>.svg`)
and the raster is the result the AI produced; (2) then `relPath` ascending —
which also settles a case-only name collision deterministically. The returned
list is sorted by `(relDir, base, suffix)` — meaningful and stable, not a hash
order. `ReviewPair` carries the `suffix` for that order, and a versioned output
of this app (`X_AI_v2.svg`) is ignored by `isVersionArtifact` (it parses as
neither an AI name nor a reference, and used to become a phantom source row).
Property: any permutation of the same entries returns the same list, byte for
byte.

**D3 — A failed read is a state, never a size.**
`TreeNode` and `FileEntry` gain `error: string | null`
(`"unreadable"`). `fileNode` tries `getFile()` **twice** (two attempts, one
immediate retry — enough to survive a temp-file swap) and only then flags the
node; the fabricated `size: 0/mtime: 0` is kept for shape but never used as
evidence. `unreadable` is `error !== null`, so an empty file is no longer
mislabelled. `diffScan` marks an errored entry as *seen but unclassified*: it is
neither new, nor changed, nor missing — honest unknown. One wording
(`unreadableReason`) is shared by the pair problem and the discovery report.

**D4 — Every approved pair is listed; absence is a status.**
`splitApproved` disappears. For each pair with an approved decision the scan
emits one `SvgSource`, using the AI side when it exists (readable or flagged for
unreadable) and — when the AI file is gone — the AI name the naming rule expects
beside the reference (`completion`: `architecture/court.png` →
`architecture/court_AI.png`), so the row keeps the identity and the artifact
path it had before the file vanished. Approved records whose pair has no file at
all this scan (`mergeDecisions` already returns them as `orphans`) are listed
too, reconstructed from the record's own `ai_result` / `source` path, with the
status "files missing". Every reason travels in `problems: SourceProblem[]`
(`id`, `kind`, `relPath`, human `reason`); `approvedTotal` was dropped because
with every approved pair listed it could only repeat `sources.length` (the count
line reads `sources.length` directly).

**D4b — What is *not* done here.** A row whose AI file is gone still offers
Generate; the run then fails that source honestly. Disabling it only on the row
would leave the bulk paths inconsistent, so it is left to the run's per-source
failure report.

**D5 — A scan writes nothing.**
`loadDecisions` is read-only; `review-decisions.json` is created by the first
`saveDecisions`, not by opening a folder. A folder is never modified by looking
at it. (`LoadOut.missing` stays, meaning "there was no file to read".)

**D6 — Only the newest scan may commit.**
A tiny pure module (`src/lib/scanseq.ts`) hands out a ticket: `beginScan` bumps
the sequence and makes that ticket the newest; `isCurrent(seq, id)` is the only
permission to touch state. A scan that began earlier and finishes later commits
nothing — not rows, not discovery, not the index, not `busy`, not a toast.
Overlap is therefore harmless without pretending the FS API can be cancelled.

**D7 — Build the whole snapshot, compare, then commit once.**
`scanSources` builds every row (sidecars included) locally, computes one
`scanKey` (`src/svg/scankey.ts`) over the root name, the discovery *and* the row
identities (source id, path, fingerprint, sidecar revision, status, error), and
then: identical key → commit nothing (no row replacement, no root token, no
preview reload); different key → one commit block (`setRows`, `setDiscovery`,
`setRootToken`, `pruneChecked`) followed by best-effort cache and report writes
whose failure is reported but can no longer half-commit the scan. The Selection
tab applies the same rule through `applyScan`: an unchanged pair set keeps the
previous `pairs`/`records` **by reference**, so the list cannot churn.

**D8 — Say it on the row, not only in a count.**
`SvgSource.problems` renders one status line per affected row
(`svg-problem-{id}`), `Discovery.problems` feeds the banner with the reasons,
`SVG_PROBLEM_LABEL` gives each kind a short label. A row whose files are gone is
still a row: checkbox, identity, status, disabled generation actions.

## 4. Module plan (RULE 18 sizes are targets, not decorations)

| File | Change | Target |
|---|---|---|
| `src/lib/scan.ts` | `compareNames`, `error` on `TreeNode`/`FileEntry`, `walkTree` sorts, `diffScan` buckets unreadable entries | 156 lines |
| `src/lib/fs.ts` | `fileNode`: two attempts, `error: "unreadable"` | 151 lines |
| `src/lib/pairing.ts` | order-independent `pairEntries`, `resultRank`/`beats`, `problemsOf`/`unreadableReason`, `SideRef.error`, `ReviewPair.suffix` | 209 lines |
| `src/lib/scanseq.ts` | **new**: `ScanSeq`, `SCAN_IDLE`, `beginScan`, `isCurrent` | 25 lines |
| `src/svg/scankey.ts` | **new**: `rowKey`, `scanKey` | 33 lines |
| `src/svg/sources.ts` | `SourceProblem`/`FileProblem`, `PROBLEM_LABEL`, `toSource`/`recordSource`, `expectedAiPath`, read-only discovery | 164 lines |
| `src/svg/scan.ts` | ticket, build-then-commit, key compare, best-effort index + report | 128 lines |
| `src/selection/state.ts` | `applyScan` keeps `pairs`/`records` identity when the pair set is unchanged (`samePairs`/`sideKey`) | 213 lines |
| `src/selection/useSelection.ts` | ticket in `Ctx`, gated commit/busy | 294 lines |
| `src/selection/reviewstore.ts` | `loadDecisions` no longer creates the file | 56 lines |
| `src/svg/types.ts` | `SvgRefs.scanKey`, `SvgRefs.seq` | 70 lines |
| UI | `SvgRow.ProblemLine` (`svg-problem-{id}`, `.svg-file-problem`), `SvgPanel.problemSummary` in the `svg-warn-problems` banner | small |

## 5. TDD order (red → green; no production line before its test)

1. `tests/scan.test.ts` — canonical order (`walkTree` ignores input order, dirs
   and files interleaved by name), `error` travels to `FileEntry`, a size-0 file
   is **not** an error, `diffScan` does not report an unreadable file as
   changed/lost.
2. `tests/pairing.test.ts` — permutation independence (png+svg+json fixture, a
   versioned svg, an orphan source, missing and unreadable sides), the raster
   side wins, `X_AI_v2.svg` is an orphan *source*, `problemsOf` reasons.
3. `tests/fs.test.ts` — a file that throws once is read on the retry; a file
   that always throws is `error: "unreadable"`; `readDirTree` still lists it.
4. `tests/offline.test.ts` / `tests/fs.test.ts` — `loadDecisions` on a root
   without the file creates **nothing** (`missing: true`, no new child).
5. `tests/svg_io.test.ts` — an approved pair whose AI file was deleted stays in
   `sources` with an `ai-missing` problem; an approved record with no files is
   listed as `files-missing`; two scans of the same root built in two insertion
   orders produce identical `Discovery` JSON and identical rows; the scan writes
   nothing into the root.
6. `tests/svg_scan.test.ts` (**new**) — a superseded scan commits nothing (rows,
   discovery, root token, index, busy, toast); an identical rescan commits
   nothing; a changed root commits exactly once.
7. `tests/selection_scan.test.ts` (**new**) — `rescan` (the exported plain
   function) drops a superseded result, keeps `pairs` by reference when nothing
   changed, and clears `busy` only when it is the newest.
8. `tests/svg_ui.test.tsx` — a source whose AI image is gone renders as a row
   with its reason, and the banner names the count.
9. `tests/pairing.test.ts` — a case-only collision resolves the same way both
   times; `tests/svg_scan.test.ts` — a fresh boot rebuilds identical rows;
   `tests/selection_scan.test.ts` — a folder rename carries the decision once
   and the new snapshot is stable.
10. Docs: `SYSTEM_OF_RECORD` (scan contract + `I-21`), `UI_SELECTORS`
    (`svg-problem-{id}`, the new banner ids), `QUALITY_RECHECK` (dated entry),
    `docs/README.md` archive row.

## 6. Verification (the prompt's list, mapped)

| Prompt requirement | Test |
|---|---|
| repeated scans → identical files/pairs/counts/order | 5 (two insertion orders + repeat) |
| reload | 5 (fresh `refs`/boot scan equals the first scan) |
| concurrent rescan | 6, 7 |
| locked / slow files | 3 (retry, then unreadable status) and 5 (row stays listed) |
| rename | 2 (order-independent identity) + Selection `carryRenamed` still green |
| deletion | 5 (`ai-missing`, `files-missing` rows stay visible) |
| restart | 5 (the decision file is the only memory; the scan result is a function of the files), 9 (a fresh boot rebuilds identical rows) |
| per-file exclusion reasons | 2 (`problemsOf`), 5 (`Discovery.problems`/`unreadable`), 8 |
| no writes by a scan | 4, 5 |

## 7. Rejected alternatives

* **Sort in `readDirTree` only** — makes order a property of one producer; any
  other `TreeNode` source (tests, batch, a future importer) can break the
  invariant. The walk owns the order (D1).
* **Treat `.svg` as "not an AI result"** — a user may hand-write `X_AI.svg` with
  no raster; it stays as the *fallback* AI side, just never preferred over the
  raster the AI actually produced (D2).
* **NFC/NFD path normalisation** — no observed hazard on one machine, and
  normalising the stored name would break `getFileHandle(name)`, which matches
  the on-disk name byte for byte. Noted as a cross-platform follow-up, not done.
* **Cancel an in-flight `entries()` iteration** — the File System API offers no
  cancellation; the ticket makes a stale scan's *effect* nil, which is what
  "prevent overlapping scans" actually needs (D6).
* **Parallel sidecar reads** — a real speed-up, but it is not a determinism fix;
  deferred to keep this change reviewable.
* **Auto-retry a whole failed scan** — masks the failure and can loop; the row
  carries the status instead (D4/D8).
* **Keep `missing: string[]` alongside `problems`** — two sources of truth for
  one fact; the banner and its tests change in the same commit (D4).

## 8. Invariants after this change

1. `discoverApprovedSources(root)` is a function of the file **set**: same set →
   byte-identical `Discovery` JSON, in the same order, on any platform, any
   number of calls.
2. Every approved pair is in `sources`. Nothing is dropped silently; a pair is
   hidden only when its decision is no longer approved.
3. A scan performs zero writes inside the scanned root.
4. Only the newest scan may commit; a superseded scan commits nothing at all.
5. An unchanged snapshot commits nothing.
6. Every file that could not be read is reported with its path and a reason;
   `size === 0` is never evidence of a read failure.
7. `pairEntries(entries)` is invariant under permutation of `entries`.
