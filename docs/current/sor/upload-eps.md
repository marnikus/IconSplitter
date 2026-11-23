# Upload EPS and stroke expansion

The optional EPS path in [SVG to upload](upload.md); exports are local and validated.

Inherited caps/joins and forced endpoint modes: [stroke endpoints](upload-stroke-endpoints.md).

Live `<text>` is outside the built-in writer's subset (the upload flow's switch
is **Expand text to fills**). A builder sheet always has text, so it gets its own
rule: [export formats](export-formats.md).

## The clean envelope (2026-11-19)

**Clean up final SVG and EPS** rebuilds the EPS: no `%%Creator`, no Photoshop
block. See [export formats](export-formats.md).

## A document, not a log (2026-11-19)

Header, procset prolog, setup, compact operators, one named layer, and the
closed gate's new vocabulary: [the EPS document](upload-eps-document.md).
