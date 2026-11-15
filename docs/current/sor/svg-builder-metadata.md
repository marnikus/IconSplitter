# SVG builder — sheet and artboard metadata

Parent: [SVG builder](svg-builder.md) · artboards: [templates & presets](svg-builder-presets.md) · selectors: [templates & artboards selectors](../selectors/svg-builder-presets.md).

Since 2026-11-14 the builder's metadata is the **same system as the SVG to upload tab**.

- **Fields** (`lib/svgBuilder/metadata.ts`, `SheetMetadataFields`): **Title**, **Description**, **Tags**. They are parsed, cleaned and validated by `lib/upload/meta.ts`:
  - `parseMetadata` reads the labeled `Title:` / `Description:` / `Tags:` lines; `Title 1:` and `Title 2:` are ignored.
  - `cleanPhrase` applies sentence case and drops the end period; tags are deduped.
  - `validateMetadata` requires a title of at least 5 words, a description of at least 7 words, at least 10 tags, and the seven mandatory tags.
  - Older saves are read with `subtitle` → `description` and `keywords` → `tags`.
- **Prompt**: `DEFAULT_SHEET_PROMPT` is the stock prompt. It asks for Title 1, Title 2, Title, Description, Tags and **Title-Artboard**. A saved copy of the old JSON prompt is replaced with it on read (`isLegacySheetPrompt`).
- **Image** (`lib/svgBuilder/metaimage.ts`, `metaimagefor.ts`, `preview.ts` `sheetPngFor`):
  - the sheet's **icons only**: the banner strip is cut off and the banner turned off, so the icon grid keeps its exact size;
  - rendered by the PNG export's renderer (`exporter.ts` `sheetPngBlob`) as **one PNG of at most 1 megapixel** (`megapixelSize`);
  - shown in the confirmation and sent unchanged.
- **Answer** (`parseSheetAnswer`): Title, Description and Tags become the metadata. **Title-Artboard** (2–5 words) is not metadata: it becomes the artboard's **visible banner title**, and the subtitle becomes the default phrase "Editable stroke width".
  - On artboards (✦ Generate metadata, `withSheetAnswer`) this happens at once. An artboard open on the stage gets the same words and metadata there, so it shows no unsaved change.
  - For the current sheet the answer is **applied at once** (2026-11-15: no draft step, no Accept draft button). It is accepted when it passes the upload rules, else kept as invalid with its errors in the editor. The Title-Artboard goes onto the banner as one undo step, and the confirmation closes.
- **Banner text**: metadata never replaces the banner words any more (`sheetCopy`). The SVG's hidden `<title>` uses the accepted metadata title, and `<desc>` holds the description and tags.
- **Editing** (`SvgBuilderMetaFields.tsx`, in the metadata widget): the upload tab's `UploadMetaFields` (Title, Description, Tags, each with Copy, without the Icon Name field: `showName={false}`).
  - Editing an accepted answer marks it `edited`.
  - **✓ Accept** re-validates and refuses with the exact rule violations.
  - **↻ Regenerate** opens the exact request.
  - On an open artboard the edits are part of its draft (✓ Save artboard).
- **Per artboard row** (2026-11-15, `SvgBuilderRowMeta.tsx`, `actions/artboardmetaedit.ts`):
  - Clicking a row (making it the active row) opens the same upload-tab editor under it (`upload-meta-*-<artboard id>`).
  - Edits and ✓ Accept are written into that artboard at once. An artboard open on the stage gets the same metadata there, so it shows no unsaved change.
  - Every row has **↻ Metadata** (`builder-artboard-regen-<id>`), which opens the exact-request confirmation for that one artboard.

## Saving sheets in the folder (2026-11-14)

The tree mirrors single icons' `_split_output`, but under **`_artboard_sheets`** (`lib/svgBuilder/sheetfolders.ts`):

`<root>/_artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<title-artboard>_sheet_<icons>_icons_<colour>_<colour>_palette_id<template code>/artboard_variant_<N>/`

- **Sheet folder**: the slug of the artboard's title (its Title-Artboard after generation), the number of icons, the banner background and accent named as colour words (`colorWord`), and a 5-digit template code.
  - All artboards of one template share their template's sheet folder; the first one saved names it.
  - Each artboard is `artboard_variant_<N>`, where N is its own "#N".
  - The artboard remembers its folder (`FinalArtboard.folder`, validated on read: inside `_artboard_sheets` only), so later saves land in the same place, even on a later day.
- **When metadata is generated** (✦ Generate metadata): the variant folder is created with `metadata.json` (Title, Description, Tags, Title-Artboard, validation, prompt, model) and `preview.png`, the exact icons-only image that was sent (`sheetwriter.ts`).
- **⇪ Export all selected** (header, `builder-export-selected`): exports the checked artboards (else the open one), from their **saved** state. Each one goes into `…/artboard_variant_<N>/export/` (`actions/sheetexport.ts`, `sheetpackage.ts`):
  - `<stem>.svg` with the metadata embedded, where `<stem>` is the sheet folder name + `_v<N>`;
  - `<stem>.jpg` at the Upload settings' megapixels, with XMP metadata;
  - `<stem>.eps` from the Upload settings' EPS converter, with `currentColor` resolved first. The built-in writer may refuse text; the Inkscape helper converts it;
  - `<stem>.png` at full size, 2×;
  - `export.json`: the Upload tab's export record (status `processed`, or `partial` when a part failed), so the stock upload tab discovers the package.
  - Every failed part is reported in the toast and the rest still ships.
  - The export counts the icons' use once per artboard, and the artboard remembers its folder and `exportedAt`.
- The builder header is pinned to the top while the page scrolls.
- **✦ Generate metadata in the pinned header** (2026-11-15, `builder-header-generate-metadata`, beside ⇪ Export all selected): it generates for the checked artboards, else the open artboard, else the current sheet. The exact-request confirmation is shown first, as everywhere else.
