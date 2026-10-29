import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots } from "../src/lib/knownroots";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { MANDATORY_TAGS } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { getAppState, resetAppStore } from "../src/state/appstore";
import StockUploadPanel from "../src/stockupload/StockUploadPanel";
import { resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { resetFtpCredentialsForTests } from "../src/stockupload/keystore";
import { resetStockPresets } from "../src/stockupload/presetstore";
import HistoryBar from "../src/ui/HistoryBar";
import { getRowBadgeState, resetRowBadges } from "../src/upload/rowbadgestore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function clickEl(el: HTMLElement): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  return act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setSelect(el: HTMLSelectElement, value: string): Promise<void> {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function makeWorkspace(): FakeDir {
  const root = new FakeDir("stock_ws");
  const packA = new FakeDir("icons_a");
  const expA = new FakeDir("export");
  packA.children.set("export", expA);
  root.children.set("icons_a", packA);

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>';
  const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EndComments\n0 0 moveto 10 10 lineto stroke\n%%EOF\n";

  const rec = newExportRecord({
    pair: { id: "item-star", base: "star_icon", suffix: "", dir: "icons_a" },
    source: { svgPath: "icons_a/star_icon_AI.svg", version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: true,
    now: "2026-10-27T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  rec.outputs = {
    svg: { path: "icons_a/export/star_icon.svg", bytes: svg.length, hash: "sha256:s" },
    jpg: null,
    eps: { path: "icons_a/export/star_icon.eps", bytes: eps.length, hash: "sha256:e" },
  };
  const json = serializeExportRecord(rec);
  expA.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  expA.children.set("star_icon.svg", new FakeFile("star_icon.svg", svg.length, 1000, svg));
  expA.children.set("star_icon.eps", new FakeFile("star_icon.eps", eps.length, 1000, eps));
  // Unrecorded stray file in export/ -> MUST NOT create a second row
  expA.children.set("orphan.svg", new FakeFile("orphan.svg", svg.length, 1000, svg));

  return root;
}

describe("Upload (stockUpload) tab UI", () => {
  beforeEach(async () => {
    localStorage.clear();
    stored.clear();
    clearKnownRoots();
    resetAppStore();
    resetRowBadges();
    resetStockPresets();
    resetStockHistory();
    resetUploadJournal();
    await resetFtpCredentialsForTests();
    vi.stubGlobal("showDirectoryPicker", () => Promise.reject(new Error("picker not needed")));
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
  });

  afterEach(() => {
    act(() => ui.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("offers an opt-in combined title and discloses it before upload", async () => {
    stored.set("__stock_upload__", { source: makeWorkspace() });
    act(() => { ui.render(<HistoryProvider><StockUploadPanel active /></HistoryProvider>); });
    await waitUntil(() => q("stock-row-item-star") !== null, "row loaded");
    const checkbox = q("stock-combine-title-description") as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
    await clickEl(checkbox);
    expect(checkbox.checked).toBe(true);
    await clickEl(q("stock-check-item-star")!);
    await clickEl(q("stock-upload-start")!);
    expect(q("stock-upload-confirm-dialog")?.textContent).toContain("Title + description");
  });

  it("discovers only export/+export.json items, manages badges & zoom, saves local-only credentials without expanding, edits metadata, and uploads selected formats", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });

    const uploadedConfigs: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, ftps: { ready: true }, sftp: { ready: true } }), { status: 200 });
      }
      if (u.endsWith("/ftps/upload")) {
        const hdr = (init?.headers as Record<string, string>)?.["x-ftps-config"] ?? "";
        uploadedConfigs.push(hdr);
        return new Response(JSON.stringify({ ok: true, bytes: 42 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    act(() => {
      ui.render(
        <HistoryProvider>
          <HistoryBar />
          <StockUploadPanel active />
        </HistoryProvider>,
      );
    });

    await waitUntil(() => q("stock-row-item-star") !== null, "exported row loaded");
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(1);
    expect(q("stock-folder-path")).not.toBeNull();
    expect(q("stock-location-item-star")).not.toBeNull();

    // Shutterstock preset is selected by default
    const presetSelect = q("stock-ftp-preset-select") as HTMLSelectElement;
    expect(presetSelect.value).toBe("shutterstock");
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("ftps.shutterstock.com");

    // Save local-only credentials — inputs clear immediately and secret never appears in DOM or localStorage
    await setInput(q("stock-ftp-user") as HTMLInputElement, "my_shutter_login");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "SuperSecret#999");
    await clickEl(q("stock-ftp-cred-save")!);
    await waitUntil(() => q("stock-ftp-cred-status")?.textContent?.includes("Saved locally") === true, "creds saved");
    expect((q("stock-ftp-user") as HTMLInputElement).value).toBe("");
    expect((q("stock-ftp-pass") as HTMLInputElement).value).toBe("");
    expect(host.innerHTML).not.toContain("SuperSecret#999");
    expect(host.innerHTML).not.toContain("my_shutter_login");
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain("SuperSecret#999");
    }

    // Zoom slider updates row preview size
    await setInput(q("stock-upload-zoom") as HTMLInputElement, "180");
    await settle();
    expect(q("stock-upload-panel")?.getAttribute("style")).toContain("180px");

    // Check row & undo/redo via stockUploadChecked
    await clickEl(q("stock-check-item-star")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual(["item-star"]);
    await clickEl(q("hist-undo")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual([]);
    await clickEl(q("hist-redo")!);
    await settle();
    expect(getAppState().stockUpload.checked).toEqual(["item-star"]);

    // Add a badge and apply to selected row — synced into shared rowbadgestore
    await clickEl(q("stock-rowbadges-open")!);
    await settle();
    await setInput(q("upload-rowbadge-new-name") as HTMLInputElement, "Ready");
    await clickEl(q("upload-rowbadge-add")!);
    await clickEl(q("upload-rowbadge-close")!);
    await settle();
    const badgeId = getRowBadgeState().catalog.find((b) => b.name === "Ready")!.id;
    await clickEl(q("upload-rowbadge-apply")!);
    await settle();
    await clickEl(q(`upload-rowbadge-apply-${badgeId}`)!);
    await settle();
    expect(getRowBadgeState().assigned["item-star"]).toEqual([badgeId]);

    // Click row to expand editable metadata (no AI buttons), edit & accept -> re-embeds into SVG & EPS
    await clickEl(q("stock-row-item-star")!);
    await settle();
    expect(q("stock-meta-fields-item-star")).not.toBeNull();
    await setInput(q("stock-meta-title-item-star") as HTMLInputElement, "Minimal line icon showing bright star shine");
    await setInput(q("stock-meta-description-item-star") as HTMLTextAreaElement, "Clean minimalist vector line icon showing bright shining star symbol");
    await setInput(q("stock-meta-tags-item-star") as HTMLTextAreaElement, [...MANDATORY_TAGS, "star", "shine", "astronomy", "sparkle"].join(", "));
    await clickEl(q("stock-meta-accept-item-star")!);
    await waitUntil(() => q("stock-meta-state-item-star")?.textContent?.includes("accepted") === true, "metadata accepted");

    // Choose formats: SVG + EPS + ZIP (raster off since test fixture has SVG+EPS)
    await clickEl(q("stock-format-raster")!); // uncheck default raster
    await clickEl(q("stock-format-svg")!);    // check svg
    await clickEl(q("stock-format-zip")!);    // check zip (eps is already checked by default)
    await settle();

    // Click Upload -> Confirm upload -> sends 3 files (svg, eps, zip) sharing stem star_icon
    await clickEl(q("stock-upload-start")!);
    await settle();
    expect(q("stock-upload-confirm-dialog")).not.toBeNull();
    await clickEl(q("stock-upload-confirm-go")!);
    await waitUntil(() => uploadedConfigs.length === 3, "3 files uploaded");

    const sentFiles = uploadedConfigs.map((b64) => JSON.parse(atob(b64)).fileName as string);
    expect(sentFiles).toEqual(["star_icon.svg", "star_icon.eps", "star_icon.zip"]);
    expect(getRowBadgeState().assigned["item-star"]).toEqual([badgeId, "shutterstock"]);
  });

  it("supports Adobe Stock SFTP (:22) with SFTP Member ID / generated password fields, reset defaults, and standalone vector upload", async () => {
    const ws = makeWorkspace();
    stored.set("__stock_upload__", { source: ws });

    let testAttempts = 0;
    const uploadedPayloads: Array<{ host: string; port: number; protocol: string; fileName: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, ftps: { ready: true }, sftp: { ready: true } }), { status: 200 });
      }
      if (u.endsWith("/ftps/test")) {
        testAttempts += 1;
        const body = JSON.parse(String(init?.body ?? "{}"));
        const fakeKey = "ab".repeat(32);
        if (body.tlsPolicy !== "pinned" || body.pinnedCertSha256 !== fakeKey) {
          return new Response(JSON.stringify({
            ok: false, code: "cert", reason: `Untrusted SSH host key (SHA-256: ${fakeKey})`, serverCertSha256: fakeKey,
          }), { status: 495 });
        }
        return new Response(JSON.stringify({ ok: true, serverCertSha256: fakeKey }), { status: 200 });
      }
      if (u.endsWith("/ftps/upload")) {
        const hdr = (init?.headers as Record<string, string>)?.["x-ftps-config"] ?? "";
        uploadedPayloads.push(JSON.parse(atob(hdr)));
        return new Response(JSON.stringify({ ok: true, bytes: 42 }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    act(() => {
      ui.render(
        <HistoryProvider>
          <StockUploadPanel active />
        </HistoryProvider>,
      );
    });

    await waitUntil(() => q("stock-row-item-star") !== null, "exported row loaded");

    // Shutterstock, Adobe Stock, and Getty Images appear in the drop list AND quick-switch header buttons
    const presetSelect = q("stock-ftp-preset-select") as HTMLSelectElement;
    const optionLabels = Array.from(presetSelect.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Shutterstock", "Adobe Stock", "Getty Images", "Getty Images (web upload)"]);
    expect(q("stock-ftp-quick-shutterstock")?.textContent).toContain("Shutterstock");
    expect(q("stock-ftp-quick-adobe-stock")?.textContent).toContain("Adobe Stock");
    expect(q("stock-ftp-quick-getty-images")?.textContent).toContain("Getty Images");

    // Hardcoded stock badges live in the ONE general badge system; no Stock sites column or pending pills!
    const initialCatalog = getRowBadgeState().catalog;
    const shutterBadge = initialCatalog.find((b) => b.id === "shutterstock");
    const adobeBadge = initialCatalog.find((b) => b.id === "adobe-stock");
    const gettyBadge = initialCatalog.find((b) => b.id === "getty-images");
    expect(shutterBadge?.name).toBe("Shutterstock");
    expect(adobeBadge?.name).toBe("Adobe Stock");
    expect(gettyBadge?.name).toBe("Getty Images");
    expect(shutterBadge?.color).not.toBe(adobeBadge?.color);
    expect(adobeBadge?.color).not.toBe(gettyBadge?.color);
    expect(host.querySelector(".stock-up-columns")?.textContent).not.toContain("Stock sites");
    expect(host.querySelector("[data-testid^='stock-site-pill-']")).toBeNull();
    expect(q("stock-filter-status")).toBeNull();

    // Adding a custom stock preset immediately adds its badge to the same general catalog
    await setInput(q("stock-ftp-new-name") as HTMLInputElement, "Dreamstime");
    await clickEl(q("stock-ftp-add")!);
    await settle();
    expect(getRowBadgeState().catalog.some((b) => b.name === "Dreamstime")).toBe(true);
    await clickEl(q("stock-target-check-stock-5")!);

    // Switch stock dropdown to Adobe Stock
    await setSelect(q("stock-ftp-preset-select") as HTMLSelectElement, "adobe-stock");
    await settle();
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("sftp.contributor.adobestock.com");
    expect((q("stock-ftp-port") as HTMLInputElement).value).toBe("22");
    expect((q("stock-ftp-protocol") as HTMLSelectElement).value).toBe("sftp");
    expect(q("stock-ftp-cred-box")?.textContent).toContain("SFTP Member ID");
    expect(q("stock-ftp-cred-box")?.textContent).toContain("Generated SFTP password");

    // Edit host and verify built-in Reset restores Adobe Stock defaults
    await setInput(q("stock-ftp-host") as HTMLInputElement, "custom.example.com");
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("custom.example.com");
    await clickEl(q("stock-ftp-reset-builtin")!);
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("sftp.contributor.adobestock.com");

    // Save local-only Adobe Stock SFTP credentials without expanding them
    await setInput(q("stock-ftp-user") as HTMLInputElement, "210333617");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "AdobeGenSecret#42");
    await clickEl(q("stock-ftp-cred-save")!);
    await waitUntil(() => q("stock-ftp-cred-status")?.textContent?.includes("Saved locally") === true, "adobe creds saved");
    expect(host.innerHTML).not.toContain("210333617");
    expect(host.innerHTML).not.toContain("AdobeGenSecret#42");

    // Test connection -> prompts unknown SSH host key -> clicking Trust & pin auto-reconnects immediately (like FileZilla!)
    await clickEl(q("stock-ftp-test")!);
    await waitUntil(() => q("stock-ftp-trust-cert") !== null, "host key trust button shown");
    await clickEl(q("stock-ftp-trust-cert")!);
    await waitUntil(
      () => q("stock-ftp-test-note")?.textContent?.includes("Connected & authenticated via SFTP") === true,
      "auto-reconnected after trusting host key",
    );
    expect(testAttempts).toBe(2);
    expect(q("stock-toast")?.textContent).toContain("Connected & authenticated via SFTP");

    // Target Adobe Stock only (uncheck Shutterstock, check Adobe Stock) and upload SVG + EPS
    await clickEl(q("stock-target-check-shutterstock")!);
    await clickEl(q("stock-target-check-adobe-stock")!);
    await clickEl(q("stock-format-raster")!);
    await clickEl(q("stock-format-svg")!);
    await clickEl(q("stock-check-item-star")!);
    await settle();

    await clickEl(q("stock-upload-start")!);
    await settle();
    await clickEl(q("stock-upload-confirm-go")!);
    await waitUntil(() => uploadedPayloads.length === 2, "2 Adobe Stock vector files uploaded");

    expect(uploadedPayloads.map((p) => ({ host: p.host, port: p.port, protocol: p.protocol, fileName: p.fileName }))).toEqual([
      { host: "sftp.contributor.adobestock.com", port: 22, protocol: "sftp", fileName: "star_icon.svg" },
      { host: "sftp.contributor.adobestock.com", port: 22, protocol: "sftp", fileName: "star_icon.eps" },
    ]);

    // Adobe Stock's general badge is auto-assigned on the row; filter using the ONE general Badge filter!
    await settle();
    expect(q("upload-rowbadge-chip-item-star-adobe-stock")?.textContent).toBe("Adobe Stock");
    expect(q("upload-rowbadge-chip-item-star-shutterstock")).toBeNull();
    expect(host.querySelector("[data-testid^='stock-site-pill-']")).toBeNull();

    await setSelect(q("stock-filter-badge") as HTMLSelectElement, "adobe-stock");
    await settle();
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(1);
    await setSelect(q("stock-filter-badge") as HTMLSelectElement, "shutterstock");
    await settle();
    expect(host.querySelectorAll("[data-testid='stock-rows'] [role='listitem']")).toHaveLength(0);
  });
});
