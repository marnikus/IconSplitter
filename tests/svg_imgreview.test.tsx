import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import SvgImgReview from "../src/svg/SvgImgReview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("returned composite review", () => {
  it("names every proposed crop and waits for Apply or Discard before saving", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const apply = vi.fn();
    const discard = vi.fn();
    await act(async () => root.render(<SvgImgReview review={{ group: 1, total: 1, mosaic: "blob:mosaic",
      cells: [{ id: "a", name: "first.png", url: "blob:a" }, { id: "b", name: "second.png", url: "blob:b" }], busy: false }}
      onApply={apply} onDiscard={discard} />));
    expect(host.querySelector("[data-testid=svg-img-review] img")?.getAttribute("src")).toBe("blob:mosaic");
    expect(host.textContent).toMatch(/first\.png.*second\.png/s);
    expect(apply).not.toHaveBeenCalled();
    await act(async () => (host.querySelector("[data-testid=svg-img-apply]") as HTMLButtonElement).click());
    expect(apply).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    host.remove();
  });
});
