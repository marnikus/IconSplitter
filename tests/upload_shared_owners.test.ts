// @vitest-environment node
// Architectural acceptance: shared CSS alone must not masquerade as code reuse.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const source = (name: string) => readFileSync(resolve(process.cwd(), "src", name), "utf8");
const owners = [
  ["DisclosureGroup", "upload/UploadSettingsGroup.tsx", "stockupload/StockReport.tsx"],
  ["PackageList", "upload/UploadList.tsx", "stockupload/StockRows.tsx"],
  ["PackageListHead", "upload/UploadList.tsx", "stockupload/StockRows.tsx"],
  ["PackageListFooter", "upload/UploadList.tsx", "stockupload/StockRows.tsx"],
  ["PackageRow", "upload/UploadRow.tsx", "stockupload/StockRows.tsx"],
  ["PackageFileCell", "upload/UploadRow.tsx", "stockupload/StockRows.tsx"],
  ["BulkBarShell", "upload/UploadBulkBar.tsx", "stockupload/StockToolbar.tsx"],
  ["FolderSource", "upload/UploadControls.tsx", "stockupload/StockControls.tsx"],
  ["ProviderCardShell", "upload/UploadControls.tsx", "stockupload/StockAccount.tsx"],
  ["MetadataEditor", "upload/UploadMetaFields.tsx", "stockupload/StockMetadata.tsx"],
  ["PreviewFrame", "upload/UploadPreview.tsx", "stockupload/StockThumbnail.tsx"],
  ["SvgModal", "upload/UploadMetaDialog.tsx", "stockupload/confirmation.tsx"],
  ["ModalHeader", "upload/UploadMetaDialog.tsx", "stockupload/confirmation.tsx"],
  ["ToggleField", "upload/settingsfield.tsx", "stockupload/StockToolbar.tsx"],
  ["TextField", "upload/UploadControls.tsx", "stockupload/StockControls.tsx"],
  ["TextField", "upload/UploadControls.tsx", "stockupload/StockAccount.tsx"],
  ["Select", "upload/UploadControls.tsx", "stockupload/StockControls.tsx"],
];
it.each(owners)("%s is owned once and consumed by both %s and %s", (component, first, second) => {
  for (const file of [first, second]) {
    const text = source(file);
    expect(text).toMatch(new RegExp(`(?:import[^;]*\\b${component}\\b[^;]*from|export function ${component}\\b)`));
    expect(text).toMatch(new RegExp(`<${component}[\\s/>]`));
  }
});

it("both metadata editors use the original shared clipboard action", () => {
  for (const file of ["upload/uiactions.ts", "stockupload/StockMetadata.tsx"]) {
    expect(source(file)).toMatch(/import.*copyMetadataField/);
    expect(source(file)).toMatch(/void copyMetadataField\(/);
    expect(source(file)).not.toContain("navigator.clipboard");
  }
});
