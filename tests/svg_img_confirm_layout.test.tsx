// svg_img_confirm_layout.test.tsx — the AI source regeneration dialog is a roomy
// reading surface (user request 2026-10-19): wide modal, the prompt BELOW the
// other controls at full width, its box fitted to the whole text (no inner
// scroll) up to a cap tied to the browser height, and no 118px first-child trap.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import SvgImgConfirm from "../src/svg/SvgImgConfirm";
import { DEFAULT_IMAGE_CONNECTION } from "../src/lib/svgconnections";
import { imgConfirmProps } from "./helpers/svgimgconfirm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");
const q = <T extends Element>(sel: string) => host.querySelector(sel) as T | null;

async function mount(prompt: string): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<SvgImgConfirm {...imgConfirmProps({ ids: ["a"], conn: DEFAULT_IMAGE_CONNECTION,
      presets: [{ name: "One", text: "x" }], prompt })} />);
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("regeneration dialog — comfortable reading layout", () => {
  it("lists the controls first and the prompt LAST, full width in its own block", async () => {
    await mount("Redraw this icon");
    const order = ["svg-img-count", "svg-img-provider", "svg-img-prompt-select", "svg-img-prompt", "svg-img-generate"];
    const nodes = order.map((id) => q(`[data-testid=${id}]`)!);
    nodes.forEach((n) => expect(n).not.toBeNull());
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // the prompt never shares a flex row with the preset (that squeezed both)
    expect(q("[data-testid=svg-img-prompt]")!.closest(".svg-provider-fields")).toBeNull();
    expect(q("[data-testid=svg-img-prompt-select]")!.closest(".svg-provider-fields")).toBeNull();
  });

  it("fits the prompt box to its whole text: height = scrollHeight, refit when the text changes", async () => {
    let height = 420;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    await mount("a long prompt");
    const box = q<HTMLTextAreaElement>("[data-testid=svg-img-prompt]")!;
    expect(box.style.height).toBe("420px");
    height = 610;
    await act(async () => { root.render(<SvgImgConfirm {...imgConfirmProps({ ids: ["a"],
      conn: DEFAULT_IMAGE_CONNECTION, prompt: "a much longer prompt ".repeat(40) })} />); });
    expect(box.style.height).toBe("610px");
  });
});

describe("regeneration dialog — CSS contract", () => {
  const rule = (selector: string): string => {
    const m = css().match(new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    expect(m, selector).not.toBeNull();
    return m![1];
  };

  it("the modal is wider than the 760px confirm and capped by the browser height", () => {
    const body = rule(".svg-modal.img-regen");
    expect(body).toMatch(/width:\s*min\((9\d\d|1\d{3})px,\s*9\dvw\)/);
    expect(body).toMatch(/max-height:\s*9\dvh/);
  });

  it("Generate stays reachable: the actions row is pinned to the bottom of the scrolling body", () => {
    expect(rule(".svg-img-body .svg-modal-actions")).toMatch(/position:\s*sticky/);
  });

  it("the prompt box grows to its text but is capped by the viewport; no manual resize handle fights the fit", () => {
    const body = rule(".svg-img-prompt");
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/max-height:[^;]*vh/);
    expect(body).toMatch(/resize:\s*none/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });
});
