// svg_confirm.test.tsx — the confirmation that precedes every send, driven
// through the REAL panel, the REAL runner and a fake transport (RULE 8).
// Part 1 (written before the dialog moved to svg/confirm/, P0) pins what the
// dialog does today: the ordered manifest, Cancel/Close, one post per request,
// one run per confirmation, and the contact-sheet preview. Part 2 (P3) adds the
// full-prompt preview and the preview == payload equality.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppStore } from "../src/state/appstore";
import { saveApiKey } from "../src/svg/keystore";
import { FakeDir } from "./helpers/fakefs";
import { KEY, block, okReply, stemOf, stubCanvas, stubFetchSeq } from "./helpers/svgrun";
import { approvedRoot, click, mountSvg, openConfirm, settle, until, type SvgMount } from "./helpers/svgmount";
import { stored } from "./helpers/svgstore";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  const { stored: map } = await import("./helpers/svgstore");
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { map.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => map.get(name) ?? null),
  };
});

vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...actual,
    loadImageFile: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  };
});

const FIVE = ["alder", "birch", "cedar", "dune", "elm"];
let m: SvgMount | null = null;

beforeEach(async () => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  stubCanvas();
  await saveApiKey(KEY);
});

afterEach(async () => {
  await m?.unmount();
  m = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const q = (sel: string) => m?.q(sel) ?? null;
const text = (sel: string) => q(sel)?.textContent ?? "";

async function open(names: readonly string[] = FIVE): Promise<FakeDir> {
  const root = approvedRoot(names);
  m = await mountSvg(root);
  await openConfirm(m);
  return root;
}

/** What the provider was sent as text, per post. */
const sentText = (body: string): string => JSON.parse(body).messages[0].content[0].text as string;

describe("the confirmation dialog today", () => {
  it("lists every request's positions, batch-local and in scan order", async () => {
    await open();
    expect(text("[data-testid=svg-confirm-count]")).toBe("5");
    expect(text("[data-testid=svg-confirm-requests]")).toBe("2 × 4 max");
    const manifest = text("[data-testid=svg-manifest]");
    expect(manifest).toContain("batch_1_4");
    expect(manifest).toContain("2×2 grid");
    FIVE.slice(0, 4).forEach((n, i) => expect(manifest).toContain(`${i + 1} — ${stemOf(n)}`));
    expect(manifest).toContain("batch_2_1");
    expect(manifest).toContain("1×1 grid");
    expect(manifest).toContain(`1 — ${stemOf("elm")}`);
  });

  it("Cancel and Close dismiss it without sending anything", async () => {
    const calls = stubFetchSeq([okReply("x")]);
    await open();
    await click(m!, "[data-testid=svg-confirm-cancel]");
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    await click(m!, "[data-testid=svg-generate-selected]");
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    await click(m!, "[data-testid=svg-confirm-close]");
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("Generate now closes it and posts exactly once per request", async () => {
    const calls = stubFetchSeq([
      okReply(FIVE.slice(0, 4).map((n) => block(stemOf(n))).join("\n")),
      okReply(block(stemOf("elm"))),
    ]);
    await open();
    await click(m!, "[data-testid=svg-confirm-generate]");
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    await until(() => calls.length === 2 && q("[data-testid=svg-status-running]") === null);
    expect(calls).toHaveLength(2);
    expect(sentText(calls[0].body)).toContain(`1 — ${stemOf("alder")}`);
    expect(sentText(calls[1].body)).toContain(`Icon name (use it as the SVG <title>): ${stemOf("elm")}`);
  });

  it("is one run per confirmation: the tab locks Generate while the request is in flight", async () => {
    let release: (r: Response) => void = () => undefined;
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return Promise.reject(new TypeError("offline"));
      posts.push(String(init.body));
      return new Promise<Response>((resolve) => { release = resolve; });
    }));
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => posts.length === 1);
    expect(q("[data-testid=svg-confirm]")).toBeNull();
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-testid=svg-status-running]")).not.toBeNull();
    release(okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch"))));
    await until(() => q("[data-testid=svg-status-running]") === null);
    expect(posts).toHaveLength(1);
    expect((q("[data-testid=svg-generate-selected]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("builds the first request's contact sheet on demand and shows grid, empty cells and hash", async () => {
    await open(["alder", "birch", "cedar"]);
    expect(q("[data-testid=svg-composite-img]")).toBeNull();
    await click(m!, "[data-testid=svg-composite-build]");
    expect(q("[data-testid=svg-composite-img]")).not.toBeNull();
    expect(text("[data-testid=svg-composite-meta]")).toMatch(/2×2 grid · \d+px · 1 empty cell\(s\) · hash [0-9a-f]{8}/);
  });

  it("says why the contact sheet could not be built instead of showing nothing", async () => {
    const root = await open(["alder", "birch"]);
    (root.children.get("architecture") as FakeDir).children.delete(`${stemOf("alder")}.png`);
    await click(m!, "[data-testid=svg-composite-build]");
    await settle();
    expect(text("[data-testid=svg-composite-error]")).toContain("source image gone");
    expect(q("[data-testid=svg-composite-img]")).toBeNull();
  });
});
