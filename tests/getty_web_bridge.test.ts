// @vitest-environment node
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { inspectGettyBatch, snapshotGettyBatch } from "../tools/getty-web/files.mjs";
import { createGettyBatch, injectGettyFiles } from "../tools/getty-web/portal.mjs";

const dirs: string[] = [];
async function folder() {
  const dir = await mkdtemp(path.join(tmpdir(), "getty-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("Getty web local bridge", () => {
  it("selects only complete EPS/JPG pairs from a flat staged batch", async () => {
    const dir = await folder();
    await writeFile(path.join(dir, "one.eps"), "eps");
    await writeFile(path.join(dir, "one.jpg"), "jpg");
    await writeFile(path.join(dir, "getty_esp_metadata.csv"), "metadata");
    const result = await inspectGettyBatch(dir);
    expect(result.files.map((f) => f.name)).toEqual(["one.eps", "one.jpg"]);
    expect(result.totalBytes).toBe(6);
  });

  it("refuses missing partners, case collisions, empty files, and symlinks", async () => {
    const dir = await folder();
    await writeFile(path.join(dir, "one.eps"), "eps");
    await expect(inspectGettyBatch(dir)).rejects.toThrow(/pair/i);
    await writeFile(path.join(dir, "one.jpg"), "");
    await expect(inspectGettyBatch(dir)).rejects.toThrow(/empty/i);
    await writeFile(path.join(dir, "one.jpg"), "jpg");
    await writeFile(path.join(dir, "ONE.jpg"), "jpg");
    await expect(inspectGettyBatch(dir)).rejects.toThrow(/duplicate/i);
    await rm(path.join(dir, "ONE.jpg"));
    await symlink(path.join(dir, "one.jpg"), path.join(dir, "two.jpg"));
    await expect(inspectGettyBatch(dir)).rejects.toThrow(/link/i);
  });

  it("snapshots the confirmed files to a private directory and removes them afterwards", async () => {
    const dir = await folder();
    await writeFile(path.join(dir, "one.eps"), "eps");
    await writeFile(path.join(dir, "one.jpg"), "jpg");
    const inspected = await inspectGettyBatch(dir);
    const snapshot = await snapshotGettyBatch(inspected);
    await writeFile(path.join(dir, "one.eps"), "different");
    expect(await readFile(snapshot.files[0], "utf8")).toBe("eps");
    await snapshot.cleanup();
    await expect(readFile(snapshot.files[0])).rejects.toThrow();
  });

  it("creates only the confirmed illustration batch using observed controls", async () => {
    const events: string[] = [];
    const page = fakePage(events);
    await createGettyBatch(page as unknown as Page, "Test batch");
    expect(events).toEqual([
      "click:[data-cy=create-batch-button]", "check-type", "fill:Test batch", "click:[data-cy=create-batch-confirm-button]", "wait-batch",
    ]);
  });

  it("does not create a batch if the portal selects a different submission type", async () => {
    const events: string[] = [];
    const page = fakePage(events);
    page.submissionType = "istock_creative_still";
    await expect(createGettyBatch(page as unknown as Page, "Test batch")).rejects.toThrow(/illustration/i);
    expect(events).not.toContain("click:[data-cy=create-batch-confirm-button]");
  });

  it("refuses a changed file before creating a temporary snapshot", async () => {
    const dir = await folder();
    await writeFile(path.join(dir, "one.eps"), "eps");
    await writeFile(path.join(dir, "one.jpg"), "jpg");
    const inspected = await inspectGettyBatch(dir);
    await writeFile(path.join(dir, "one.eps"), "changed");
    await expect(snapshotGettyBatch(inspected)).rejects.toThrow(/changed/i);
  });

  it("never selects files outside a verified Getty batch or when the input is ambiguous", async () => {
    const events: string[] = [];
    const page = fakePage(events);
    page.url = () => "https://other.invalid/contribute/batches/123";
    await expect(injectGettyFiles(page as unknown as Page, ["a.eps", "a.jpg"], "123")).rejects.toThrow(/batch page/i);
    page.url = () => "https://esp.gettyimages.com/contribute/batches/123";
    page.count = 2;
    await expect(injectGettyFiles(page as unknown as Page, ["a.eps", "a.jpg"], "123")).rejects.toThrow(/file input/i);
    page.count = 1;
    page.url = () => "https://esp.gettyimages.com/contribute/batches/456";
    await expect(injectGettyFiles(page as unknown as Page, ["a.eps", "a.jpg"], "123")).rejects.toThrow(/batch page/i);
    page.url = () => "https://esp.gettyimages.com/contribute/batches/123";
    page.accept = ".csv";
    await expect(injectGettyFiles(page as unknown as Page, ["a.eps", "a.jpg"], "123")).rejects.toThrow(/file input/i);
    page.accept = ".eps,.jpg,.jpeg";
    await injectGettyFiles(page as unknown as Page, ["a.eps", "a.jpg"], "123");
    expect(events).toContain("files:a.eps,a.jpg");
  });
});

function fakePage(events: string[]) {
  const page = {
    url: () => "https://esp.gettyimages.com/contribute/batches",
    count: 1,
    accept: ".eps,.jpg",
    submissionType: "istock_creative_illustration",
    locator(selector: string) {
      return {
        click: async () => { events.push(`click:${selector}`); },
        fill: async (text: string) => { events.push(`fill:${text}`); },
        inputValue: async () => { events.push("check-type"); return page.submissionType; },
        count: async () => page.count,
        getAttribute: async () => page.accept,
        setInputFiles: async (files: string[]) => { events.push(`files:${files.join(",")}`); },
        waitFor: async () => undefined,
      };
    },
    waitForURL: async () => { events.push("wait-batch"); },
  };
  return page;
}
