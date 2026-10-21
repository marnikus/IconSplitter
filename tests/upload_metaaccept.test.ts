import { describe, expect, it, vi } from "vitest";
import { acceptSelectedMetadata, idsAwaitingAcceptance, needsMetadataAcceptance } from "../src/upload/metaaccept";
import { EMPTY_META, type UploadRow, type UploadMetaState, type Latest } from "../src/upload/types";
import type { UploadCtx } from "../src/upload/actions";
import { STOCK_TEST_META } from "./helpers/stockexport";

describe("bulk metadata acceptance scope and guards", () => {
  it.each([
    ["generated", false, true], ["invalid", false, true], ["accepted", true, true],
    ["accepted", false, false], ["pending", false, false], ["interrupted", false, false], ["empty", false, false],
  ] as const)("state=%s edited=%s needs acceptance=%s", (state, edited, expected) => {
    expect(needsMetadataAcceptance({ ...EMPTY_META, metadata: STOCK_TEST_META, state, edited })).toBe(expected);
  });
  it("does not accept null metadata even with stale draft flags; deduplicates the selected IDs", () => {
    expect(needsMetadataAcceptance({ ...EMPTY_META, state: "generated" })).toBe(false);
    const row = (id: string, meta: UploadMetaState) => ({ source: { id }, meta } as UploadRow);
    const draft = { ...EMPTY_META, state: "generated" as const, metadata: STOCK_TEST_META };
    expect(idsAwaitingAcceptance([row("a", draft), row("unchecked", draft), row("empty", EMPTY_META)], ["a", "a", "empty", "missing"])).toEqual(["a"]);
  });
  it.each(["empty-selection", "busy", "metadata-run", "export-run"])("refuses %s without dispatching changes", async (reason) => {
    const say = vi.fn(); const dispatch = vi.fn();
    const c = {
      say, dispatch, m: { busy: reason === "busy" ? "Reading" : null },
      refs: { abortMeta: { current: reason === "metadata-run" ? new AbortController() : null }, abortExport: { current: reason === "export-run" ? new AbortController() : null } },
    } as unknown as UploadCtx;
    await acceptSelectedMetadata({ current: c } as Latest, reason === "empty-selection" ? [] : ["a"]);
    expect(dispatch).not.toHaveBeenCalled(); expect(say).toHaveBeenCalledWith(expect.any(String), true);
  });
});
