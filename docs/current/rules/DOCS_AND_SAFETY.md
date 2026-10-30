# Documentation, privacy and delivery rules

Canonical rules for this topic. Return to the [RULE 1–25 index](../AGENT_RULES.md) for the other rules.

<a id="rule-6"></a>

## RULE 6 — Excluded / removed items must not persist into output

* Excluded boxes (`excluded`) never appear in ZIP, folder save or clipboard output.
* A removed sheet never reappears in any later export, and its object URL is revoked.
* Re-detection with a stricter merge radius must shrink the icon list, never resurrect removed items.

Invariant: *every export contains exactly the currently included boxes of currently loaded sheets.*

<a id="rule-14"></a>

## RULE 14 — The export is not the sheet

* The loaded sheet (source image, analysis, boxes) answers "what is detected".
* The exported files answer "what the user saved" and live outside the app.
* Removing a sheet, re-detecting, or excluding icons never deletes or invalidates already-downloaded files. Only explicit user action in the OS removes exports.

<a id="rule-15"></a>

## RULE 15 — Nothing is exported without the verification gate

An icon may be delivered to the user (ZIP entry, folder file, clipboard) **only** when all checks pass:

1. `renderIcon` produced a canvas with `width > 0` and `height > 0`;
2. `canvasToBlob` returned a non-null blob of the requested type with `size > 0`;
3. the crop belongs to a currently included box of a currently loaded sheet (RULE 6).

Verification lives in the export path and fails **closed**: any failed check → the item is skipped with an honest error message (RULE 4), never a zero-byte or corrupt file.

<a id="rule-17"></a>

## RULE 17 — One current doc, dated archive

* `docs/current/` holds only what is true today — the root router `docs/current/README.md` and the one canonical page per fact it routes to. If not true today it does not belong here.
* Every design/plan/root-cause doc goes straight into `docs/archive/<YYYY-MM-DD>-<topic>/`, dated by day written. Archived docs are never edited to "catch up".
* **Do not add a new top-level doc for a feature.** Write the design into the archive, then update the owning current pages (behaviour, invariants, selectors, owners, storage, tests) and, for a new page, its row in `docs/current/README.md`. A page that would pass 9 KB is split into a `-<part>` sibling (RULE 18).
* Reference docs by full repo-relative path on one line so they stay greppable.
* A doc that no longer describes reality gets folded into its owning current page or replaced by a one-line pointer — never deleted, because reasoning is value.

<a id="rule-20"></a>

## RULE 20 — Privacy & compliance: local by default; provider sends only by informed consent

* Sheets, splitting, reviews, previews and exports are processed **entirely client-side** and stay functional offline. Exports are never automatically uploaded; no analytics or unrelated network service may see user content.
* An explicit, confirmed provider-backed generation/edit/metadata run may transmit **only its disclosed inputs** to the named, configured provider. Generate SVG sends selected AI images; AI-source image edits send the current main image, or one previewed composite containing the named selected icons, plus the complete effective prompt. Opening a dialog sends nothing; queued requests proceed only within the confirmed run and Stop blocks unsent ones. Never send an unpreviewed replacement image, a whole output folder, or any bytes outside such a run.
* API keys stay in the browser secret store; logs, journals and exports omit keys, image bytes, data URLs and full request payloads. Respect copyright: the user is responsible for owning the images they process; the app never fetches unrelated image URLs. Revoke object URLs when no longer needed.

<a id="rule-22"></a>

## RULE 22 — Export output must be traceable to its source

Adapted from the correlation-token rule:

* Every exported file is named from its sheet base name plus a deterministic index in detection order — an export must be traceable back to *which sheet, which icon*.
* The export path only consumes boxes from the sheet instance being exported; never mix boxes across sheets or from a stale pre-redetection snapshot.
* ZIP entries and folder files use the same naming function — one owner, no drift.

<a id="rule-23"></a>

## RULE 23 — Delivery is atomic; never a partial file

* Blobs are complete-or-nothing: a ZIP is built fully in memory and downloaded once; a folder-save writes one finished blob per file; a partial/corrupt blob is never handed to the browser (RULE 15 gate).
* Name collisions get a unique suffix rather than silent overwrite of user files.
* Interrupted exports never leave a half-written ZIP: build first, deliver once.
