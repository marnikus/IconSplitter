// svg_version_chips.test.tsx — one-click SVG version chips under the SVG preview
// (user request 2026-10-19; plan: docs/archive/2026-10-19-svg-version-chips).
// The AI source's chips are the precedent. A chip is a second caller of the
// ONE preferVersion owner the Versions dialog uses, so a click switches the
// preview, the tag and Copy, and persists `preferred` in the pair file. The
// dialog path stays (it is pinned here too).
import { describe, expect, it } from "vitest";
import { parsePairMeta, serializePairMeta, type PairMeta } from "../src/lib/pairmeta";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { discoverUploadSources } from "../src/upload/discovery";
import { svgVersion } from "./helpers/svgpair";
import { FOG, click, installSvgPanelHooks, mount, q, settle, text, unmountPanel } from "./helpers/svgpanel";

installSvgPanelHooks();

const doc = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;
const DOCS = { 1: doc("#c22f2f"), 2: doc("#2f6dc2"), 4: doc("#2fc26d") } as const;

/** fog with valid v1, v2, a failed v3 and a valid v4 — or only v1 when `single`. */
function makeRoot(single = false): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  const versions = [svgVersion("architecture/fog_AI.svg", { version: 1 })];
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", 10, 3200, DOCS[1]));
  if (!single) {
    versions.push(
      svgVersion("architecture/fog_AI_v2.svg", { version: 2 }),
      svgVersion("", { version: 3, status: "failed", valid: false, error: "invalid SVG: unbalanced" }),
      svgVersion("architecture/fog_AI_v4.svg", { version: 4 }),
    );
    arch.children.set("fog_AI_v2.svg", new FakeFile("fog_AI_v2.svg", 10, 3300, DOCS[2]));
    arch.children.set("fog_AI_v4.svg", new FakeFile("fog_AI_v4.svg", 10, 3400, DOCS[4]));
  }
  const sidecar = serializePairMeta(pairFile("architecture", "fog_AI.png", { decision: "approved", versions }));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", sidecar.length, 3200, sidecar));
  root.children.set("architecture", arch);
  const recs = [{ pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

function sidecar(root: FakeDir): PairMeta {
  const file = (root.children.get("architecture") as FakeDir).children.get("fog_AI.svg.json") as FakeFile;
  const parsed = parsePairMeta(file.text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
}

const chip = (n: number) => q(`[data-testid=svg-ver-chip-${FOG}-${n}]`);
const chipIds = () => [...document.querySelectorAll(`[data-testid^='svg-ver-chip-${FOG}-']`)].map((c) => c.getAttribute("data-testid"));
const previewVersion = () => q(`[data-testid=svg-prev-${FOG}]`)?.getAttribute("data-version") ?? "";

async function mountRoot(root: FakeDir): Promise<void> {
  await mount(root);
  await settle(); // pair file → the shown version's document
}

describe("SVG version chips under the SVG preview", () => {
  it("offers one chip per VALID version, the shown (newest) one active; a failed attempt gets none", async () => {
    await mountRoot(makeRoot());
    expect(q(`[data-testid=svg-ver-bar-${FOG}]`)).not.toBeNull();
    expect(chipIds()).toEqual([`svg-ver-chip-${FOG}-1`, `svg-ver-chip-${FOG}-2`, `svg-ver-chip-${FOG}-4`]);
    expect(chip(4)?.getAttribute("data-active")).toBe("true");
    expect(chip(4)?.getAttribute("aria-pressed")).toBe("true");
    expect(chip(4)?.className).toContain("primary");
    expect(chip(1)?.getAttribute("data-active")).toBe("false");
    expect(chip(4)?.textContent).toBe("v4");
  });

  it("one click shows that version: preview, tag and pair file follow; the dialog agrees", async () => {
    const root = makeRoot();
    await mountRoot(root);
    expect(previewVersion()).toBe("4");
    await click(chip(1)!);
    await settle();
    expect(previewVersion()).toBe("1");
    expect(q(`[data-testid=svg-prev-${FOG}]`)?.shadowRoot?.innerHTML).toContain("#c22f2f");
    expect(text(`[data-testid=svg-prev-frame-${FOG}]`)).toContain("SVG v1");
    expect(sidecar(root).preferred).toBe(1);
    expect(sidecar(root).versions.map((v) => v.version)).toEqual([1, 2, 3, 4]); // nothing deleted
    expect(chip(1)?.getAttribute("data-active")).toBe("true");
    expect(chip(4)?.getAttribute("data-active")).toBe("false");
    expect(text("[data-testid=svg-toast]")).toContain("Showing v1");
    // the old path sees the same choice
    await click(q(`[data-testid=svg-history-${FOG}]`)!);
    expect(q("[data-testid=svg-history-v1]")?.className).toContain("shown");
  });

  it("accepts an older version for actual export, persists it across reload, and can accept the shown version", async () => {
    const root = makeRoot();
    await mountRoot(root);
    expect(sidecar(root).review).toBe("pending"); // merely displaying a version approves nothing
    await click(chip(1)!);
    await settle();
    expect(sidecar(root).review).toBe("approved");
    expect(sidecar(root).versions.every((v) => v.review === "approved")).toBe(true);
    const exported = await discoverUploadSources(root);
    expect(exported.rows[0]).toMatchObject({ version: 1, svgPath: "architecture/fog_AI.svg" });
    await unmountPanel();
    await mountRoot(root);
    expect(previewVersion()).toBe("1");
    expect(sidecar(root).review).toBe("approved");
    await click(q(`[data-testid=svg-needs-review-${FOG}]`)!);
    await settle();
    expect(sidecar(root).review).toBe("needs-review");
    await click(chip(1)!); // the already-shown version must also be approvable
    await settle();
    expect(sidecar(root).review).toBe("approved");
    expect((await discoverUploadSources(root)).rows[0].version).toBe(1);
  });

  it("clicking the default shown chip explicitly accepts and pins it", async () => {
    const root = makeRoot();
    await mountRoot(root);
    await click(chip(4)!);
    await settle();
    expect(sidecar(root)).toMatchObject({ preferred: 4, review: "approved" });
  });

  it("refuses a selected SVG whose file disappeared without claiming approval", async () => {
    const root = makeRoot();
    await mountRoot(root);
    (root.children.get("architecture") as FakeDir).children.delete("fog_AI.svg");
    await click(chip(1)!);
    await settle();
    expect(sidecar(root)).toMatchObject({ preferred: null, review: "pending" });
    expect(previewVersion()).toBe("4");
    expect(text("[data-testid=svg-toast]")).toContain("missing or unreadable");
  });

  it("a chip click does not toggle the row's checkbox or steal the click for the row", async () => {
    await mountRoot(makeRoot());
    await click(chip(2)!);
    expect((q(`[data-testid=svg-check-${FOG}]`) as HTMLInputElement).checked).toBe(false);
  });

  it("the Versions dialog's 'Use this version' still works and moves the active chip", async () => {
    const root = makeRoot();
    await mountRoot(root);
    await click(q(`[data-testid=svg-history-${FOG}]`)!);
    await settle();
    await click(q("[data-testid=svg-history-use-2]")!);
    expect(sidecar(root).preferred).toBe(2);
    expect(chip(2)?.getAttribute("data-active")).toBe("true");
  });

  it("a single valid version has nothing to switch to: no chips", async () => {
    await mountRoot(makeRoot(true));
    expect(previewVersion()).toBe("1");
    expect(q(`[data-testid=svg-ver-bar-${FOG}]`)).toBeNull();
    expect(chipIds()).toEqual([]);
  });
});
