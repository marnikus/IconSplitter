import { describe, expect, it } from "vitest";
import { summarizeUploadRun } from "../src/stockupload/uploadsummary";
import type { UploadBatchSummary } from "../src/stockupload/batchtypes";

const summary = (patch: Partial<UploadBatchSummary> = {}): UploadBatchSummary => ({
  uploadedFiles: 2, failedFiles: 0, cancelled: false, lastError: null, ...patch,
});

describe("stock upload result summary", () => {
  it("reports cancellation and failed files without calling an incomplete run successful", () => {
    expect(summarizeUploadRun(summary({ cancelled: true }), 2).text).toContain("Upload cancelled (2 file(s) sent)");
    expect(summarizeUploadRun(summary({ failedFiles: 1, lastError: "network" }), 2))
      .toEqual({ text: "Uploaded 2 file(s), 1 failed: network", err: true });
  });

  it("reports local Getty staging and successful site counts", () => {
    expect(summarizeUploadRun(summary({ stagedDir: "C:/stage" }), 1).text).toContain("C:/stage/");
    expect(summarizeUploadRun(summary(), 3)).toEqual({ text: "Uploaded 2 file(s) across 3 stock site(s)", err: false });
  });
});
