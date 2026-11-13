import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { loadHistoryPreviewUrl } from "../src/stockupload/historypreview";
import { BinDir, BinFile } from "./helpers/binfakefs";

const ROOT_PATH = "F:\\Stocks\\Icons";

function batch() {
  return {
    id: "run-1", stockId: "shutterstock", stockName: "Shutterstock",
    uploadedAt: "2026-11-08T10:00:00.000Z", uploadedCount: 1, failedCount: 0,
    cancelled: false, rootPath: ROOT_PATH,
    files: [],
  };
}

describe("stock upload history previews", () => {
  let createObjectUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearKnownRoots();
    createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:history-preview");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearKnownRoots();
  });

  it.each([["JPG", "image/jpeg"], ["JPEG", "image/jpeg"], ["PNG", "image/png"]] as const)(
    "uses a same-folder .%s sibling image for an EPS history file",
    async (extension, mime) => {
      const root = new BinDir("icons");
      const folder = new BinDir("export");
      root.children.set("export", folder);
      folder.children.set("star_icon.eps", new BinFile("star_icon.eps", "%!PS-Adobe EPS"));
      folder.children.set(`star_icon.${extension}`, new BinFile(`star_icon.${extension}`, new Uint8Array([1, 2, 3])));
      rememberKnownRoot(root, ROOT_PATH);

      const url = await loadHistoryPreviewUrl(root, batch(), {
        itemId: "item-star", fileName: "star_icon.eps", format: "eps",
        relPath: "export/star_icon.eps", fullPath: `${ROOT_PATH}\\export\\star_icon.eps`,
      });

      expect(url).toBe("blob:history-preview");
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      expect(createObjectUrl.mock.calls[0][0].type).toBe(mime);
    },
  );

  it("keeps unsupported or missing EPS sibling previews unavailable", async () => {
    const root = new BinDir("icons");
    const folder = new BinDir("export");
    root.children.set("export", folder);
    folder.children.set("star_icon.eps", new BinFile("star_icon.eps", "%!PS-Adobe EPS"));
    folder.children.set("other.jpg", new BinFile("other.jpg", new Uint8Array([1, 2, 3])));
    rememberKnownRoot(root, ROOT_PATH);

    await expect(loadHistoryPreviewUrl(root, batch(), {
      itemId: "item-star", fileName: "star_icon.eps", format: "eps",
      relPath: "export/star_icon.eps", fullPath: `${ROOT_PATH}\\export\\star_icon.eps`,
    })).resolves.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
