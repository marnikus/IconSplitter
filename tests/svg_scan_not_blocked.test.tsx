// svg_scan_not_blocked.test.tsx — the scan never waits for the folder's full
// path (2026-11-26): the local helper's search can take many seconds (or hang),
// and the restored folder used to sit at "0 sources" until it answered.
import { afterEach, describe, expect, it } from "vitest";
import { setRootResolver } from "../src/lib/knownroots";
import { installSvgPanelHooks, FOG, makeRoot, mount, q, settle } from "./helpers/svgpanel";

installSvgPanelHooks();
afterEach(() => setRootResolver(null));

describe("Generate SVG — a slow full-path lookup", () => {
  it("lists the restored folder's rows while the helper is still searching", async () => {
    setRootResolver(() => new Promise<string | null>(() => undefined)); // never answers
    await mount(await makeRoot());
    await settle(); await settle();
    expect(q(`[data-testid=svg-check-${FOG}]`)).not.toBeNull();
  });
});
