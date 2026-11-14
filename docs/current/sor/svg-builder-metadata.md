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
  - For the current sheet it happens at **Accept** of the draft, as one undo step.
- **Banner text**: metadata never replaces the banner words any more (`sheetCopy`). The SVG's hidden `<title>` uses the accepted metadata title, and `<desc>` holds the description and tags.
- **Editing** (`SvgBuilderMetaFields.tsx`, in the metadata widget): the upload tab's `UploadMetaFields` (Title, Description, Tags, each with Copy, without the Icon Name field: `showName={false}`).
  - Editing an accepted answer marks it `edited`.
  - **✓ Accept** re-validates and refuses with the exact rule violations.
  - **↻ Regenerate** opens the exact request.
  - On an open artboard the edits are part of its draft (✓ Save artboard).
