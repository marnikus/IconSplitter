// svg_restore_access.test.tsx — Generate SVG after a reload (2026-11-26): the
// browser hands back the remembered folder WITHOUT read access until the user
// clicks (Chrome asks only on a gesture). The tab used to scan anyway, fail
// silently and show "0 sources" + "full path not found". Now it waits, offers
// 🔓 Restore access, and that click asks the browser, then scans.
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { installSvgPanelHooks, FOG, makeRoot, mount, q, settle, text } from "./helpers/svgpanel";

installSvgPanelHooks();

/** A restored handle: readable only once the browser granted it again. */
async function lockedRoot() {
  const root = await makeRoot();
  let state = "prompt";
  const request = vi.fn(async () => { state = "granted"; return state; });
  const entries = root.entries.bind(root);
  Object.assign(root, {
    queryPermission: async () => state,
    requestPermission: request,
    entries: () => { if (state !== "granted") throw new DOMException("not allowed", "NotAllowedError"); return entries(); },
  });
  return { root, request };
}

describe("Generate SVG — the remembered folder after a reload", () => {
  it("offers Restore access instead of a silent empty scan, and the click scans", async () => {
    const { root, request } = await lockedRoot();
    await mount(root);
    await settle();
    expect(text("[data-testid=svg-rescan]")).toContain("Restore access");
    expect(q(`[data-testid=svg-check-${FOG}]`)).toBeNull();
    await act(async () => { (q("[data-testid=svg-rescan]") as HTMLElement).click(); });
    await settle(); await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(q(`[data-testid=svg-check-${FOG}]`)).not.toBeNull();
    expect(text("[data-testid=svg-rescan]")).toContain("Rescan approved");
  });
});
