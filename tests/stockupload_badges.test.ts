import { describe, expect, it } from "vitest";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { EMPTY_ROW_BADGES, addBadge, badgesOf } from "../src/lib/upload/rowbadge";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { ADOBE_STOCK_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import {
  assignStockBadgeOnSend,
  ensureStockBadges,
  perStockMarkersOf,
  stockBadgeColorOf,
  stockBadgeIdOf,
} from "../src/lib/stockupload/stockbadges";
import type { StockFtpPreset, StockHistoryMap } from "../src/lib/stockupload/types";
import { ALL_STOCK_FILTER, filterAndSortItems } from "../src/stockupload/rowlist";
import { FakeDir, FakeFile } from "./helpers/fakefs";

const DREAMSTIME: StockFtpPreset = {
  ...SHUTTERSTOCK_PRESET,
  id: "dreamstime",
  name: "Dreamstime",
  template: "custom",
  host: "ftp.dreamstime.com",
};

const FREEPIK: StockFtpPreset = {
  ...SHUTTERSTOCK_PRESET,
  id: "freepik",
  name: "Freepik",
  template: "custom",
  host: "ftp.freepik.com",
};

function makeItemRoot(): FakeDir {
  const root = new FakeDir("ws");
  for (const [id, stem] of [["icon-1", "star_01"], ["icon-2", "moon_02"]] as const) {
    const exportDir = `${id}/export`;
    const rec = newExportRecord({
      pair: { id, base: stem, suffix: "", dir: id },
      source: { svgPath: `${id}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
      settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
      svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
      epsEnabled: false,
      now: "2026-10-28T10:00:00.000Z",
    });
    rec.stage = "committed";
    rec.status = "processed";
    rec.timestamps.committedAt = "2026-10-28T10:01:00.000Z";
    rec.outputs = { svg: { path: `${exportDir}/${stem}.svg`, bytes: 12, hash: "sha256:s" }, jpg: null, eps: null };
    const dir = new FakeDir(id);
    const exp = new FakeDir("export");
    const json = serializeExportRecord(rec);
    exp.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
    exp.children.set(`${stem}.svg`, new FakeFile(`${stem}.svg`, 12, 1000, "<svg/>"));
    dir.children.set("export", exp);
    root.children.set(id, dir);
  }
  return root;
}

describe("per-stock unique badges & pending/uploaded markers", () => {
  it("creates unique badge IDs, stock names, and distinct hex colors for built-in and custom stocks", () => {
    const withUser = addBadge(EMPTY_ROW_BADGES, "Priority", "#745cff")!;
    const synced = ensureStockBadges(withUser, [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET, DREAMSTIME, FREEPIK]);

    expect(synced.catalog.map((b) => ({ id: b.id, name: b.name }))).toEqual([
      { id: "rb1", name: "Priority" },
      { id: stockBadgeIdOf("shutterstock"), name: "Shutterstock" },
      { id: stockBadgeIdOf("adobe-stock"), name: "Adobe Stock" },
      { id: stockBadgeIdOf("dreamstime"), name: "Dreamstime" },
      { id: stockBadgeIdOf("freepik"), name: "Freepik" },
    ]);

    const colors = synced.catalog.map((b) => b.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(stockBadgeColorOf(SHUTTERSTOCK_PRESET)).not.toBe(stockBadgeColorOf(ADOBE_STOCK_PRESET));

    // Idempotent when called again with unchanged presets
    expect(ensureStockBadges(synced, [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET, DREAMSTIME, FREEPIK])).toBe(synced);
  });

  it("assigns a stock's unique badge on send without clobbering existing badges on the file", () => {
    const base = addBadge(EMPTY_ROW_BADGES, "Ready", "#32d68b")!;
    const afterShutter = assignStockBadgeOnSend(base, SHUTTERSTOCK_PRESET, "icon-1");
    expect(badgesOf(afterShutter, "icon-1")).toEqual([stockBadgeIdOf("shutterstock")]);

    const afterAdobe = assignStockBadgeOnSend(afterShutter, ADOBE_STOCK_PRESET, "icon-1");
    expect(badgesOf(afterAdobe, "icon-1")).toEqual([
      stockBadgeIdOf("shutterstock"),
      stockBadgeIdOf("adobe-stock"),
    ]);
  });

  it("computes uploaded vs pending markers per stock and filters pending:<stockId> / uploaded:<stockId>", async () => {
    const found = await discoverExportedItems(makeItemRoot());
    const presets = [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET, DREAMSTIME];
    const badges = assignStockBadgeOnSend(
      ensureStockBadges(EMPTY_ROW_BADGES, presets),
      SHUTTERSTOCK_PRESET,
      "icon-1",
    );
    const history: StockHistoryMap = {
      "icon-1": {
        shutterstock: { status: "uploaded", formats: ["svg"], uploadedAt: "2026-10-28T12:00:00.000Z", error: null },
      },
    };

    const markers1 = perStockMarkersOf("icon-1", presets, history, badges);
    expect(markers1.map((m) => ({ id: m.presetId, name: m.name, state: m.state }))).toEqual([
      { id: "shutterstock", name: "Shutterstock", state: "uploaded" },
      { id: "adobe-stock", name: "Adobe Stock", state: "pending" },
      { id: "dreamstime", name: "Dreamstime", state: "pending" },
    ]);

    const pendingShutter = filterAndSortItems({
      items: found.items,
      filter: { ...ALL_STOCK_FILTER, uploadStatus: "pending:shutterstock" },
      sort: "name",
      rowBadges: badges,
      history,
      checked: [],
    });
    expect(pendingShutter.map((it) => it.id)).toEqual(["icon-2"]);

    const pendingAdobe = filterAndSortItems({
      items: found.items,
      filter: { ...ALL_STOCK_FILTER, uploadStatus: "pending:adobe-stock" },
      sort: "name",
      rowBadges: badges,
      history,
      checked: [],
    });
    expect(pendingAdobe.map((it) => it.id).sort()).toEqual(["icon-1", "icon-2"]);

    const uploadedShutter = filterAndSortItems({
      items: found.items,
      filter: { ...ALL_STOCK_FILTER, uploadStatus: "uploaded:shutterstock" },
      sort: "name",
      rowBadges: badges,
      history,
      checked: [],
    });
    expect(uploadedShutter.map((it) => it.id)).toEqual(["icon-1"]);
  });
});
