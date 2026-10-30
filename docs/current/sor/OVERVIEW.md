# Current system overview

The five current modes are routed from [the current-doc index](../README.md). Provider requests are opt-in exceptions to local processing (RULE 20); no automatic website upload occurs. The old summary claimed that Generate SVG uploaded nothing, but a confirmed Requesty generation explicitly sends selected AI images.

## 1. What this is

A browser app with six modes (top tabs, `src/ui/Workbench.tsx`):

1. **Single sheets** — detect individual icons in a sprite sheet, review,
   resize and exclude them, export equal-size square PNGs (ZIP / downloads /
   folder / clipboard).
2. **Batch folders** (Chrome/Edge only, File System Access API) — pick a root
   folder, recursively scan every `*_AI*` image, review and select them, split
   each into its own organised output tree beside the sources, with presets,
   per-reference JSON status tracking, and split PREVIEWS that persist across a
   page/system restart: a boot with a restored root re-renders them from the
   stored records (never regenerating on its own — regeneration happens only on
   the explicit "↺ Regenerate splits", which overwrites the stored record; the
   plain "◉ Preview splits" skips rows whose stored preview is current, unless
   the record was rendered under other settings — then it is stale and
   re-rendered). A boot never spends the permission gesture: it queries
   quietly, keeps the handle, and shows a one-click "Restore access" bar
   (`batch-grant`) when the browser answers "prompt"; per-item merge decisions
   persist per preset and drive the preview AND the split identically (I-67).
3. **Selection V2** (Chrome/Edge only) — recursively pair originals with AI
   results and save each decision in its own pair sidecar, presented as the template-driven
   `design/selection tab V2/v2 selection tab.html` design: a full-width
   **list review** with paired thumbnails, a thumbnail zoom slider, real
   multi-selection and bulk approve, plus a switchable **comparison** layout.
4. **Generate SVG** (Chrome/Edge only) — recursively scans the same root and
   keeps ONLY the pairs Selection V2 approved, sends each approved
   AI image (alone or as a square contact sheet of up to 9) to Requesty's
   OpenAI-compatible chat endpoint, and saves one validated SVG per source
   beside that source's AI image, versioned (`_v2`, `_v3`…) with a per-file
   `<stem>.svg.json` sidecar. Only a confirmed provider request sends the
   disclosed images; the API key lives only in this browser. [AI-source image
   edits](svg-image-edits.md) have their own confirmation and review flow.
5. **SVG to upload** (Chrome/Edge only) — prepares the APPROVED SVG icons for
   external stock/print websites. Recursively discovers one row per pair with
   a valid approved SVG (through the pair sidecars; `export/` is never
   scanned, so export output never feeds discovery), applies
   padding/background/stroke settings (global defaults + per-icon overrides),
   generates conceptual metadata with Gemini (the exact prompt, confirmed
   before any send), optimizes the export SVG copy with SVGO, renders a 15.1
   MP JPEG from the vectors, optionally writes a genuine EPS, and commits a
   validated per-icon package (`<pair-folder>/export/<base>.svg|.jpg|.eps` +
   one `export.json`) atomically. The approved source and its sidecar are
   never touched.
6. **Upload** (`stockUpload`, Chrome/Edge + local helper) — lists **only**
   committed packages inside `export/` folders recorded in `export.json`
   ([I-80](invariants/upload.md#i-80)), lets you review/zoom previews, manage
   shared row badges, edit and re-embed XMP/IPTC/RDF metadata locally, and
   upload selected same-stem representations (`JPEG/PNG`, `SVG`, `EPS`, `ZIP`)
   to one or more configured stock FTPS/SFTP presets (seeded with
   **Shutterstock** `ftps.shutterstock.com:21` Explicit FTPS and **Adobe Stock**
   `sftp.contributor.adobestock.com:22` SFTP) after explicit confirmation via
   the local loopback helper (`tools/bridge/server.mjs`), with local-only
   non-expanded credentials ([I-81](invariants/upload.md#i-81)).

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4, `jszip` for archives.
Production build is one self-contained `dist/index.html`
(`vite-plugin-singlefile`) that runs offline with no server (RULE 20).
