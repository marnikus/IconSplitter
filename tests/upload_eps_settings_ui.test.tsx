// RULE 8 — the EPS converter drop list: two catalog options, disabled while
// EPS is off, live override in icon scope, probe state from the injected host.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadSettingsDialog from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { EPS_CONVERTERS } from "../src/lib/upload/epsconvert/catalog";
import { unavailableHost } from "../src/lib/upload/epsconvert/host";
import type { CliHost } from "../src/lib/upload/epsconvert/types";
import type { UploadSettingsDialogProps } from "../src/upload/settingsfield";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  if (ui !== null) await act(async () => { ui?.unmount(); });
  ui = null;
  host.remove();
});

async function mount(over: Partial<UploadSettingsDialogProps> = {}): Promise<UploadSettingsDialogProps> {
  const p: UploadSettingsDialogProps = {
    scope: "fog_AI.svg",
    id: "pair_fog",
    defaults: DEFAULT_UPLOAD_SETTINGS,
    overrides: {},
    onDefaults: vi.fn(),
    onOverride: vi.fn(),
    onResetOverride: vi.fn(),
    onClose: vi.fn(),
    cli: unavailableHost,
    ...over,
  };
  await act(async () => { ui = createRoot(host); ui.render(<UploadSettingsDialog {...p} />); });
  return p;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const select = () => q("[data-testid=upload-set-eps-converter]") as HTMLSelectElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe("EPS converter drop list", () => {
  it("lists the catalog labels and is disabled while EPS is off (state idle)", async () => {
    await mount();
    expect(select()).not.toBeNull();
    expect(select().disabled).toBe(true);
    expect([...select().options].map((o) => o.text)).toEqual(EPS_CONVERTERS.map((c) => c.label));
    expect(q("[data-testid=upload-set-eps-converter-state]")?.textContent).toBe("idle");
    expect(q("[data-testid=upload-set-marker-eps-converter]")?.textContent).toBe("inherited");
  });

  it("enabling EPS enables the select; choosing inkscape pins the override", async () => {
    const p = await mount();
    await act(async () => {
      (q("[data-testid=upload-set-eps]") as HTMLInputElement).click();
    });
    expect(p.onOverride).toHaveBeenCalledWith("pair_fog", expect.objectContaining({ includeEps: true }));
    await act(async () => { ui?.render(<UploadSettingsDialog {...p} overrides={{ includeEps: true }} />); });
    expect(select().disabled).toBe(false);
    await act(async () => {
      select().value = "inkscape";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(p.onOverride).toHaveBeenCalledWith("pair_fog", expect.objectContaining({ epsConverter: "inkscape" }));
  });

  it("icon-scope marker is overridden when the converter is pinned", async () => {
    await mount({ overrides: { includeEps: true, epsConverter: "inkscape" } });
    expect(q("[data-testid=upload-set-marker-eps-converter]")?.textContent).toBe("overridden");
    expect(select().value).toBe("inkscape");
  });

  it("a ready host shows the Inkscape version on the state line", async () => {
    const cli: CliHost = {
      probe: async () => ({ ok: true, reason: "ready", version: "Inkscape 1.3.2" }),
      runInkscape: async () => ({ ok: false, reason: "unused" }),
    };
    await mount({ overrides: { includeEps: true, epsConverter: "inkscape" }, cli });
    await settle();
    expect(q("[data-testid=upload-set-eps-converter-state]")?.textContent).toBe("ready · Inkscape 1.3.2");
  });
});
