import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearKnownRoots } from "../src/lib/knownroots";
import { metadataBlock, newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { metadataFingerprint, validateMetadata } from "../src/lib/upload/meta";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { resetAppStore } from "../src/state/appstore";
import StockUploadPanel from "../src/stockupload/StockUploadPanel";
import { resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { resetFtpCredentialsForTests } from "../src/stockupload/keystore";
import { resetStockPresets } from "../src/stockupload/presetstore";
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

function makePairedGettyWorkspace(): FakeDir {
  const root = new FakeDir("getty_ws");
  const pack = new FakeDir("icons_g");
  const exp = new FakeDir("export");
  pack.children.set("export", exp);
  root.children.set("icons_g", pack);

  const jpg = "FAKE_RGB_JPEG_PREVIEW_BYTES";
  const eps = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EOF\n";

  const rec = newExportRecord({
    pair: { id: "item-compass", base: "compass_icon", suffix: "", dir: "icons_g" },
    source: { svgPath: "icons_g/compass_icon_AI.svg", version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: true,
    now: "2026-10-29T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-29T10:02:00.000Z";
  const meta = {
    title: "Minimal Compass Navigation Vector Icon",
    description: "Clean minimalist compass symbol on plain light background",
    tags: ["icon", "vector", "compass", "navigation", "direction", "travel", "map"],
  };
  rec.metadata = metadataBlock(meta, {
    prompt: "",
    provider: "manual",
    model: "manual",
    requestId: null,
    usage: { input: null, output: null, total: null },
    fingerprint: metadataFingerprint(meta),
    validation: validateMetadata(meta),
  });
  rec.outputs = {
    svg: null,
    jpg: { path: "icons_g/export/compass_icon.jpg", bytes: jpg.length, hash: "sha256:j" },
    eps: { path: "icons_g/export/compass_icon.eps", bytes: eps.length, hash: "sha256:e" },
  };
  const json = serializeExportRecord(rec);
  exp.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  exp.children.set("compass_icon.jpg", new FakeFile("compass_icon.jpg", jpg.length, 1000, jpg));
  exp.children.set("compass_icon.eps", new FakeFile("compass_icon.eps", eps.length, 1000, eps));
  return root;
}

describe("Getty Images / iStock Upload UI (ESP HTTPS + local-only credentials + ESP CSV + unified badge)", () => {
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

  it("switches to Getty Images ESP (:443), saves local-only ESP credentials + API key/secret without expanding, exports ESP CSV, uploads paired EPS+JPG, and assigns the Getty Images badge", async () => {
    stored.set("__stock_upload__", { source: makePairedGettyWorkspace() });

    const uploadedPayloads: Array<{ host: string; port: number; protocol: string; fileName: string; apiKey?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, ftps: { ready: true }, sftp: { ready: true }, esp: { ready: true } }), { status: 200 });
      }
      if (u.endsWith("/ftps/test")) {
        return new Response(JSON.stringify({ ok: true, serverCertSha256: "cd".repeat(32) }), { status: 200 });
      }
      if (u.endsWith("/ftps/upload")) {
        const hdr = (init?.headers as Record<string, string>)?.["x-ftps-config"] ?? "";
        uploadedPayloads.push(JSON.parse(atob(hdr)));
        return new Response(JSON.stringify({ ok: true, bytes: 32 }), { status: 200 });
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

    await waitUntil(() => q("stock-row-item-compass") !== null, "compass row loaded");

    // Quick-switch to Getty Images
    await clickEl(q("stock-ftp-quick-getty-images")!);
    await settle();
    expect((q("stock-ftp-host") as HTMLInputElement).value).toBe("api.gettyimages.com");
    expect((q("stock-ftp-port") as HTMLInputElement).value).toBe("443");
    expect((q("stock-ftp-protocol") as HTMLSelectElement).value).toBe("esp-https");
    expect(q("stock-getty-csv")).not.toBeNull();

    // Save local-only ESP login + password + API Key + API Secret — never expanded or written to localStorage
    await setInput(q("stock-ftp-user") as HTMLInputElement, "getty_artist@example.com");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "GettySecretPass#99");
    await setInput(q("stock-ftp-apikey") as HTMLInputElement, "GettyClientId_ABC");
    await setInput(q("stock-ftp-apisecret") as HTMLInputElement, "GettyClientSecret_XYZ");
    await clickEl(q("stock-ftp-cred-save")!);
    await waitUntil(() => q("stock-ftp-cred-status")?.textContent?.includes("Saved locally") === true, "getty creds saved");

    expect((q("stock-ftp-user") as HTMLInputElement).value).toBe("");
    expect((q("stock-ftp-pass") as HTMLInputElement).value).toBe("");
    expect((q("stock-ftp-apikey") as HTMLInputElement).value).toBe("");
    expect((q("stock-ftp-apisecret") as HTMLInputElement).value).toBe("");
    for (const secret of ["getty_artist@example.com", "GettySecretPass#99", "GettyClientId_ABC", "GettyClientSecret_XYZ"]) {
      expect(host.innerHTML).not.toContain(secret);
      for (let i = 0; i < localStorage.length; i++) {
        expect(localStorage.getItem(localStorage.key(i)!)).not.toContain(secret);
      }
    }

    // Test Getty ESP connection -> banner shows ESP HTTPS success
    await clickEl(q("stock-ftp-test")!);
    await waitUntil(
      () => q("stock-ftp-test-note")?.textContent?.includes("Getty ESP") === true,
      "Getty ESP test banner shown",
    );

    // Export Getty ESP CSV via the one-click Download ESP CSV button
    const createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:getty-csv");
    const revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    await clickEl(q("stock-getty-csv")!);
    await settle();
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledWith("blob:getty-csv");
    expect(q("stock-toast")?.textContent).toContain("Exported Getty ESP CSV for 1 item(s)");
    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();

    // Target Getty Images only and upload paired JPG + EPS (default formats: raster=true, eps=true)
    await clickEl(q("stock-target-check-shutterstock")!);
    await clickEl(q("stock-target-check-getty-images")!);
    await clickEl(q("stock-check-item-compass")!);
    await settle();

    await clickEl(q("stock-upload-start")!);
    await settle();
    expect(q("stock-upload-confirm-dialog")?.textContent).not.toContain("⚠");
    await clickEl(q("stock-upload-confirm-go")!);
    await waitUntil(() => uploadedPayloads.length === 2, "paired JPG + EPS uploaded to Getty ESP");

    expect(uploadedPayloads.map((p) => ({
      host: p.host, port: p.port, protocol: p.protocol, fileName: p.fileName, apiKey: p.apiKey,
    }))).toEqual([
      { host: "api.gettyimages.com", port: 443, protocol: "esp-https", fileName: "compass_icon.jpg", apiKey: "GettyClientId_ABC" },
      { host: "api.gettyimages.com", port: 443, protocol: "esp-https", fileName: "compass_icon.eps", apiKey: "GettyClientId_ABC" },
    ]);

    // Unified general Getty Images badge is automatically assigned on the row!
    await settle();
    expect(q("upload-rowbadge-chip-item-compass-getty-images")?.textContent).toBe("Getty Images");
    expect(getRowBadgeState().assigned["item-compass"]).toEqual(["getty-images"]);
  });
});
