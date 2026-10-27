# Proposed architecture — stock Upload

Date: 2026-10-27. **Design only.** [Scope and screen](README.md), [steps](steps.md).

## 1. Current implementation findings

| Existing owner | Relevant behavior / reuse constraint |
|---|---|
| `src/ui/Workbench.tsx` | Visible “SVG to upload” tab already uses internal id `upload`, lazy first mount and hidden retention for active work. Preserve it; proposed new id `stockUpload`, label “Upload”. |
| `src/lib/session.ts`, `src/state/appstore.ts` | Explicit tab-id/session schemas. Add a separate selection/view slice with tolerant migration; never reinterpret old saved `upload` sessions as stock uploading. |
| `src/upload/discovery.ts` | Lists approved SVG sources and ignores `export`. It is not the new scanner and must keep its current exclusions. |
| `src/lib/upload/export.ts` | `export.json` v1, one per icon under `<pair-folder>/export/`, with `outputs.svg/jpg/eps` path/bytes/hash, metadata, stage/status/validation and committed timestamp. Written last. Existing parser checks only some structure and then casts; network delivery needs stricter checks. |
| `src/lib/upload/download.ts` | Useful committed-artifact planning/naming ideas; currently handles only SVG/JPEG/EPS and must not become a directory-wide upload fallback. |
| `src/upload/exportmetadata.ts`, `src/lib/upload/embed.ts`, `jpeg.ts`, `epsmetadata.ts` | Existing metadata read/embed/verify primitives; full export orchestration still depends on source/preparation and is not directly appropriate for a finished-package-only tab. |
| `src/lib/upload/rowbadge.ts`, `src/upload/UploadRowBadge*.tsx`, `rowbadgestore.ts`, `rowbadgeundo.ts` | Named list badges, catalog management, assignment/filter/bulk UX and history. Not the vector artwork badge. |
| `src/lib/reviewselect.ts`, `src/ui/checkedrows.ts` | Shared active/checked/anchor/keyboard contract. New independent selection, same gestures. |
| `src/lib/keyvault.ts`, `src/upload/keystore.ts` | Local secret storage outcomes, session-only fallback, explicit Forget and non-destructive empty Save. Reuse semantics, not a provider's existing credential slot. |
| `src/lib/knownroots.ts`, `src/lib/rootstore.ts`, `src/lib/copypath.ts`, `src/upload/exportactions.ts` | Handle-bound path/location rules. Current Location copies the export folder path; a normal browser cannot launch Explorer. Reuse that honest fallback, not a fabricated OS path. |
| `src/upload/processprogress.ts`, `src/ui/completionSound.ts` | Existing progress/completion conventions; new transfer slot must not overwrite local export, download, metadata or SVG jobs. |

Existing Inkscape bridge files are not an authorization to restore canceled Windows
work or reuse an unauthenticated bridge for stock passwords.

## 2. Proposed modules (names are provisional)

- `src/lib/stockupload/`: strict export-record/artifact reader, export-folder
  discovery rules, package identity, stock descriptors, capability validation,
  immutable transfer planning, metadata-only refresh rules, progress/results.
- `src/stockupload/`: folder scan orchestration, independent view/job state,
  non-secret stock presets, secret-store adapter, badge/metadata adapters,
  companion client, job journal and runner.
- `src/stockupload/StockUploadPanel.tsx` and small components: folder header,
  pinned action bar, connection form/list, exported-package list/row, previews,
  metadata editor, confirmation and progress.
- Optional separately packaged **user-local companion**: bounded streaming
  transport plus real FTPS client. No provider API keys or source-generation code.

Reuse shared field, selection, path, label and progress components behind small
interfaces. Extract genuine shared presentation/rules only where necessary;
existing prep-tab behavior must remain covered by equivalence tests. Respect
frozen function/complexity/file limits; do not build a second monolithic panel.

## 3. Strict package discovery and trust boundary

### Root-aware traversal

Walk only the user-granted tree. Recognize directories named `export` by complete
path segment, not substrings such as `exports` or `my-export-backup`. If the picked
root itself is `export`, its immediate contents count. Traverse other directories
only to find export directories/records, not to collect their media. Do not apply
the review-source scanner's split-only predicate to this different data source.

Read the app's recognized export record(s) inside those directories. Initially
this is `export.json`; do not parse every arbitrary JSON file as an export registry.
Missing/corrupt/unsupported records are counted with reasons, never “repaired” by
inventing declarations from matching filenames. No writes during scan.

### Validated declaration

A network-safe reader validates, without trusting the current shallow cast:

- supported schema/version and record structure;
- stable package identity, commit timestamp/stage/status and per-output validation;
- known artifact kind and extension, positive safe byte count, expected hash shape;
- a normalized relative path that resolves to the record's own export folder;
- no absolute path, URI, traversal, encoded separator trick, alternate stream,
  control character, unexpected subdirectory or unrelated package stem;
- source files and export records themselves cannot masquerade as upload media.

Resolve through granted handles, not arbitrary helper filesystem paths. Same-named
files in different export folders produce separate package rows. Invalid optional
outputs do not certify their siblings: report per-artifact exclusions, allow only
independently valid committed siblings when the record still proves a valid commit.

### Changed root / moved package

A record may retain paths from an earlier, higher selected root. Rebase only a
recognized `…/export/<declared-file>` reference onto its actual containing export
folder, under a documented deterministic rule. The expected stem, size/hash and
record relationship must agree. Never follow an old absolute path or search the
whole disk for the basename. Root=export and ancestor-root scans must identify the
same actual package without requiring its original SVG/sidecar to be present.

Stable UI identity should include the remembered root identity plus canonical
record location/package identity, not row position or basename. Badge/selection
migration follows verified package identity; a changed root must not leak labels
or previous selections to an unrelated package.

### Integrity lifecycle

Use manifest-only lightweight discovery first; lazily read thumbnails for visible
rows. Before confirmation/send, verify every selected artifact against its
committed size/hash and existing applicable format validator. Build an immutable
manifest of exact bytes/identity and destinations. A changed/missing artifact
between planning and send invalidates that task; never upload “whatever now has
that filename.” Stream from a bounded immutable file snapshot where supported;
if a fresh handle read is needed, revalidate it. No whole-tree file buffering.

## 4. Artifact registry evolution

The current producer and `ARTIFACT_EXTS` describe **SVG, JPG, EPS only**. Do not
silently change the old download/export rules to include PNG/ZIP by filename.

Proposed extension: a versioned artifact-reader abstraction, accepting validated
v1 SVG/JPG/EPS records and a documented newer record form that can explicitly
register PNG/ZIP with path/size/hash/commit validation. Final schema and producer
migration need tests before code changes; old readers must never discard unknown
registered outputs on metadata save or re-export. Test backward/forward behavior.

New tab generates neither PNG nor ZIP. An unavailable registered format stays
disabled with a reason. If no producing workflow can yet register PNG/ZIP safely,
show them as not yet available, rather than pretending those uploads work. Adding
a producer or registration UI is a separate approval, not an automatic scope
expansion. A future ZIP remains an opaque, declared representation here: no
extraction, inferred entries or payload rewriting.

## 5. Editable metadata without source regeneration

The visible committed metadata comes from `export.json.metadata`, with existing
Title/Description/Keywords/Creator/Copyright semantics. Editing creates a local
draft, not an immediate network send. Badge labels are never metadata tags.

Proposed explicit **Save metadata** path:

1. Validate the draft locally; show errors without erasing the previous commit.
2. Read only this package's declared existing artifacts. Source SVG and provider
   availability must not be required.
3. Use shared metadata-only embed/verify primitives for SVG/JPEG/EPS. Never invoke
   prepare, stroke/artboard fitting, raster render, optimizer or AI generation.
4. Stage modified artifacts, verify metadata/readback and preserved artwork, then
   update paths/bytes/hashes/fingerprints and write export JSON last using existing
   commit/recovery guarantees. Detect another tab changing the package before commit.
5. Publish one new local snapshot and invalidate old transfer plans. Do not
   fabricate provider/model/request provenance for manually edited text.

This needs a dedicated finished-package metadata transaction, not a call to the
full current `runExport` pipeline, whose preconditions include the approved source.
Keep preparation-tab metadata cache/state consistent when the same package/source
identity is known; no unsafe cache write keyed only by basename. Explicitly test
cross-tab rescan/conflict handling and global undo semantics. Remote transfers
cannot be undone by the UI's local undo history.

PNG/ZIP metadata persistence is not solved by existing JPEG/EPS helpers. Define a
format-specific policy before declaring such a representation synchronized: a
local draft/JSON change alone must not falsely certify its embedded/archive
metadata. For now mark unsupported metadata synchronization as requiring review
or return to the producing workflow. Block transfer of unsaved/known-stale drafts;
never silently drop edits or upload stale embedded metadata.

FTPS does not update the stock's submission form. Preserve embedded metadata where
supported but do not promise ingestion. Optional Shutterstock CSV export would be
local-only and imported by the user on the stock's Submit page after upload;
it is outside the initial required transfer implementation.

## 6. Stock presets and local secrets

Separate three concepts:

- **Stock descriptor:** provider id/label, supported file kinds/limits, protocol,
  defaults, allowed host(s), required setting fields and help links. Only verified
  Shutterstock descriptor ships initially.
- **Connection preset:** id/name/provider, non-secret settings (host/port, remote
  directory where supported, timeouts, bounded concurrency), enabled state and
  opaque credential reference. Rename/remove must not expose or export secrets.
- **Credentials:** username and password together in separate device-local secret
  storage, scoped to connection id. Not in the preset/session/job payloads.

Recommended browser storage uses the existing IndexedDB vault semantics, with
both username and password treated as secrets. It is device-local, **not a claim
of encryption at rest or immunity to malicious same-origin code**. State honestly
whether saving succeeded on device, only in session, or could not be read. Empty
Save leaves existing credentials alone; Forget is separate. A stored password is
not repopulated into a visible editor. Secret-free account aliases label targets.

When running, pass credentials only to the authenticated user-local companion,
which holds them in memory for the job and discards them afterward; stock auth uses
verified TLS. No helper disk cache, command-line credentials, shell interpolation,
FTP URLs containing a password, raw protocol/debug logs or third-party relay.
If OS credential-vault storage is chosen instead, make it the sole credential
owner; do not keep duplicate browser/helper plaintext stores.

## 7. User-local FTPS companion

Browser JavaScript cannot speak raw FTPS. Recommended companion is an optional
separate process on the user's computer, not a hosted backend. Implementation
choice must be approved before building it. Candidate FTPS libraries need license,
maintenance, TLS-verification, passive-mode and cancellation review; no library
is selected or installed by this plan.

Minimum security contract:

- Loopback-only listener; explicit trusted browser origin and pairing/token
  authorization, including request/Host checks and DNS-rebinding protection.
  No wildcard CORS, unauthenticated local upload endpoint or origin='null' bypass.
- Resolve secure-context, mixed-content and browser local-network-access behavior
  in the feasibility spike. Prefer serving the UI through the authenticated
  companion origin if direct hosted-page-to-loopback access is not portable.
- Relative URLs/proxy for sandbox preview demonstrations; fake jobs only. A helper
  on the sandbox is not the user's device and must never receive real credentials.
- HTTPS/TLS for any non-loopback transport; no remote bridge option in v1.
- Only typed manifests and bounded streams from the granted browser files; no
  arbitrary filesystem read, execute, command runner or unchecked host/URL endpoint.
- Mandatory explicit TLS on Shutterstock port 21, protected data channel and
  normal CA/hostname validation; no implicit FTPS/SFTP/plain-FTP substitution.
- Passive connection handling with destination validation; do not allow a server's
  passive-mode response to redirect uploads to unrelated/local network hosts.
- Bounded files/bytes/connections, timeouts and resource cleanup, redacted structured
  errors. No automatic login or credential testing when opening the settings form.

**Connection test**, if implemented, is an explicit consented action sending only
authentication/connection traffic, never an image or directory upload. No real
connection test is part of this planning task or automated CI.

## 8. Transfer and result semantics

Freeze an explicit confirmation showing destinations, remote directory/names,
formats, file/byte counts, exclusions and overwrite/collision policy. Only checked
items/destinations contribute tasks; no hidden unapproved extra files or JSON.
Later UI edits apply to the next run, not the confirmed manifest.

Default: deterministic bounded queue, one transfer per connection initially;
future parallelism is bounded per destination. Isolate a bad file/stock from other
queued tasks. Authentication failures settle/stop that destination's queued work
without retrying the password repeatedly; independent targets can continue.

Progress identifies item, representation and stock, real uploaded bytes, settled
file×destination tasks, failures and remaining work. Queue completion is not stock
review completion. Keep terminal summary visible across tab switches; use the
existing completion sound once per completed process, not once per file/target.
An empty plan/canceled picker must not produce a false completion event.

Cancel stops unsent work and requests abort/closure of the active transfer. Record
whether a remote partial file could remain; cleanup only files this run provably
created, never unrelated files. Do not promise a multi-file/multi-site atomic
commit: FTPS cannot supply that guarantee. Temporary upload+rename is preferred
only if the destination supports it without importing the temporary file; verify
this against the stock rather than assuming renames are supported.

Same remote basename from two local packages is a planning conflict. Do not
silently overwrite, auto-rename related variants inconsistently, or send both to
one path. Skip existing remote files by default when they can be identified;
if existence/remote identity cannot be verified, require an explicit conflict
policy before transfer. Remote size alone is not content verification.

Success levels must remain separate:

1. **Transferred:** server accepted transfer completion and available remote checks.
2. **Imported / visible in contributor account:** not proven by FTPS completion.
3. **Submitted / approved / published:** not available from this initial connector.

If the server committed a transfer but the acknowledgment was lost, record an
**uncertain** outcome and require reconciliation before retry, not automatic resend.
Persist only non-secret receipts/fingerprints and minimal run state locally. A
restart marks unfinished tasks interrupted; it never auto-resumes or sends again.
A successful repeated task needs explicit resend permission keyed to destination,
remote name and artifact hash. Never write remote-upload status into the export
record's local `processed` flag.
