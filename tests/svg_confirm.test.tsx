// svg_confirm.test.tsx — the confirmation that precedes every send, driven
// through the REAL panel, the REAL runner and a fake transport (RULE 8).
// Part 1 (written before the dialog moved to svg/confirm/, P0) pins what the
// dialog does today: the ordered manifest, Cancel/Close, one post per request,
// one run per confirmation, and the contact-sheet preview. Part 2 (P3) adds the
// full-prompt preview and the preview == payload equality.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { fingerprintOf } from "../src/lib/svgpayload";
import { DEFAULT_SVG_PROMPT } from "../src/lib/svgprompt";
import { IMAGE_SLOT } from "../src/lib/svgpayload";
import { loadImageFile } from "../src/lib/dom";
import { resetAppStore } from "../src/state/appstore";
import { saveApiKey } from "../src/svg/keystore";
import { FakeDir } from "./helpers/fakefs";
import { KEY, block, okReply, stemOf, stubCanvas, stubFetchSeq, stubOffline } from "./helpers/svgrun";
import { approvedRoot, click, mountSvg, openConfirm, settle, typeInto, until, type SvgMount } from "./helpers/svgmount";
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
  stubOffline();
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

// ───────────────────────── Part 2 — the full prompt preview (P3) ─────────────────────────

const ORDER_LINE = "Create one SVG icon for every position. Return the SVGs in the same numeric order, starting from 1. Use the exact same name in the SVG <title>.";
const NINE = ["alder", "birch", "cedar", "dune", "elm", "fern", "gorse", "heath", "iris"];

/** The blocks on screen, in order: a textarea's value, a <pre>'s text. */
function blocksOnScreen(): Array<[string, string]> {
  const nodes = m!.host.querySelectorAll("[data-testid^='svg-prompt-block-'], [data-testid='svg-confirm-rules']");
  return [...nodes].map((node) => {
    const el = node as HTMLElement;
    const id = el.dataset.testid === "svg-confirm-rules" ? "rules" : String(el.dataset.testid).replace("svg-prompt-block-", "");
    return [id, el instanceof HTMLTextAreaElement ? el.value : el.textContent ?? ""];
  });
}

/** The only two separators there are: a newline after the summary, a blank line elsewhere. */
const joinOnScreen = (blocks: Array<[string, string]>): string =>
  blocks.map(([id, text], i) => (i === 0 ? text : `${id === "positions" ? "\n" : "\n\n"}${text}`)).join("");

const postedText = (body: string): string => JSON.parse(body).messages[0].content[0].text as string;

describe("the full prompt preview", () => {
  it("shows the four parts of the request in order, verbatim", async () => {
    await open(["alder", "birch"]);
    expect(blocksOnScreen()).toEqual([
      ["summary", "Here is a batch of icons arranged in numbered grid order:"],
      ["positions", `1 — ${stemOf("alder")}\n2 — ${stemOf("birch")}`],
      ["protocol", ORDER_LINE],
      ["rules", DEFAULT_SVG_PROMPT],
    ]);
  });

  it("labels the locked parts as required by the app and the rules as editable", async () => {
    await open(["alder", "birch"]);
    expect(text("[data-testid=svg-prompt-note-protocol]")).toContain("locked");
    expect(text("[data-testid=svg-prompt-note-rules]")).toContain("editable");
    expect((q("[data-testid=svg-prompt-block-protocol]") as HTMLElement).tagName).toBe("PRE");
  });

  it("is, joined with the single separators, EXACTLY the text posted to the provider", async () => {
    const calls = stubFetchSeq([okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch")))]);
    await open(["alder", "birch"]);
    const onScreen = joinOnScreen(blocksOnScreen());
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1);
    expect(postedText(calls[0].body)).toBe(onScreen);
  });

  it("shows each request's own text: the pager walks them and the last of nine is the single template", async () => {
    await open(NINE);
    expect(text("[data-testid=svg-confirm-pager-index]")).toBe("1 of 3");
    expect(blocksOnScreen()[1]).toEqual(["positions", NINE.slice(0, 4).map((n, i) => `${i + 1} — ${stemOf(n)}`).join("\n")]);
    await click(m!, "[data-testid=svg-confirm-pager-next]");
    expect(text("[data-testid=svg-confirm-pager-index]")).toBe("2 of 3");
    expect(blocksOnScreen()[1]).toEqual(["positions", NINE.slice(4, 8).map((n, i) => `${i + 1} — ${stemOf(n)}`).join("\n")]);
    await click(m!, "[data-testid=svg-confirm-pager-next]");
    expect(blocksOnScreen().map(([id]) => id)).toEqual(["rules", "naming"]);
    expect(blocksOnScreen()[1][1]).toBe(`Icon name (use it as the SVG <title>): ${stemOf("iris")}`);
    expect((q("[data-testid=svg-confirm-pager-next]") as HTMLButtonElement).disabled).toBe(true);
    await click(m!, "[data-testid=svg-confirm-pager-prev]");
    expect(text("[data-testid=svg-confirm-pager-index]")).toBe("2 of 3");
  });

  it("cannot page past either end", async () => {
    await open(["alder", "birch"]);
    expect((q("[data-testid=svg-confirm-pager-prev]") as HTMLButtonElement).disabled).toBe(true);
    expect((q("[data-testid=svg-confirm-pager-next]") as HTMLButtonElement).disabled).toBe(true);
    expect(text("[data-testid=svg-confirm-pager-index]")).toBe("1 of 1");
  });

  it("writes an edit made in the popup to the tab's textarea in the same render, and the next send carries it", async () => {
    const calls = stubFetchSeq([okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch")))]);
    await open(["alder", "birch"]);
    await typeInto(m!, "[data-testid=svg-confirm-rules]", "Rules typed in the popup.");
    expect((q("[data-testid=svg-prompt]") as HTMLTextAreaElement).value).toBe("Rules typed in the popup.");
    expect(blocksOnScreen()[3]).toEqual(["rules", "Rules typed in the popup."]);
    expect(localStorage.getItem("iconSplitter.svg.prompt.v1")).toContain("Rules typed in the popup.");
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1);
    expect(postedText(calls[0].body).endsWith("\n\nRules typed in the popup.")).toBe(true);
  });

  it("re-derives the preview when the tab's textarea changes while the popup is open", async () => {
    await open(["alder", "birch"]);
    const before = text("[data-testid=svg-confirm-fingerprint]");
    await typeInto(m!, "[data-testid=svg-prompt]", "Typed on the tab.");
    expect((q("[data-testid=svg-confirm-rules]") as HTMLTextAreaElement).value).toBe("Typed on the tab.");
    expect(text("[data-testid=svg-confirm-fingerprint]")).not.toBe(before);
  });

  it("disables Generate now and says why when the rules are empty — it never sends nothing silently", async () => {
    const calls = stubFetchSeq([okReply("x")]);
    await open(["alder", "birch"]);
    expect(q("[data-testid=svg-confirm-empty-rules]")).toBeNull();
    await typeInto(m!, "[data-testid=svg-confirm-rules]", "   ");
    expect((q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).disabled).toBe(true);
    expect(text("[data-testid=svg-confirm-empty-rules]")).toContain("rules are empty");
    await click(m!, "[data-testid=svg-confirm-generate]");
    expect(calls).toHaveLength(0);
    expect(q("[data-testid=svg-confirm]")).not.toBeNull();
    await typeInto(m!, "[data-testid=svg-confirm-rules]", "Back again.");
    expect((q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).disabled).toBe(false);
    expect(q("[data-testid=svg-confirm-empty-rules]")).toBeNull();
  });

  it("says when surrounding spaces will be removed, and only then", async () => {
    await open(["alder", "birch"]);
    expect(q("[data-testid=svg-confirm-rules-note]")).toBeNull();
    await typeInto(m!, "[data-testid=svg-confirm-rules]", "  padded  ");
    expect(text("[data-testid=svg-confirm-rules-note]")).toContain("removed when sent");
    // the editor keeps exactly what was typed; only the text that is SENT is trimmed
    expect((q("[data-testid=svg-confirm-rules]") as HTMLTextAreaElement).value).toBe("  padded  ");
    expect(blocksOnScreen()[3][1]).toBe("  padded  ");
  });

  it("shows the request JSON: equal to the posted body except the image, with the key hidden", async () => {
    const calls = stubFetchSeq([okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch")))]);
    await open(["alder", "birch"]);
    const shown = JSON.parse(text("[data-testid=svg-confirm-json]"));
    const headers = text("[data-testid=svg-confirm-json-headers]");
    expect(headers).toContain("POST https://router.requesty.ai/v1/chat/completions");
    expect(headers).toContain("Content-Type: application/json");
    expect(headers).toContain("Authorization: Bearer ‹hidden›");
    expect(headers).not.toContain(KEY);
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1);
    const posted = JSON.parse(calls[0].body);
    posted.messages[0].content[1].image_url.url = IMAGE_SLOT;
    expect(shown).toEqual(posted);
    expect(shown.messages[0].content[1].image_url.url).toBe(IMAGE_SLOT);
  });

  it("shows the fingerprint of exactly what was posted, and the run fingerprint beside it", async () => {
    const calls = stubFetchSeq([okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch")))]);
    await open(["alder", "birch"]);
    const shown = text("[data-testid=svg-confirm-fingerprint]");
    expect(text("[data-testid=svg-confirm-run-fingerprint]")).toMatch(/^[0-9a-f]{8}\.[0-9a-z]+$/);
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1);
    expect(shown).toContain(fingerprintOf(JSON.parse(calls[0].body)));
  });

  it("states the endpoint, the attempts and the timeout, and describes the settings of the request on screen", async () => {
    await open(["alder", "birch"]);
    expect(text("[data-testid=svg-confirm-endpoint]")).toBe("POST https://router.requesty.ai/v1/chat/completions");
    expect(text("[data-testid=svg-confirm-attempts]")).toBe("up to 3 attempts · 90 s timeout");
    expect(text("[data-testid=svg-confirm-sampling]")).toBe("no temperature · 32 000 max tokens · effort default");
    expect(text("[data-testid=svg-confirm-model]")).toBe(DEFAULT_CONFIG.model);
  });

  it("re-derives when a model-list refresh lands while it is open — and the click sends what is on screen", async () => {
    let models: Response | null = null;
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        return okReply(block(stemOf("alder")) + "\n" + block(stemOf("birch")));
      }
      if (models === null) throw new TypeError("offline");
      return models.clone();
    }));
    await open(["alder", "birch"]);
    const before = text("[data-testid=svg-confirm-sampling]");
    models = new Response(JSON.stringify({ data: [{ id: DEFAULT_CONFIG.model, max_output_tokens: 8000, supports_reasoning: true }] }), { status: 200 });
    if (q("[data-testid=svg-refresh-models]") === null) await click(m!, "[data-testid=svg-provider-toggle]");
    await click(m!, "[data-testid=svg-refresh-models]");
    await until(() => text("[data-testid=svg-confirm-sampling]") !== before);
    expect(text("[data-testid=svg-confirm-sampling]")).toBe("no temperature · 8 000 max tokens · effort default");
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => posts.length === 1);
    expect(JSON.parse(posts[0]).max_completion_tokens).toBe(8000);
  });

  it("builds the contact sheet of the request on screen, not always the first", async () => {
    await open(FIVE);
    await click(m!, "[data-testid=svg-confirm-pager-next]");
    expect(text("[data-testid=svg-composite]")).toContain("request 2 of 2");
    await click(m!, "[data-testid=svg-composite-build]");
    expect(text("[data-testid=svg-composite-meta]")).toMatch(/^1×1 grid/);
    const loaded = vi.mocked(loadImageFile).mock.calls.map((c) => (c[0] as File).name);
    expect(loaded.at(-1)).toBe(`${stemOf("elm")}.png`);
  });

  it("forgets a built contact sheet when another request comes on screen", async () => {
    await open(FIVE);
    await click(m!, "[data-testid=svg-composite-build]");
    expect(q("[data-testid=svg-composite-img]")).not.toBeNull();
    await click(m!, "[data-testid=svg-confirm-pager-next]");
    expect(q("[data-testid=svg-composite-img]")).toBeNull();
  });

  it("copies the exact text of the request on screen", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { written.push(t); } } });
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-copy]");
    expect(written).toEqual([joinOnScreen(blocksOnScreen())]);
    expect(text("[data-testid=svg-confirm-copy-status]")).toBe("Copied request 1 of 1");
  });

  it("says so when the browser blocks the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-copy]");
    expect(text("[data-testid=svg-confirm-copy-status]")).toBe("Clipboard is blocked — select the text and copy it");
  });

  it("sends nothing from Cancel or Close however the text was edited", async () => {
    const calls = stubFetchSeq([okReply("x")]);
    await open(["alder", "birch"]);
    await typeInto(m!, "[data-testid=svg-confirm-rules]", "edited, then abandoned");
    await click(m!, "[data-testid=svg-confirm-cancel]");
    expect(calls).toHaveLength(0);
    expect((q("[data-testid=svg-prompt]") as HTMLTextAreaElement).value).toBe("edited, then abandoned");
  });
});
