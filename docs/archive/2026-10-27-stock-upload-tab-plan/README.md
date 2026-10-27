# New “Upload” tab — plan, not implementation

Written: 2026-10-27. User instruction: understand, document plan and steps;
**no application coding now**. No live login, connection test or upload is authorized.

- [Architecture, records and security](architecture.md)
- [Ordered implementation steps and acceptance tests](steps.md)

## 1. Goal and boundaries

Add a separate **Upload** tab after **SVG to upload**. Keep the existing tab as
the preparation/export workspace; do not rename, remove or replace it. The new
tab transfers already-exported representations of selected images to stock sites.
Initial destination: **one Shutterstock FTPS connection**. Design preset and job
models for several checked destinations, without shipping invented stock profiles.

Reuse the existing list interaction, metadata fields, row-label badges, path
controls, thumbnail zoom, history and progress conventions. Reuse components and
pure rules through adapters; do not fork the entire preparation panel and its
provider/export machinery. “Clone” means the requested UX, not independent copies
of the same algorithms.

No Single sheets changes. No new AI/provider generation. No automatic upload after
export, scan, badge change, metadata save or restart. No abandoned Windows build
work is resumed. A future local FTPS companion is a separate explicit runtime
decision, not a hidden replacement of the browser-only application.

## 2. Requested screen

### Top of tab

1. **Open folder**, Rescan, root name and the existing full-path/copy presentation.
   Use the current verified path-capture rules; never invent an absolute OS path
   from a directory handle's name. An unavailable full path is honestly labeled.
2. **Badges** controls with the full existing row-label workflow: manage catalog,
   add, rename, recolor, remove, badge filter, per-item assignments and bulk apply.
3. **Stocks / FTP connections**: stock dropdown, its settings form, saved connection
   summary, local credential controls, and a checkbox for each configured target.
   Initially the dropdown/list contains Shutterstock only. Different future stocks
   may expose different fields; there is no assumption that one fixed FTP form
   works for every stock.

### Pinned selection/action toolbar

Stays at the top of the scrolling workspace, without covering rows or the progress
header. Controls remain visible, wrapping on narrow widths:

- Selection count and visible-header select/deselect controls.
- Thumbnail zoom; display-only, never a conversion or output-size setting.
- **Apply badges** to checked items, including hidden checks under the current
  shared selection contract; show the total affected count.
- File-type checkboxes: **JPEG/PNG**, **SVG**, **EPS**, **ZIP**.
- Checked destination summary and **Upload** button with item/file counts.
- During a run: progress and **Cancel**; no duplicate-start clicks.

No export geometry, stroke, padding, artboard, vector corner-badge, shadow, size-guide,
metadata-provider or export-preset controls on this new tab.

### One row per image package

- Checkbox, active-row behavior and shared Batch-style range/modifier/Q/E gestures.
- Thumbnail from a committed on-disk **JPEG first, then PNG, then SVG**. Decode
  failure falls back to the next declared available candidate. EPS/ZIP-only rows
  show an honest placeholder, not an invented raster thumbnail.
- Exported base name, export-folder path, available representation names/paths,
  and the existing **Location** action with capability-aware fallback.
- Editable Title, Description, Keywords, and current Creator/Copyright support.
  Reuse current field validation/copy UX; do not add provider generation controls.
- Row-label badge chips and per-row badge assignment.
- File readiness, metadata-save state and per-stock transfer outcome, clearly
  distinct from the original local-export state and from stock acceptance.

“Badges” here means named colored **list labels**, not artwork decorations. Applying
one must not modify image bytes or enable the existing vector corner badge.

## 3. Hard discovery rule: JSON AND export folder AND disk

The new tab's data source is **committed export records**, not approved-source SVG
pairs. A file qualifies only if all three are true:

1. A recognized export JSON explicitly declares it as a committed output.
2. Its actual location is inside the corresponding literal **export** directory
   within the user's selected root (or directly inside the root if the root itself
   is that export directory).
3. The referenced file exists, is readable, and passes required integrity checks
   before transfer.

A same-stem file without a JSON declaration is never inferred or uploaded. A JSON
entry outside export is never followed. Source folders, AI-source images,
SVG-version folders, temp/backup files, orphan artifacts and export JSON itself
are never transfer candidates. Existing review-tab exclusions stay unchanged.

The scanner must work if the original approved SVG or its sidecar is no longer
present: this tab consumes the finished package. It must descend into export
folders, unlike the current source-discovery scanner which deliberately ignores
those folders. Do not change that scanner's exclusion policy globally.

Processed commits are eligible. Partial commits may list only their actually
committed, validated representations; missing EPS cannot be invented. A previously
committed but stale package stays visible with an honest warning; it is not silently
regenerated from source. Failed/uncommitted/corrupt records and missing/mismatched
artifacts appear in audit/errors, not as valid files. See architecture for strict
record checks, root rebasing and hash validation.

## 4. Formats and multi-destination behavior

The four checkboxes choose existing representations, not conversion jobs. All are
visible; unsupported or unavailable choices explain why they cannot be sent.

- JPEG/PNG is the requested raster group: expand to the recorded, available raster
  variants allowed by each target. If both exist and are enabled, the confirmation
  lists both; never silently substitute PNG for JPEG or merge different files.
- SVG, EPS and ZIP retain their real extensions and bytes. No raster fallback,
  automatic ZIP assembly/extraction, format conversion or source substitution.
- Current export schema/producer records SVG/JPEG/EPS only. PNG/ZIP need an explicit,
  backward-compatible artifact-registry contract before they can be eligible.
  Their presence on disk alone is insufficient. No new PNG/ZIP generator is assumed.
- Group variants by validated package identity and matching artifact stem, not by
  a global basename search. Same-named packages in different folders remain separate.

Planning is per **checked item × declared representation × checked destination**.
Destination compatibility is checked independently. Known-unsupported requested
formats are visibly excluded with reasons; the user reviews the resulting plan
before any send. No destinations or no eligible files means no run, no fake success.
Preselect Shutterstock's JPEG/EPS format choices only where available; unsupported
choices stay visibly disabled for that destination. Nothing uploads until confirmed.

## 5. Shutterstock v1 — documented facts versus proposed policy

Official sources checked 2026-10-27:

1. [User-supplied FTPS instructions](https://submit.shutterstock.com/help/en/articles/10617392-how-do-i-upload-content-via-ftps):
   host **ftps.shutterstock.com**, port **21**, explicit FTP over TLS; account
   Contributor email/username and password. This is FTPS, **not SFTP**.
2. [Technical image requirements](https://submit.shutterstock.com/help/en/articles/10617390-what-are-the-technical-requirements-for-images):
   JPEG/TIFF and EPS are documented. JPEG up to 50 MB; EPS up to 100 MB. Images
   require at least 4 MP; EPS artwork bounding box must be 4–25 MP, not merely
   its artboard. EPS must be compatible with Illustrator 8 or 10.
3. [Vector submission](https://submit.shutterstock.com/help/en/articles/10617412-how-do-i-submit-vector-illustrations-for-review):
   FTPS is supported for vectors. Upload precedes metadata/category completion
   and explicit submission for review in the contributor site.
4. [Metadata CSV instructions](https://submit.shutterstock.com/help/en/articles/10617486-how-do-i-include-existing-metadata-with-my-content-submission):
   CSV is imported separately on the Submit page **after** asset upload, not sent
   alongside images through FTPS. A CSV convenience action is optional follow-up,
   not permission to silently add sidecars to the FTPS plan.

**Initial application policy:** allow JPEG and EPS; keep PNG/SVG/ZIP unavailable
for Shutterstock because these sources do not document them as image-submission
formats. TIFF is documented by Shutterstock but not requested for this first UI.
No arbitrary endpoint or plaintext-FTP fallback. Use mandatory explicit TLS,
certificate/hostname verification and protected data connections. The help page's
“if available”/certificate-trust screenshots are not a reason to downgrade security
or silently accept an invalid certificate.

A local EPS parser/metadata test is not proof of Illustrator 8/10 compatibility or
Shutterstock ingestion. Validate known technical constraints, surface unknown
compatibility as “requires review,” and require deliberate acknowledgment rather
than labeling it verified. Do not rewrite or rasterize EPS to hide incompatibility.
Rights, releases and agency policies (including AI-content eligibility) remain
separate submission checks; this feature must not claim they are satisfied.

## 6. Credentials and runtime approval

Browser pages cannot open the raw TCP/TLS FTP control/data connections. A working
FTPS upload therefore needs a native runtime or a local companion. Recommended
proposal: keep the browser UI and use a small, separately started companion on
**the user's computer**. It sends files directly to the selected stock; no cloud
relay, Arena server, analytics or external credential service.

Username and password are saved **only on the user's device**, separately from
non-secret presets. They never enter project JSON, session exports, undo history,
logs, screenshots, diagnostics or provider requests. Existing saved secrets remain
masked; password reveal is not part of this plan. Local-only storage does not
mean credentials are never transmitted: authentication necessarily sends them
only to the configured stock over verified TLS, after confirmation. Do not ask
for credentials in chat or use them during development.

The current app must stay useful without the companion: scans, badges, metadata
and previews remain local. Upload is disabled with setup guidance, not simulated.
A remote browser preview does not make an agent/sandbox-side helper local to the
user. No real credential or image may be routed through that sandbox as a workaround.

## 7. Decisions to approve before implementation

Recommended defaults, not new user instructions:

1. **Runtime:** approve the user-local companion, or choose a native desktop host.
   Browser-only direct FTPS is not a viable third option. No companion is built now.
2. **Formats:** approve the Shutterstock JPEG/EPS restriction with all requested
   controls still visible; other formats require a future compatible destination.
3. **Metadata:** approve explicit metadata-only package saves before sending,
   including artifact hash/readback updates; no transfer of unsaved drafts.
4. **Badge sharing:** reuse the existing catalog UI and catalog, but scope new
   assignments by root/package. Import old assignments only on a verified identity
   match; never attach another root's labels by basename.

See steps.md for the TDD-first implementation sequence, acceptance criteria,
manual credential-free checks and later user-controlled live acceptance. This
planning delivery changes documentation only; nothing described above is shipped.

## Planning-delivery checks

Only this dated planning pack and a measured planning ledger append were written;
application source, tests, dependencies and current behavior contracts were not
changed by this task. All local links between these three documents resolve.
The current-doc navigation test was attempted but **did not start**: the installed
Rollup tree lacks `@rollup/rollup-linux-x64-gnu` (`MODULE_NOT_FOUND`). No tests are
claimed passed, and dependencies were not reinstalled for a documentation-only
request. Diagnostic: `/home/user/stock-upload-plan-docs.log`. Public help pages were
read; no account authentication, credential entry or upload was performed.
