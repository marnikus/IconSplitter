# IconSplitter: "SVG to upload" Branch Comparison — pinned research report

Extracted verbatim from `design temp/SVG tab generation/tab review merging report/merge report.html`
(the interactive report's article body, converted back to Markdown on 2026-10-07).
Source hashes it reviewed: `arena/d658a5b8-iconsplitter` = `a3d608a4`, `arena/140ece1a-iconsplitter` = `25ff58aa`,
`arena/01a0f966-iconsplitter` = `18ed0e96`; shared ancestor `e94ade36`. Archived, never edited.

---

# IconSplitter: "SVG to upload" Branch Comparison

## Executive Recommendation

Use arena/d658a5b8-iconsplitter as the architectural base. Adapt selected work from both other branches. Do not merge any of the three unchanged.

The recommended base has the strongest combination of a shared geometry model, output-resolution-aware stroke sizing, official browser SVGO with an appearance-comparison fallback, a genuine local EPS writer, a JPEG decode seam, direct Gemini integration and reasonably clear dependency boundaries. Its implementation nevertheless has serious content-hashing, metadata-reuse, style-preservation and record-integrity defects. These are release blockers, not cosmetic cleanup. S01 S03 S04 S07 S08 S09

140ece1a is the best review-workbench donor: richer filters, search, sorting, discovery audit, per-icon inheritance markers, reset, gesture-coalesced undo and metadata consent/abort controls. Its backend has independent defects, including a scan/credential ref collision. Borrow the interactions and pure rules, not the entire pipeline. S26 S27 S42 S43

01a0f966 is the best recovery and artifact-review donor: durable whole-job interrupted-state restoration, metadata records that survive before export, generation-time provenance, typed activity-log constructors, a saved-JPEG preview, explicit unit controls and the correct IPTC ObjectName mapping. Its source approval, bulk selection, geometry and export execution are not a sound base. S48 S49 S51 S54 S58 S65

This is a relative architectural recommendation, not a claim that the first-ranked branch is currently safe to ship. If the task were only to improve the review interface, 140ece1a would rank first. For an upload-package feature, correctness of the actual delivered artifacts and the ability to harden one coherent engine take priority over the number of controls.

## 1. Scope and Evidence

### Pinned Snapshots

| Branch | Reviewed Head | Commit Timestamp (UTC) | Recommended Role | 
| arena/d658a5b8-iconsplitter | a3d608a4211c9c09aeff3bb83e4d00788ebe4204 | 2026-10-07 06:16:00 | Export-engine base | 
| arena/140ece1a-iconsplitter | 25ff58aac92ae7088d0a90eeafa00e0e9dd7499e | 2026-10-07 07:00:41 | Workflow/settings donor | 
| arena/01a0f966-iconsplitter | 18ed0e96f4a0633521f26be6b5dd20e69b2558c1 | 2026-10-07 07:21:13 | Recovery/metadata/artifact-review donor | 

The shared pre-feature ancestor is e94ade3664b54a53c97684fe82f9984e23891739. The existing single-sheets component, batch/selection areas and several build/configuration blobs are shared at the inspected heads. The feature implementations are not merely three cosmetic versions of the same backend: they introduce different namespaces, provider contracts, record shapes and persistence models.

140ece1a has two broad feature commits: export foundation 341e31e9, then UI/state/docs 25ff58aa. d658a5b8 develops the feature in six commits above the shared baseline. 01a0f966 is eight commits ahead of that baseline, with a merge and an unrelated Arena capture among its history. That makes whole-branch cherry-picks especially inappropriate. S75 S76 S77 S78 S79 S80

The future integration target must be compared again against its then-current main. The recommendation is tied to these immutable reviewed heads, not to whatever the branch names may point at later.

### What Was Verified

- Branch heads, commit metadata, relevant directory trees and the shared ancestry were inspected through GitHub.

- Feature-defining source paths were read across discovery, state, settings, provider requests, metadata, geometry, optimization, JPEG/EPS, publication, recovery and UI.

- The real UI test sources were inspected, including their fake browser APIs and module-boundary mocks.

- Source behavior was cross-checked against each branch's design and commit claims rather than accepting those claims as proof.

- External documentation was consulted for Google's model API and OpenAI-compatible route, SVGO's browser entry, filesystem write semantics, IPTC dataset identifiers and PostScript path consumption. S69 S70 S71 S72 S73 S74

### What Was Not Verified

- None of the original branches was cloned, built or executed in this review environment.

- Their Vitest, coverage, lint and quality-gate results were not independently reproduced.

- No paid Gemini request, real folder-permission lifecycle, full-resolution Chromium export, external IPTC readback or EPS-render comparison was performed.

- Timing, bundle size, memory usage, visual fidelity and actual provider availability were not benchmarked.

- The original feature prompt was not available as a standalone contract. Scope was reconstructed from the implementations and archived design documents; explicit product ambiguities remain decisions for integration.

Consequently, findings below are source-confirmed call-flow findings and reasoned defect implications, not observed browser failures. Suggested regression tests are acceptance work for the future integration, not tests claimed to have been run here.

### Reported Gates Are Not Independent Evidence

| Branch | Head's Reported Whole-Project Tests | Reported Test Files | Review Interpretation | 
| d658a5b8 | 1,166 | 110 | Author-reported; not rerun | 
| 140ece1a | 1,212 | 114 | Author-reported; not rerun | 
| 01a0f966 | 1,212 | 114 | Author-reported; not rerun | 

These are project-wide totals, not isolated feature quality scores. A passing mocked encoder can miss wrong final-byte hashes; a writer and its own parser can agree on an incorrect IPTC dataset; structural TypeScript compatibility does not distinguish an API-key ref from a scan-key ref. Test quantity is therefore not used to choose the winner. S21 S44 S66

## 2. What the Feature Actually Does

All three intend to add a tab after Generate SVG that prepares approved icon artwork for an external stock/print website. The output is a local package, not an automatic website upload: an export SVG, approximately 15.1 MP JPEG, optional EPS and a per-icon export record. Metadata is generated only through a provider action, then edited/accepted and embedded.

The shared intent includes source preservation, output background/padding/stroke settings, exactly 40 tags including icon, pictogram, vector, stroke, line, editable, web, a two-part title, a short description, repeat-export planning, review states and safe handling of paid requests. Legal/IP warnings are structural advisory checks, not legal clearance.

Important implementation differences:

| Area | d658a5b8 | 140ece1a | 01a0f966 | 
| Feature namespace | src/upload, lib/up* | src/upload, lib/upload* | src/svgupload, lib/svgupload | 
| Tab ID | svgUpload | upload | svgUpload | 
| Source version | Preferred approved, else highest approved | Newest approved/valid/on-disk | Preferred usable, else newest valid; SVG approval not enforced | 
| Gemini transport | Dedicated direct generateContent, JSON schema | Dedicated direct generateContent, labelled text | Shared existing OpenAI-compatible transport/provider/key | 
| Stroke interpretation | Physical output stroke depends on target raster resolution | Point width at intrinsic SVG units | Explicit units; optional normalization | 
| JPEG metadata | XMP APP1 + IPTC APP13, wrong title dataset | XMP APP1 | XMP APP1 + IPTC APP13, correct title dataset | 
| EPS | Built-in documented subset | Built-in subset with fill/stroke defect | User-configured external converter | 
| Recovery | Package-state scan, no complete run journal | In-flight metadata journal | Durable last-job states, interrupted restoration | 
| Record format | v:1, pairId, source, settings, outputs object, state | v:1, pair, source, settings, outputs object, status | v:1, pair, richer provenance, outputs array, status | 

All three calling their schema v:1 does not make the schemas interchangeable. S11 S34 S56

## 3. Why d658a5b8 Is the Best Base

### 3.1 It Has the Strongest Optimization Safety Pattern

upsvgo.ts imports svgo/browser, verifies parsing, viewBox and metadata, and exposes a pixel-comparison seam. optimizeForDelivery compares two 256x256 renderings with a declared tolerance/budget and falls back to the unoptimized input if verification or comparison fails. This is a stronger pattern than trusting SVGO to preserve appearance. S01 S02 S71

140ece1a lacks that appearance gate and renders JPEG from the pre-optimization SVG. 01a0f966 uses an extremely conservative allowlist, essentially removing doctype/comments and checking signatures. The latter is useful as a fallback policy but gives little of the substantive optimization benefit expected from the feature. S33 S67 S68

The base's optimization check is not sufficient on its own: it compares the prepared SVG against its optimized version. It cannot detect artwork already damaged during preparation. Source-versus-prepared verification must be added separately.

### 3.2 Its EPS Writer Is a Real Local Capability

The base writes genuine EPSF/PostScript from a parsed scene, applies point-based page/stroke arithmetic, converts path geometry, names unsupported constructs and correctly saves/restores the path around a fill followed by stroke. S03 S04

This is a meaningful advantage over a mandatory conversion server. It also disproves the overly broad statement in the other design that EPS cannot be produced in a browser at all: a subset can be written locally. It does not imply arbitrary SVG can be faithfully converted to EPS.

Text, gradients, filters, masks, images and other unsupported features still need a visible EPS limitation. Requested EPS that cannot be generated should be Partial while required SVG/JPEG/metadata failure should block a new publication. Test even-odd filled-and-stroked shapes, transforms and strokes in an independent PostScript renderer, not only by matching the file header. S03 S74

### 3.3 The Delivered SVG Leads the Raster Pipeline

The job embeds and optimizes its export SVG before rasterizing that final text. produceJpeg checks the SOF dimensions against the target, performs an independent decode seam and hashes the result. That sequence is the best starting point for artifact parity. S08 S07

A square 15.1 MP target commonly resolves to 3886x3886, or 15.100996 MP. Report those actual dimensions and actual area rather than claiming an exact integer representation of the requested decimal target.

Metadata is subsequently embedded into the JPEG, so the base must recompute final-byte statistics. It currently retains pre-embedding stats on a fresh render; that is a concrete manifest defect, not a reason to discard the overall pipeline boundary.

### 3.4 It Respects Preferred Approved Versions

chooseVersion first restricts to generated, review-approved versions and then honors the preferred version inside that set. This is closer to the user's review decision than always taking the highest version. Add validation.ok and explicit missing-file handling to complete the predicate. S12

140ece1a has stronger validity/on-disk checks, but disregards preference. The integrated rule should combine their good parts: preferred generated, valid, review-approved and readable version; otherwise the allowed fallback stated to the user. Never silently use a declined or missing preferred file.

### 3.5 Its Boundaries Are Worth Preserving

The base separates scene extraction, fit math, format metadata, optimizer, pure fingerprint planning, browser adapters, IO and the per-icon stage machine. Keep those seams and repair their invariants instead of assembling three competing backends. Its nested export-record validation is also stronger than the shallow casts in the other two readers, although it is not a full integrity proof. S05 S09 S10 S11

## 4. Release Blockers and Source Findings

### 4.1 All Branches: Publication Is Not Package-Atomic (R01)

Each implementation writes live output files sequentially and writes export.json last. 140ece1a verifies temporary files first; 01a0f966 uses a staging directory. Neither rolls back live files already replaced if a later write fails. The base is more honest about a partial mid-commit result, but still lacks a consistent prior-generation guarantee. S18 S31 S64

The filesystem API normally writes a temporary file and replaces that file on writable-stream close. It does not atomically swap a group of SVG/JPEG/EPS/JSON files. An old manifest beside partly new outputs is not the old valid package. S73

Recommended design: write a complete verified immutable generation in an icon-scoped directory, then switch a single commit pointer. Retain the last valid generation until recovery/cleanup is safe. If flat-file publication is non-negotiable, explicitly implement backup/rollback/restart recovery and mark incomplete state; do not advertise a stronger transaction guarantee.

Acceptance: fail every output and manifest write position, including close; restart; verify a complete prior generation remains usable and inconsistent bytes never show Processed.

### 4.2 Base: Source Hashing Uses the File Path (R02)

Job.plan and buildJobRecord call deps.hashText(row.svgRelPath). The browser adapter hashes the supplied string itself. It does not open that path and hash the SVG. An in-place source edit therefore leaves the recorded source hash unchanged. S08 S09 S02

Read the source bytes first, calculate SHA-256 once, and carry that immutable value through planning, metadata identity and record construction. A useful regression changes source content while preserving filename, size and mtime; the exported source identity must still change.

### 4.3 Base: Metadata Cache Identity and Restore Are Unsound (R03)

The accepted metadata cache uses size:mtime. Two unrelated icons can share both. The scan reducer also resets each row to empty metadata. The job reads a committed record but does not hydrate its accepted metadata into the actual metadata step before the paid fallback. After export/rescan, another export can fail without AI or call the provider again despite an existing accepted record. S13 S14 S08

Use root identity, pair ID, source content SHA-256 and metadata-policy version. Reuse a fresh accepted durable record before any paid request. Persist generation results before the first export, not only after an artifact commit.

Acceptance: two same-stat/different-content icons receive independent metadata; generate/export/rescan/re-export performs no second paid request; source changes require explicit relevance review.

### 4.4 Base: Styles Are Removed Without Fully Baking Presentation (R04)

The scene resolver knows simple stylesheet values. But preparation's normalization callback primarily sets stroke width, after which bakeOutStyles removes style blocks. It does not materialize all resolved colors, fill:none, stroke, caps, joins and other presentation values on the copied elements. A class-styled red outline can become unstyled artwork. S05 S06

Bake every supported resolved property before removing the corresponding rule, or retain/refuse unsupported styles. Add source-versus-prepared rendering checks. The optimizer's own comparison cannot discover this earlier preparation loss.

### 4.5 Base: Wrong IPTC ObjectName Dataset (R05)

iptcIimRecord writes the title to record 2/dataset 0x07, and its parser reads that same field. According to the independent IPTC/ExifTool reference, 2:5 is ObjectName; 2:7 is EditStatus. Internal round-trip agreement is not interoperability. S15 S72

01a0f966 uses dataset(2, 5, title). Borrow that mapping and independent-reader fixture, while retaining the base's UTF-8 character-set declaration and segment-size refusal. Do not copy the donor encoder wholesale: its length and character-set handling need their own safeguards. S65 S16

### 4.6 Base: Metadata Readback Is Incomplete (R06)

The job compares SVG title/description/tags, but JPEG validation only requires non-null XMP and IPTC packets. It does not compare their field values against the accepted values. Provided/cached metadata also needs policy validation at the export boundary rather than relying on a disabled UI button. S08 S15 S16

Require policy validation, semantic field equality and final filesystem readback before Upload ready. Tests must use an independently interpreted packet or deliberately corrupted but parseable JPEG, not only the writer's own successful parser.

### 4.7 Base: Planner and Physical-Stroke Dependencies Disagree (R07)

strokeInUserUnits depends on target raster dimensions. But target MP is categorized under raster changes, so the stage planner can keep the saved SVG while rerendering a differently normalized copy. The new record also does not preserve an EPS kept from the prior package. S04 S10 S08 S02

Under the base's physical-output-stroke interpretation, MP changes must invalidate the relevant SVG/EPS geometry too. Quality-only changes should not. Represent the dependency explicitly, retain unchanged output entries and hash the files actually delivered.

### 4.8 Base: Final JPEG Hash/Bytes Can Describe the Raw File (R08)

After a fresh render, jpegStats describes the raw JPEG. The embed step keeps that object with this.jpegStats = this.jpegStats ?? out.stats, even after adding metadata bytes. The saved JPEG can therefore differ from its manifest SHA-256 and byte count. S08 S02

Always derive stats from final embedded bytes and verify the committed readback. Acceptance should hash the actual disk file through an independent helper on fresh render and metadata-only update.

### 4.9 Base: Exception Isolation, Cancellation and Recovery Need Work (R09-R10)

Job.run does not catch arbitrary dependency exceptions per icon, and the pool's Promise.all can reject the whole run. Convert thrown source/hash/raster/commit exceptions into a sanitized typed result and let neighboring icons continue. S08 S17

Cancellation is a shared flag checked at stage boundaries, but the Gemini sender does not accept the run's parent AbortSignal. There is no durable whole-job journal. Configuring a retry count is not the same as implementing a complete safe retry loop. Port request-abort wiring and durable interrupted states, with explicit Retry for unknown outcomes. S13 S19 S37 S48

### 4.10 Workflow Donor: Scan Snapshot Ref Aliases the API Key (R11)

This is the clearest cross-module wiring defect in 140ece1a:

- UploadRefs defines key for the Gemini credential and a separate scanKey for the scan snapshot.

- useLoadAll passes the entire refs object directly into scanUpload.

- scanUpload expects a field called key to mean snapshot key and writes the discovered snapshot hash to refs.key.current.

- The metadata runner later uses that same credential ref for x-goog-api-key. S22 S23 S24

The types are structurally compatible because both refs contain a nullable string. TypeScript cannot establish their semantic distinction. The real UI tests commonly save the key after mounting, which does not exercise restored-key/changed-rescan behavior. S44

Fix by renaming the scan contract to scanKey and credential field to apiKey, keeping explicit boundaries and one scan token through row assembly. Regression: restore key before mount, scan, change a source, rescan, submit metadata, and assert the original auth header survives.

### 4.11 Workflow Donor: Selective Runs Lose Retained Outputs (R12)

assembleRecord starts with newExportRecord, whose output slots are null. commitExport fills only rebuilt files, retaining null rather than previous output entries. A JPEG-only rebuild can forget still-existing SVG/EPS outputs and nevertheless report Processed. S30 S31 S34

Combine rebuilt output records with verified unchanged entries from the prior package, then validate the complete requested set. The combined settings fingerprint also includes optimize/EPS flags, meaning toggle-only changes frequently enter the full geometry branch before the dedicated toggle logic can help. S29 S34

### 4.12 Workflow Donor: SVG Metadata Readback Is Not a Commit Gate (R13)

validateArtifacts returns an independent readback boolean. runStages stops on invalid SVG parsing or JPEG validation, but not on readback === false. A metadata mismatch can therefore reach publication with a false validation flag. S32 S30

Every required validation result must be a hard gate. Keep optional-EPS Partial behavior separate from required artifact/metadata failures.

### 4.13 Workflow Donor: EPS Fill/Stroke and Artifact Parity (R14-R15)

emitShape emits a path, then fill, then stroke, with only an outer save/restore. In PostScript, fill consumes the current path. A filled-and-stroked shape can lose its stroke. Preserve the path around fill as the base writer does. Header/BoundingBox checks alone cannot verify the outline. S35 S03 S74

The JPEG stage draws prepared.svg, whereas the saved SVG/EPS derive from the optimized text. That is not a proof of artifact parity. Preparation also measures bounds before applying thicker configured strokes, which needs clipping fixtures at zero/small padding. S33 S36

### 4.14 Workflow Donor: Metadata and Scan State Can Become Misleading (R16-R17)

The export allows null metadata and can turn Processed, so Files exported and Upload ready are not equivalent. Accepted metadata before the first export is not independently durable. Source-stale package rows can retain accepted text without binding it to the new source. Export provenance uses the current provider model rather than the original request model. S41 S38 S28

The scan cache is derived from discovered source state rather than export-record contents, so changing only export.json can leave an unchanged scan that skips row assembly. The asynchronous assembly final commit is not protected by the discovery ticket through all reads. Adapt content freshness, but fix package refresh and root-switch races. S23 S22 S28

### 4.15 Recovery Donor: Preferred Usable Is Not Review-Approved (R18)

The row builder calls chosenVersion, which accepts generated/valid preferred artwork or newest valid artwork without requiring review === approved. Approval of the original/AI pair is not approval of every generated SVG version. A pending or declined preferred SVG can consequently enter the export flow. S46 S47

Combine the base's allowed-approved set with the workflow donor's validity/readability checks. Add a fixture with an approved pair, declined preferred SVG and another approved SVG.

### 4.16 Recovery Donor: Select All Is Literally a No-Op (R19)

The hook returns toggleAll: (on) => ui.setChecked(on ? [] : []). Both outcomes clear selection. Repair visible/eligible scope and add a filtered-list header-checkbox regression, including hidden selections and mixed state. S45

### 4.17 Recovery Donor: Selective Execution and Hard Failures (R20-R21)

The planner advertises selective stages, but Run.execute builds and renders requested JPEG output without consistently obeying that minimal plan. Metadata content edits are not represented by a separate content fingerprint in the comparison. Repeated rendering and missed metadata-only updates are therefore credible source-level outcomes. S62 S63 S55

More seriously, raster failure appends an error but the run still proceeds toward publish, which computes Partial and calls package publication. A required JPEG failure can replace parts of a prior good package. Stop before any publication on required SVG/JPEG/metadata failures; permit Partial only for deliberately optional EPS. S63 S64

### 4.18 Recovery Donor: Cancellation and Preview Lifecycle (R22-R23)

Metadata-only naming is outside the cancellable export queue. Queue cancellation does not cover that request, and local export steps do not check the run signal at a pre-publication boundary. Unify run ownership and cancellation instead of importing these two paths unchanged. S50 S49 S63

The JPEG preview reads the saved artifact, which is worth preserving. However, the SVG side still receives cached source SVG text while labelling it as exported output. The code cache is path-based across roots, and replaced object URLs are not revoked at replacement time. Read both saved artifacts and key caches by root/generation/hash. S45 S51 S52

### 4.19 All Branches: Schema and Folder Identity (R24)

Record shapes differ despite the shared v:1. Some localStorage keys overlap despite incompatible payloads, including metadata stores. A version number without a schema identity is not a migration strategy. Choose one DTO and explicit migrations or visible review fallback. S11 S34 S56

Every implementation also places one export.json in the pair directory's export/. This assumes one icon per parent directory. If two pairs share a directory, their records can overwrite each other, particularly in the concurrent base. Enforce that assumption at preflight or add icon-scoped package directories. S18 S31 S64

### 4.20 Recovery Donor: Exclude Unrelated Arena Capture (R25)

The branch history contains an approximately 21 MB captured Arena setup HTML file plus its asset directory in design temp. It is unrelated to the feature. Do not carry it forward. It adds repository weight and a privacy/audit surface; this report does not claim the capture contains a secret, because its private-content surface was not audited. S80

## 5. Best Parts to Carry Forward

| Priority | Donor | Part | What to Preserve | What to Change Before Porting | 
| P0 | 01a0f966 | Durable metadata records/drafts | Persisted accepted/draft state, original prompt/provider/model, pre-export survival | Root/pair/content-hash/policy identity; migrate conflicting keys; retain direct Gemini | 
| P0 | 01a0f966 | Whole-job recovery | Running/queued -> Interrupted; explicit Retry; once-per-page restore | Integrate base job stages and generations; no automatically resent paid requests | 
| P0 | 140ece1a | Consent and request abort | Metadata confirmation and linked AbortController pattern | Keep base refusal/truncation checks; never port the credential/snapshot alias or broad 5xx retry behavior | 
| P0 | 01a0f966 | IPTC mapping | Title -> ObjectName 2:5; independent reader fixture | Keep base UTF-8/payload bounds; compare both packets semantically | 
| P1 | 140ece1a | Filters/audit/settings/undo | Search, sort, independent filters, markers, reset, gesture history | Adapt current row/settings/tab types; keep preferred-approved eligibility and safe scan assembly | 
| P1 | 01a0f966 | Published preview | Saved JPEG reader and side-by-side review idea | Read saved SVG too; root/generation cache keys; revoke replaced blobs | 
| P1 | 01a0f966 | Typed activity log/model policy | Icon/outcome vocabulary; no metadata payload; exact model refusal | Redact free-text causes; direct Google model get/list/capabilities rather than shared catalog state | 
| P2 | 01a0f966 | Explicit units/optional stroke | pt/px/% values and declared 96/72 conversion | Decide physical-stroke contract and percentage basis; never copy viewBox-as-visible-bounds geometry | 

Additionally, carry the workflow donor's two-named-tags rule into the base's shared metadata validator without weakening its JSON/label parsing. That is a small policy extension, not a reason to create a second parser. S40

## 6. Cherry-Pick Feasibility

### Do Not Blindly Cherry-Pick Head Commits

The UI commits reference their own types, hooks, stores, reducers, session slices and export schemas. src/upload is reused as a directory name by two different architectures. Replacing matching filenames is not an integration.

25ff58aa is useful as a reference for the workflow/UI change set, but depends on the broad foundation commit 341e31e9. It also changes session/history/shell wiring. Extract the dialog, controls, selection/history rules and tests through adapters. Do not replace the base backend or tab ID. S76 S77

18ed0e96 is the most focused donor commit: recovery, typed log vocabulary and JPEG preview. It is still not drop-in because it depends on svgupload, its stores, job union and metadata model. Port those pieces into the base's job/state contract and create a new integration commit. S78

14c7512b is a broad phases-1-9 integration commit. Use individual metadata/editor/unit ideas, not its exporter and provider architecture. Exclude aedc6122 and the captured Arena assets. S79 S80

### Practical Git Preparation

- Fetch the named branches and verify their pinned hashes before reviewing a future integration.

- Create a dedicated integration branch from reviewed a3d608a4, or rebase the reviewed feature onto the actual current main after checking baseline changes.

- Inspect each candidate with git show --stat <commit> and a path-limited git diff before importing anything.

- Port one bounded feature through explicit DTO adapters. Keep root picking, history and Generate SVG reuse intact.

- Make new, reviewable commits for each port and its regression tests. Do not describe a copied file set as a successfully cherry-picked feature before it passes integration checks.

No Git changes, cherry-picks or upstream merges were performed as part of this research deliverable.

## 7. Proposed Integration Sequence

### Phase 1: Harden the Base

First add regression fixtures that expose the source-level defects. Repair actual source SHA-256, metadata identity/hydration, style baking, required metadata validation, IPTC title mapping, final-byte statistics, dependency planning and per-job exception isolation. Establish a consistent publication/recovery protocol before adding more controls.

Acceptance: unchanged re-export never invokes the provider; actual disk hashes equal the manifest; prepared rendering preserves source presentation; a hard failure never produces a new green package.

### Phase 2: Unify Schemas and Persistence

Choose one export schema identity/version and one metadata DTO. Include root/pair/source version/content hash, effective settings and origin, generation-time prompt/provider/model/request ID/usage, policy version, requested/produced formats and exact final-byte output records. Add migrations for existing branch fixtures.

A source hash change marks metadata relevance stale. An edited accepted record changes its metadata fingerprint without triggering a fresh model call. An interrupted request is not a failed confirmed request and must not be automatically resent.

### Phase 3: Recovery, Consent and Cancellation

Port durable last-job states from 01a0f966 and signal-linked metadata requests from 140ece1a. Give the combined run one owner and AbortController. Journal paid/local stages separately and record whether the provider outcome is known. Restore once per page load without StrictMode duplicate logging. S48 S49 S37 S39

### Phase 4: Workflow and Artifact Review

Port the richer workbench, per-icon markers and gesture/bulk history. Then add both published-artifact previews and safe logging. Build filters and selection from one visible-ID derivation; hidden selected rows must be clearly scoped rather than silently altered. S42 S43 S27 S51 S53

### Phase 5: Verification and Documentation

Run the repository's prescribed verification lanes on the integrated code, then a real Chromium/Edge test with filesystem handles and a production single-file build. Use independent format tools for JPEG metadata and EPS. Update SYSTEM_OF_RECORD, UI selectors and the failure/recovery contract to match observed behavior rather than intended guarantees.

## 8. Acceptance Matrix for the Future Base

| Test | Required Result | 
| Declined preferred SVG, another approved version | Use allowed approved version or visible block; never declined artwork | 
| In-place SVG content edit with same path/size/mtime | New content SHA-256; dependent package/metadata stale | 
| Two different icons with identical file stats | Separate metadata identities and accepted records | 
| Generate/accept then close before first export | Paid result survives; reopening/exporting makes no new model request | 
| First export, rescan, unchanged re-export | No provider call and no unnecessary raster/optimization | 
| Metadata-only edit | Updated SVG/JPEG metadata; unchanged JPEG scan data; no AI request | 
| Target-MP-only versus quality-only change | Exactly correct dependent geometry/raster artifacts; consistent physical strokes | 
| Class/inherited/style-based source colors | Source/prepared parity apart from deliberate settings | 
| Zero padding, thick stroke, acute miter, transformed ellipse | No clipping or unintended recoloring; honest unsupported state | 
| Wrong metadata in parseable JPEG/SVG | Hard required validation failure before publication | 
| Independent IPTC/XMP readback | Correct ObjectName 2:5, description and 40 ordered keywords | 
| Final delivered artifact hashes | Exact equality between files and manifest, including embedded bytes | 
| Filled/stroked/even-odd EPS fixture | Independent EPS renderer agrees with intended SVG appearance | 
| Optional unsupported EPS | Specific Partial result with usable required outputs | 
| Required JPEG encode/decode failure | No new publication; prior complete generation remains usable | 
| Failure at every publication write position | Recoverable consistent generation; no mixed bytes reported green | 
| Cancel during request/render/before commit | Finished generations kept; no new uncommitted work published | 
| Restart during each stage | Interrupted once; zero automatic provider resubmissions | 
| Corrupt record, missing output, modified output | Visible issue and correct targeted repair; no silent green reuse | 
| Rapid root switches and same relative paths | Only newest root's rows/artifacts; no cache bleed | 
| Two pairs share a directory | Independent manifests or explicit preflight refusal | 
| Filtered selection and bulk apply | Exact intended scope; one undo restores all previous overrides | 
| Undo while upload tab is unmounted | Durable override restoration, correct state on next mount | 
| Unavailable configured model | Clear refusal, no silent model substitution or paid request | 
| Key/log/source hygiene | No credential in URL/log/export; no metadata/image payload in activity log | 
| Development and built single-file app | Same verified functionality and recovery behavior | 

## 9. Trade-Offs and Extension Decisions

### Provider Compatibility Is Not a Defect by Itself

01a0f966 reuses the existing OpenAI-compatible provider, key and advertised model catalog. Google officially supports the v1beta/openai route, so it would be incorrect to label this transport inherently incompatible with Gemini. S49 S59 S70

However, that architecture shares configuration with Generate SVG rather than implementing independent direct-Gemini settings. If dedicated Gemini behavior is the product requirement, keep the base transport and borrow only exact-model refusal policy. Google's models.get/list supports model/capability checks and pagination. Do not silently replace a configured model. S69

A catalog listing is useful preflight, not a guarantee of project billing/access or success of a generation request. Still classify the real response correctly.

### Units Need One Product Contract

One point at 96 CSS px/in is 96/72 = 4/3 pixels; 2.2 pt is approximately 2.9333 px, not 1.25 pixels per point. Some base comments/design prose state the wrong 1.25 factor while its inspected calculation uses 96/72. Fix the documentation too. S04 S58 S81

Decide whether stroke width is physical at final raster resolution or intrinsic to the SVG artboard. Decide what a padding percentage is relative to: artboard, largest visible side or shorter visible side. The branches differ. Do not migrate a bare number between those meanings.

Explicit pt/px/% controls and a normalization-off option are useful extensions, but output-scale and units must update the engine dependency graph and stored provenance together.

### Memory and Canvas Limits

A 15.1 MP RGBA canvas is about 60 MB before image decode buffers, duplicate canvases and blobs. Two or four concurrent exports can multiply that significantly. Distinguish network concurrency from raster-memory concurrency, establish an explicit memory budget and adapt to extreme aspect ratios and platform limits.

Neither "15.1 MP is normally safe" nor one documented Chromium edge limit establishes cross-browser safety. Test an extremely wide/tall artboard, null encoder results and memory-sensitive cancellation. Report any resolution clamp with the actual dimensions.

### Metadata and Pricing Are Not Legal or Billing Guarantees

40-tag/word-count validation is structural. An artist/brand/style-reference warning is not IP clearance. Keep the human review requirement and never label the result legally cleared.

Gemini token counts are reported usage; a locally calculated price is an estimate. The base's rate card is model-specific but the model field is editable. Rate lookup must be keyed by model and pricing version; an unsupported model should show unknown cost, not the Flash-Lite rate presented as generally applicable. The workflow donor's refusal to invent cost is a good honesty baseline.

### Privacy Boundaries Must Be Explicit

Local IndexedDB storage is not encryption against same-origin script access. A key necessarily leaves the browser in the authentication header to the chosen provider. State the actual boundary: locally persisted, masked, no URL query/log/export leakage, transmitted only to the explicitly configured provider for a confirmed action.

Typed logs without a data field still need redaction because a provider error string can echo sensitive text. Allowlist outcome fields and sanitize every free-text cause. A configurable endpoint also requires clear origin/HTTPS warnings before sending a credential.

For untrusted SVG, consistently sanitize preview and export inputs and reject or explicitly handle scripts, external references and unsupported effects. A safe thumbnail does not by itself prove a safe exported SVG.

### Optional External EPS Is a Future Capability, Not a Base Requirement

An opt-in converter can be useful for SVG outside the local subset, but it adds network, security, availability and privacy dependencies. 01a0f966 currently passes zero width/height to its converter request; that contract must be fixed before reuse. Do not introduce automatic transmission to a converter merely by importing its settings UI. S60

## 10. Final Decision

One engine, two focused donors, a hardening-first integration.

Retain d658a5b8's export-stage architecture, preferred-approved source rule, real browser optimizer/decode seams and local EPS capability. Repair its release blockers and establish a complete artifact/metadata/manifest invariant first.

Adapt 140ece1a's richer workbench, content-freshness idea, per-icon inheritance/history and consent/abort interactions. Explicitly avoid its scan credential alias, retained-output loss and unguarded readback result.

Adapt 01a0f966's durable recovery, pre-export metadata provenance/drafts, actual JPEG reader, unit controls, safe log vocabulary and correct IPTC mapping. Explicitly avoid its approval/selection defects, document-bounds geometry, cancellation split and publishing-after-required-raster-failure behavior.

The most valuable future change is not a wholesale merge. It is a small sequence of new integration commits, each with an explicit adapter, failure fixture and independently checkable acceptance result.

## Evidence Index

The interactive report's Sources & methodology section lists all 83 linked source, test, history, design and reference entries. Every repository link is pinned to the reviewed commit rather than a moving branch name. The principal references used above are resolved below.
