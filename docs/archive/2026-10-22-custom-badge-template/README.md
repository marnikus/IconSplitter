# User-defined corner badge SVG — implementation plan

Date: 2026-10-22. Request: replace the supplied EDITABLE STROKE WIDTH badge with user SVG code, through a popup with a code area and preview.

## Decisions before implementation

- Keep the bundled graphic and its existing byte/geometry contracts as the default. Add a validated `badgeTemplateSvg` settings string; empty means bundled. Global edits change inherited defaults; icon edits pin only that icon. Never change badge-enabled flags or selection. Reuse storage, reset-to-inherited and the global undo timeline for icon edits.
- Add one template editor trigger alongside the existing placement fieldset, including when a badge is off. Popup drafts are local until Apply. Show source, isolated image preview, validation error, Apply, Cancel, Restore default; Escape/backdrop cancel only the editor. Restore default changes the draft and still requires Apply. Reopening uses the effective template.
- Handle supported vector SVG, not just seven paths or a 412×20 viewBox: paths, basic shapes, nested groups, paint-only styles and object-bounding-box gradients. Preserve the supplied viewBox (including origin), aspect ratio, paints, and relative stroke widths. Explain refusals for text (outline first), raster images, scripts, external resources, unsupported effects or geometry; never silently omit them or rasterize EPS artwork.
- Treat code as untrusted. Parse inert XML, reject DTD/entity declarations, oversized/deep documents, executable/foreign elements, event attributes, external references, unsupported styling/attributes. Validate and canonicalize before preview, persistence and export. Preview only approved SVG via an image data URL, never raw markup in the live DOM. No resource fetch or provider request.
- Reuse the geometry bake/copy, stroke cap/expansion and inside-artboard proofs. Custom badge is appended last, isolated from artwork paint, and does not change icon fitting. Reuse corner/percent placement with template-specific aspect ratio. Rename local referenced IDs to avoid artwork/shadow collisions. Export errors leave the destination tree unchanged.
- Fingerprint the actual selected template only when enabled; bundled and disabled legacy fingerprints stay unchanged. Reject corrupt persisted custom values without losing unrelated settings.

## Implementation / TDD steps

1. Reconcile restored Git index to fetched feature history without altering working files (done; clean at 27b87fd).
2. Add failing focused tests for template validation, non-default geometry, fingerprints, persistence, SVG/native-vector EPS output and editor draft/apply/cancel/default behavior.
3. Implement safe template parsing, custom geometry and settings plumbing. Keep default renderer intact; connect shared preparation so previews/JPEG/SVG/EPS agree.
4. Implement accessible popup and trigger with isolated preview; preserve scope/opt-in/reset/undo contracts.
5. Run focused tests including existing badge geometry/settings/UI, preview/export, settings storage and undo. Update owning current SOR, selector, storage/owner/test routes.
6. Run types, lint, changed quality, sequential fast/full verification. Append measured quality ledger without reading it. Commit scoped source/tests/docs with verification and attribution; push the existing session branch. Do not stage dist, fixtures or temporary outputs.

Acceptance: a safe supported replacement SVG visibly previews, applies to the real prepared artwork and native vector EPS, persists/reloads, fingerprints correctly, and can be canceled or restored. Unsafe/unsupported input cannot apply or execute. Existing badge default and checked-only behavior are unchanged.
