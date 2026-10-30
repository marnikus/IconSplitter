// The Getty web preset's UI: contributor e-mail/password labels (no API key
// fields), the contributor-page endpoint, and the protocol option.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STOCK_STATE, GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";
import StockFtpCredentials from "../src/stockupload/StockFtpCredentials";
import StockFtpPanel from "../src/stockupload/StockFtpPanel";
import type { FtpTestStatus, StockFtpActions } from "../src/stockupload/ftpactions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const IDLE: FtpTestStatus = { busy: false, ok: null, note: "", certSha256: null };

function stubActions(): StockFtpActions {
  return {
    saveCreds: vi.fn(async () => true),
    forgetCreds: vi.fn(async () => undefined),
    testConnection: vi.fn(async () => undefined),
    authorizeEspOAuth: vi.fn(async () => undefined),
    trustPinnedCert: vi.fn(),
    updatePreset: vi.fn(),
  } as unknown as StockFtpActions;
}

function setInput(el: HTMLInputElement, value: string): Promise<void> {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Getty web upload preset UI", () => {
  it("asks for the contributor e-mail/password, not an ESP API key", async () => {
    const actions = stubActions();
    await act(async () => {
      root.render(<StockFtpCredentials active={GETTY_WEB_PRESET} saved testStatus={IDLE} actions={actions} />);
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Getty contributor e-mail or account ID");
    expect(text).toContain("Getty contributor password");
    expect(text).toContain("esp.gettyimages.com/contribute");
    expect(text).toContain("never expanded");
    expect(q("stock-ftp-apikey")).toBeNull();
    expect(q("stock-ftp-apisecret")).toBeNull();
    expect(q("stock-esp-oauth")).toBeNull();
    expect(q("stock-ftp-cred-save")).not.toBeNull();
  });

  it("saves entered contributor credentials locally under the preset id", async () => {
    const actions = stubActions();
    await act(async () => {
      root.render(<StockFtpCredentials active={GETTY_WEB_PRESET} saved={false} testStatus={IDLE} actions={actions} />);
    });
    expect((q("stock-ftp-cred-status")?.textContent ?? "")).toContain("No local credentials");
    expect((q("stock-ftp-cred-save") as HTMLButtonElement).disabled).toBe(true);
    await setInput(q("stock-ftp-user") as HTMLInputElement, "contributor@example.com");
    await setInput(q("stock-ftp-pass") as HTMLInputElement, "GettyPass!42");
    const save = q("stock-ftp-cred-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await act(async () => { save.click(); });
    expect(actions.saveCreds).toHaveBeenCalledWith(GETTY_WEB_PRESET.id, "contributor@example.com", "GettyPass!42", { apiKey: "", apiSecret: "" });
  });

  it("offers the browser-automation protocol and shows the contributor page as its endpoint", async () => {
    await act(async () => {
      root.render(
        <StockFtpPanel presetState={{ ...DEFAULT_STOCK_STATE, activePresetId: GETTY_WEB_PRESET.id }}
          ftpOpen bridgeUrl="http://127.0.0.1:47391" credSaved={{}} testStatus={IDLE}
          actions={stubActions()} onToggleOpen={vi.fn()} onBridgeUrl={vi.fn()} />,
      );
    });
    const protocol = q("stock-ftp-protocol") as HTMLSelectElement;
    expect(Array.from(protocol.options).map((o) => o.value)).toContain("getty-web");
    expect(protocol.value).toBe("getty-web");
    expect(host.textContent).toContain("Getty Images web upload (background browser)");
    expect(host.textContent).toContain("https://esp.gettyimages.com/contribute");
    expect((q("stock-ftp-remotedir") as HTMLInputElement).value).toBe("/contribute");
    expect(q("stock-ftp-quick-getty-images-web")?.textContent).toContain("Getty Images (web upload)");
  });
});
