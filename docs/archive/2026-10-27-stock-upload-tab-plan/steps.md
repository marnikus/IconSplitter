# Implementation sequence and acceptance gates

Date: 2026-10-27. **Planned work only; no application changes authorized yet.**
[Requirements/screen](README.md), [architecture/security](architecture.md).

## Phase 0 — approve the decisions and prove the runtime

Before production coding:

- Review the four decisions in README: user-local companion, Shutterstock format
  constraints, explicit metadata-save transaction, badge sharing/identity.
- Confirm that the new visible label is **Upload**, while existing **SVG to upload**
  and its saved internal `upload` id remain unchanged.
- Approve the registry scope: consume valid existing outputs only; PNG/ZIP do not
  become eligible until explicitly declared by a supported record/producer.
- Define the native-runtime distribution/startup expectation without resuming the
  canceled Windows build. No secret setup is performed in chat.
- In a subsequent authorized feasibility spike, use a disposable local FTPS server
  and synthetic credentials to prove explicit TLS, certificate handling, passive
  data channel, cancellation, browser-local transport and origin/pairing controls.
  Do not test against a live stock account at this stage.
- Record decisions and a threat model before choosing an FTPS library. Reject a
  library/runtime that requires TLS bypass or remote credential relay.

**Exit:** an approved end-to-end deployment path that actually reaches the user's
local machine; no assumption that browser fetch/WebSocket can itself implement FTP.

## Phase 1 — TDD exported-package discovery and artifact registry

Write failing tests first, then implement pure eligibility/normalization and the
root-handle traversal separately from source discovery.

Required fixtures/cases:

- Root above many pair directories; root is one pair; root is `export` itself.
- Valid processed JSON + existing SVG/JPEG/EPS -> one package row, its declared
  variants only, even if approved source/sidecar were removed.
- Same-stem PNG/ZIP without record declarations -> excluded, never guessed.
- Supported explicit newer-format declarations -> PNG/ZIP recognized only under
  the approved versioned registry contract; v1 remains fully compatible.
- Output recorded outside export; orphan file inside export; unrelated JSON;
  malformed/unsupported record; temp/uncommitted file; zero bytes -> excluded
  with distinct audit reasons.
- Partial commit with valid SVG/JPEG and no EPS -> only valid outputs, not an
  imaginary complete package. Previously committed stale package -> visible
  warning, no automatic rebuild.
- Nested files, `exports`/`my-export-backup` near matches, source/AI/version folders
  -> no scope broadening. Do not alter review-tab discovery.
- Path traversal, absolute/URI/control-character/encoded-separator references,
  mismatched extension/type/stem, malicious output named export.json -> refuse.
- Root rebasing for moved records: deterministic verified containing-export
  mapping; no whole-tree basename recovery or access outside the granted handle.
- Equal basenames in two directories stay separate. Duplicate/conflicting record
  identities are diagnosed, not silently merged.
- Missing/unreadable/size/hash mismatch is not export-ready. File replacement
  between plan and execution fails the old task.
- A failed scan cannot overwrite the latest successful scan; the newest scan
  ticket wins. Scan does not mutate files or send network requests.

**Exit:** an auditable exported-only inventory; unchanged prep/Selection/Generate
SVG discovery tests still pass. Directory-wide inferred uploads are impossible.

## Phase 2 — new tab, exported list, previews and selection

TDD shell/session migration before adding the panel:

1. Add new tab id/state/remembered root slot and selector handles; preserve legacy
   saved tab ids and existing tab labels/behavior. Lazy mount and keep active
   transfer state alive across tab switches.
2. Wire Open folder, Rescan and handle-bound root-path/Location behavior. Distinguish
   denied permissions, unavailable OS location API and unknown absolute paths.
3. Render one package row with name/path/variants, exported artifact thumbnail,
   badges, metadata and transfer readiness. Do not render approved-source thumbnails.
4. Share active/checked/anchor gestures, range/modifier/Q/E rules and visible-header
   scope; keep this tab's selection independent of the preparation tab's checks.
5. Add sticky toolbar, thumbnail zoom, explicit destination/format controls and
   Upload disabled states. No control disappears as a way to make the bar compact.

Tests include JPEG -> PNG -> SVG fallback on unavailable/corrupt candidates,
EPS/ZIP-only placeholder, object-URL cleanup, sanitized SVG display, zoom not
changing outputs, filter-hidden checks, sticky geometry/scroll behavior, keyboard
isolation inside editors, tab-switch persistence and no unexpected upload.

## Phase 3 — complete row-label badges and metadata editing

### Badges

Reuse catalog add/rename/recolor/delete, row toggle, filter, bulk Apply badges,
counts and global undo. Keep the complete catalog/filter UI at the top and bulk
apply pinned. Share catalog only through the approved adapter and deterministic
package/root assignment identity. Test legacy assignment carry-over only for a
verified matching package. Deleting a shared catalog badge must show/apply the
correct affected assignments in both workspaces. No image output or metadata
request includes these labels; no artwork decoration is enabled.

### Metadata

Reuse current field components/validation where appropriate. Tests first for
finished-package-only metadata saves:

- Valid manual edit and explicit Save update existing SVG/JPEG/EPS carriers and
  record hashes/metadata last; no source, raster renderer, optimizer or provider
  invocation. Local artwork rendering/geometry is unchanged.
- Invalid fields, read-only folder, unsupported carrier, broken file or another
  tab changing the record leaves the prior good package intact and reports why.
- Test temp/readback/final marker/recovery behavior, not merely the in-memory JSON.
- Unsaved drafts stay distinct from committed metadata; Upload cannot silently
  send stale embedded values. Metadata edits invalidate a previously frozen plan.
- Root/package identity prevents editing another same-basename image or poisoning
  a source cache. Verify expected prep-tab rescan/metadata consistency.
- Empty Title/Description/Keywords, keyword punctuation/order, Creator/Copyright,
  copy actions and local undo follow existing validated semantics.
- Unsupported PNG/archive metadata updates are explicitly unavailable until their
  contract is implemented; do not label “JSON saved” as “file metadata verified.”

No generation/acceptance dialog is cloned from provider metadata generation.
Optional CSV convenience export and stock-site form automation are separate scope.

## Phase 4 — Shutterstock preset and local credential UI

Build/test stock-descriptor + non-secret preset + separate local secret adapter.
Only Shutterstock is selectable initially. The checkbox list/plan schema supports
many future destinations, but no extra site's host/requirements are invented.

Required tests:

- Host ftps.shutterstock.com / port 21 / explicit TLS, never SFTP or plaintext
  fallback; stock-required form fields come from its descriptor.
- JPEG/EPS eligible; PNG/SVG/ZIP visibly unavailable for Shutterstock. Size/MP
  checks use actual file data and EPS artwork-bounds evidence, not just artboard
  settings. Unsupported/unknown EPS compatibility cannot display a verified badge.
- Username and password saved only in the dedicated device secret store, not
  ordinary settings, project JSON, export record, job journal or undo payload.
- Credentials survive normal edit/tab/reload cycles without being overwritten by
  folder scan state or a preset snapshot.
- Empty Save changes nothing; Forget clears only the selected connection; failed
  persistence reports session-only or unreadable distinctly from absent.
- Stored password remains masked; error text, network diagnostic formatting and
  test logs redact both username and password, including malformed server replies.
- Opening/editing the form sends nothing. Explicit connection test discloses the
  authentication send and transfers no file.
- No real credentials in repository fixtures, environment files, command arguments,
  screenshots, planning docs or automated stock-account tests.

## Phase 5 — consented manifest planner and user-local companion

Implement pure planning before transport:

1. Snapshot checked packages, format groups, destination checkboxes and current
   committed artifact identities. Show exact files/remote names/targets/counts,
   blocked items and any overwrite/retry warnings in a confirmation.
2. Enforce provider-specific type/size constraints per task; same-stem raster
   variants remain distinct. Changes after confirmation require a new plan.
3. Refuse same-target filename collisions before opening connections. A deliberate
   future renaming policy must rename all related representations consistently
   and disclose it; do not silently reuse Download all naming as stock policy.
4. Authenticate/pair the user-local companion. Stream only confirmed files with
   bounded resources, a destination allowlist and verified TLS.
5. Keep local upload receipts separate from export commit status. Network success
   is “Transferred,” never “Accepted,” “Published” or “Submitted for review.”

Integration tests use a controllable local FTPS server, **real FTPS transport** and
synthetic assets. Cover AUTH TLS/protected data, valid/invalid/mismatched/expired
certificates, passive-address validation, auth failure, blocked cleartext fallback,
disconnect before/after remote commit, partial write, no rename support, remote
collision and restricted directory permissions. Verify the server received the
exact expected bytes; stubs alone cannot prove a working connector.

Companion browser-facing tests cover unauthorized origin/Host/token, pairing,
resource limits, hostile filenames, arbitrary-file/path access attempts, secret
redaction, malicious protocol messages and cancellation. Check browser secure-
context/local-network restrictions on supported deployment origins. No server is
started and no FTPS library installed as part of this planning delivery.

## Phase 6 — batch jobs, progress, cancellation and retry

Add the isolated stock-transfer job slot and visible progress lifecycle.

- One task per file × destination, accurate byte and settled-task counts. A local
  package with three variants on two selected compatible stocks is six tasks,
  not one. Only one stock connection ships initially.
- File failure does not strand other eligible tasks. Destination auth failure
  stops that destination queue without a password retry storm.
- Cancel prevents unsent work, aborts active transfer where possible, reports any
  possible remote residue and never deletes unrelated remote files.
- Crash/restart -> interrupted, not auto-resumed. A lost acknowledgment after
  remote write -> uncertain, reconcile before resend. Remote size is not proof
  of a hash match; name/size alone never guarantees deduplication.
- Test duplicate Upload clicks, tab switches, root/preset edits during a job,
  stale events from old jobs, no-op selection, canceled picker and retry of
  failed tasks only. Resending previously successful bytes requires confirmation.
- Terminal summaries and Cancel stay available across tabs, without replacing
  SVG/export/download progress. Completion audio once per finished process uses
  `tests/assets/Sound/universfield-new-notification-037-485898.mp3`; not per file.

No UI undo action claims to undo a remote stock upload. No remote deletion or
automatic submission/review/publication API is in the first connector.

## Phase 7 — current docs, full gates and acceptance

After implementation only, update canonical current pages and route them as a
**sixth mode**: new tab behavior/selectors, source/test owners, storage keys,
export discovery invariant, credential/transport consent and progress lifecycle.
Keep new stock-transfer docs separate from current prep-tab owners; preserve
existing stable selector/session meanings.

RULE 20 currently allows confirmed provider requests while local exports remain
local. Add an explicit, narrowly scoped user-confirmed stock-transfer exception
for exactly selected declared files and account authentication; do not weaken
local processing, secret redaction or the no-automatic-send policy.

Run without skips/threshold changes:

- Focused scanner/record/planner/secret/badge/metadata/UI/companion tests.
- Existing SVG-to-upload, source-discovery, selection, export/metadata, root/path,
  history, progress and cancellation regressions, including supplied real assets.
- `npx tsc --noEmit`, `npm run lint`, explicit-base changed quality gate,
  `npm run verify:fast`, `npm run verify` and production build.
- Independently exercise real FTPS transport/local server and browser permission/
  pairing flows; state which assertions are transport, UI, visual or stock acceptance.
- Keep native/performance alarms, source coverage scope and assertions intact;
  measure large exported-folder scans and bulk selection, no fake benchmarks.
- Validate docs routes/read budgets, append measured ledger entry without reading
  it, commit only scoped files with required attribution, push this feature branch.

**Later manual user acceptance (separately authorized):** on the user's own machine,
enter credentials locally; explicitly test connection; select a small owned,
policy-eligible exported package; confirm exact JPEG/EPS transfer. Check contributor
account import, metadata and Illustrator compatibility independently. Do not ask
for password/screenshots containing it, or claim acceptance from a transfer reply.

## Definition of done

The new tab lists only JSON-declared committed export files, independently of
source availability; keeps the requested row fields/badges/path and pinned
selection/zoom/bulk/upload controls; uses only selected compatible representations
and checked destinations; stores credentials locally without exposure; performs
real consented FTPS from the user's device; reports partial/uncertain/canceled
outcomes honestly; preserves all existing tabs and passes unchanged full gates.

None of these implementation milestones is claimed complete by this plan.
