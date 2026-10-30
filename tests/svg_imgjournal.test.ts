import { beforeEach, describe, expect, it } from "vitest";
import { IMAGE_JOURNAL_KEY, loadImageJournal, saveImageJournal, upsertImageRequest, removeImageRequest } from "../src/svg/imgjournal";

beforeEach(() => localStorage.clear());

const sent = { id: "edit-1", ids: ["a", "b"], status: "sent" as const, at: 123, model: "image/model", provider: "Requesty", requestId: null };

describe("image-edit unknown outcomes after a restart", () => {
  it("persists metadata only; never a prompt, image bytes or key", () => {
    const items = upsertImageRequest([], sent);
    saveImageJournal(items);
    expect(loadImageJournal()).toEqual({ entries: items, warning: false });
    expect(localStorage.getItem(IMAGE_JOURNAL_KEY)).not.toMatch(/prompt|imageData|secret|Bearer/);
    expect(removeImageRequest(items, sent.id)).toEqual([]);
  });

  it("strips unexpected payload fields on write and on validated read", () => {
    const injected = { ...sent, imageData: "private-bytes", prompt: "private-prompt", key: "Bearer private" };
    saveImageJournal([injected]);
    expect(localStorage.getItem(IMAGE_JOURNAL_KEY)).not.toMatch(/private/);
    localStorage.setItem(IMAGE_JOURNAL_KEY, JSON.stringify({ v: 1, entries: [injected] }));
    expect(loadImageJournal()).toEqual({ entries: [sent], warning: false });
  });

  it("rejects a corrupt schema or unknown status without resending anything", () => {
    localStorage.setItem(IMAGE_JOURNAL_KEY, JSON.stringify({ v: 1, entries: [{ ...sent, status: "done" }] }));
    expect(loadImageJournal()).toEqual({ entries: [], warning: true });
    localStorage.setItem(IMAGE_JOURNAL_KEY, "broken");
    expect(loadImageJournal()).toEqual({ entries: [], warning: true });
  });
});
