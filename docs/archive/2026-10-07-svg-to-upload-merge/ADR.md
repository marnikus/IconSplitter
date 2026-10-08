# ADR — the three-branch "SVG to upload" merge (P0 of the merge report)

Source of truth for this work: `design temp/SVG tab generation/tab review merging report/merge report.html`
(the two-pass adjudication of `arena/140ece1a` = A, `arena/01a0f966` = B, `arena/d658a5b8` = C).
This ADR records the decisions P0.3/P0.4 asked for **before** any donor file moved, so the
merge is not re-litigated file by file.

* Plan executed here: report §11 phases P0–P7, each ending with `npm run verify` green and its
  own exit gate; every cherry-pick lands with its own red-then-green test (report §12 closes).
* Reports §13 checklist and §12 playbook are the acceptance contract.

## 1. Starting position (measured, not assumed)

| Fact | Value |
|---|---|
| Session branch | `arena/b4d96c50-iconsplitter`, one root snapshot commit `1f26d6e` "upd report" |
| Snapshot content | `main` (`5e635ce`) **plus** branch B's `src/svgupload/` + `src/lib/svgupload/` + 25 B test files, the mockup `design temp/SVG to upload/`, the merge report, and `design temp/Arena setup analyze/` (21 MB of unrelated saved page + ~117 assets) |
| `node_modules/`, `dist/` | untracked in the snapshot (main had them committed; the snapshot already cleaned that up) |
| Baseline gates on the snapshot, before this merge | `npm run verify` 6/6 — 116 test files, all green, **95.47 % statements / 89.34 % branches**, single-file build OK |

Branch A's fork point is `e94ade3`; it has **no** merge base with `main` (the snapshot is a root
commit), so A was landed with per-file 3-way merges against `e94ade3`, never a branch merge.

## 2. Decisions taken now (report §10 "decide each one NOW")

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Which branch is the base? | **A** (report's verdict). B's in-tree implementation is **deleted**, not kept as a second panel. | RULE 10 — one control per decision; the report's P1 and T26 require A's namespace. B's capabilities return as the P2/P3 ports with new tests (git history keeps the donor). |
| D2 | Namespace / vocabulary | tab id `upload`, testid `tab-upload`, `upload-*` handles, `src/upload/`, pure rules in **`src/lib/upload/`** (folder, `geom/` subfolder), storage `iconSplitter.upload.*.v1`, log feature `"upload"` | P0.4 / CP-14. A already used all of it except the flat lib layout, which this ADR moves into the folder. |
| D3 | Shared-file drift (A's lineage is older than `main`) | Keep **`main`'s** newer work: `PROBLEM_LABEL` in `lib/pairing`, `finish_reason` in `svgrequest`/`svgstream`, the typed stall outcome in `svgstreamread`, richer `DirHandleLike.removeEntry` | Those are exactly CP-8/CP-11's donor halves and R09's fix; reverting them would re-open closed defects. |
| D4 | IPTC IIM (APP13) — CP-9 | **Deferred.** XMP APP1 + the full record in `export.json` stay the carriers. | A ruled IPTC a legacy binary form; the report makes CP-9 gated on "does your destination read APP13?", which is unknown. Reversal path is C's idempotent surgery (§4 C3), kept in the register. |
| D5 | Duplicate names in `export/` — T28 | **`export/` is the feature's own folder:** a file whose name the current record already owns (or that ends in a rebuilt name with a matching record) is overwritten — that is the idempotent re-export. A file the record does **not** own (no record, or a different stem) is **never** overwritten: the stage fails closed and says which file it refused. | RULE 23 ("never a partial file") + RULE 14 (exports are the user's). Suffixing was rejected: it silently grows folders and breaks RULE 22's traceability on re-export. |
| D6 | Zoom range | Keep **one** control: the shared `svg-thumb` 48–800 px (I-55). The mockup's 48–440 / default 128 is recorded as a deliberate deviation in `SYSTEM_OF_RECORD`. | RULE 10 — a second zoom range for one panel is a second control for the same decision. |
| D7 | Cost display (CP-17) | Keep A's "no cost reported → `-`, never invented" **and** add C's rate-card figure only when it carries BOTH an `Estimated` label and a pricing version, as an addition (P4). | Report CP-17; RULE 4 — an empty/honest value must never look like a measured one. |
| D8 | Interruption model (P2.6) | **Two sources of truth, defined precedence:** on scan, a non-committed `export.json` *on disk* wins (it travels with the folder); within a session, the in-browser jobs store wins; they may never both drive the same row in one pass. | Report P2.6; RULE 13 — persisted state must be readable and honest after any restart. |
| D9 | EPS | Keep A's genuine subset writer + `verifyEps`, surface the subset limit on the row, EPS stays opt-in (`includeEps` default false) until a real upload settles R3. | Report R3. |
| D10 | A's "8 lint warnings" | They are `main`'s pre-existing warnings (App.tsx, detect.ts). No new warnings may be added. | Report §13. |

## 3. Where this ADR deviates from the report's letter

1. **P0.3 asked for `docs/current/ADR-svg-to-upload.md`.** RULE 17 allows only `SYSTEM_OF_RECORD.md`
   and `AGENT_RULES.md` in `docs/current/`; this ADR therefore lives in `docs/archive/` and its
   binding rows (vocabulary, precedence, deviations) are recorded in `SYSTEM_OF_RECORD.md`.
2. **B is already in the snapshot.** The report premised "nothing merged". Reality: the branch
   already carried B's tab. P1 therefore *replaces* B's tab with A's (D1) and P2 ports B's
   capabilities; this is the report's outcome, executed against a different starting tree.
3. **P1.1's blanket checkout is unsafe here.** Different content lineage, so shared files were
   3-way merged (`e94ade3` as base): 73 of A's files were added verbatim, 10 shared files merged
   cleanly, 6 conflicts resolved by hand (Workbench tab, `session.TabId`, `state/apply`'s
   `uploadSettings` applier, the `up-*` CSS block, `UI_SELECTORS` §R, `paired_thumbs` template count).

## 4. Phase order actually executed

P0 (this file, vocabulary, baseline) → P1 (A base + `src/lib/upload/`) → P2 honesty (CP-15, CP-2,
CP-1, CP-8, CP-5) → P3 pipeline (CP-7, CP-3, CP-6) → P4 economics (CP-4, CP-10, CP-17) →
P5 template (CP-16, CP-13) → P6 consolidation (CP-11, CP-12, CP-9-optional) → P7 acceptance.
Remaining work at any stopping point is listed in `docs/current/QUALITY_RECHECK.md` with the
gate result of the last completed phase; no phase is claimed green without a `npm run verify`
run recorded there.
