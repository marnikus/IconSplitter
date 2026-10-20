import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";
import UploadMetaDialog from "../src/upload/UploadMetaDialog";
import type { UploadApi } from "../src/upload/useUpload";
import type { MetaDialog } from "../src/upload/types";
import { settle as quietSettle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const UPLOAD_PRESETS = [
  { name: "Meta Single SEO", text: "Describe single icon precisely.", savedAt: "2026-10-20T00:00:00Z" },
  { name: "Meta Batch Pack", text: "Consistent pack keywords for batch.", savedAt: "2026-10-20T00:00:00Z" },
  { name: "Meta Regen Fix", text: "Fix forbidden stock words.", savedAt: "2026-10-20T00:00:00Z" },
];

function makeApi(confirmSpy: (promptOverride?: string) => void): UploadApi {
  return {
    prompt: "Main upload editor prompt",
    presets: UPLOAD_PRESETS,
    gemini: DEFAULT_GEMINI_CONFIG,
    dismissDialog: () => undefined,
    confirmMetadata: confirmSpy,
  } as unknown as UploadApi;
}

function makeDialog(mode: "generate" | "regenerate", count: number): MetaDialog {
  const ids = Array.from({ length: count }, (_, i) => `u_${i + 1}`);
  return {
    kind: "meta",
    mode,
    ids,
    preparing: false,
    previews: ids.map((id) => ({ id, name: `${id}.svg`, image: "data:image/jpeg;base64,xx", fingerprint: "1:1" })),
    thenExport: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
});

describe("UploadMetaDialog — 4 independent (generate | regenerate) × (single | batch) prompt slots", () => {
  it("shows default prompt banner above preset list, remembers all 4 slots independently, live-syncs preview, and passes confirmed prompt without clobbering editor", async () => {
    const confirmed: (string | undefined)[] = [];
    const api = makeApi((p) => confirmed.push(p));

    // 1. Open Generate metadata · batch (2 icons)
    await act(async () => {
      ui = createRoot(host);
      ui.render(<UploadMetaDialog g={api} dialog={makeDialog("generate", 2)} />);
    });
    await quietSettle(0);

    const banner = host.querySelector("[data-testid=upload-meta-default-prompt]")!;
    const select = host.querySelector("[data-testid=upload-meta-preset]") as HTMLSelectElement;
    const preview = host.querySelector("[data-testid=upload-meta-prompt]") as HTMLTextAreaElement;
    expect(banner.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.textContent).toBe("Default prompt for Metadata generation · batch (multiple icons): Main editor prompt");
    expect(preview.value).toBe("Main upload editor prompt");

    // Pick "Meta Batch Pack" for upload-generate:batch
    await act(async () => {
      select.value = "Meta Batch Pack";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await quietSettle(0);
    expect(banner.textContent).toBe("Default prompt for Metadata generation · batch (multiple icons): “Meta Batch Pack”");
    expect(preview.value).toBe("Consistent pack keywords for batch.");
    await act(async () => (host.querySelector("[data-testid=upload-meta-confirm]") as HTMLButtonElement).click());
    expect(confirmed).toEqual(["Consistent pack keywords for batch."]);
    expect(api.prompt).toBe("Main upload editor prompt");

    // 2. Open Generate metadata · single icon (1 icon) -> separate default!
    await act(async () => {
      ui.render(<UploadMetaDialog g={api} dialog={makeDialog("generate", 1)} />);
    });
    await quietSettle(0);
    expect(host.querySelector("[data-testid=upload-meta-default-prompt]")?.textContent).toBe(
      "Default prompt for Metadata generation · single icon: Main editor prompt",
    );
    const singleSel = host.querySelector("[data-testid=upload-meta-preset]") as HTMLSelectElement;
    await act(async () => {
      singleSel.value = "Meta Single SEO";
      singleSel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await quietSettle(0);

    // 3. Open Regenerate metadata · batch (3 icons) -> separate default!
    await act(async () => {
      ui.render(<UploadMetaDialog g={api} dialog={makeDialog("regenerate", 3)} />);
    });
    await quietSettle(0);
    expect(host.querySelector("[data-testid=upload-meta-default-prompt]")?.textContent).toBe(
      "Default prompt for Metadata regeneration · batch (multiple icons): Main editor prompt",
    );
    const regenBatchSel = host.querySelector("[data-testid=upload-meta-preset]") as HTMLSelectElement;
    await act(async () => {
      regenBatchSel.value = "Meta Regen Fix";
      regenBatchSel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await quietSettle(0);

    // 4. Open Regenerate metadata · single icon (1 icon) -> separate default!
    await act(async () => {
      ui.render(<UploadMetaDialog g={api} dialog={makeDialog("regenerate", 1)} />);
    });
    await quietSettle(0);
    expect(host.querySelector("[data-testid=upload-meta-default-prompt]")?.textContent).toBe(
      "Default prompt for Metadata regeneration · single icon: Main editor prompt",
    );

    // 5. Re-open Generate metadata · batch -> remembers "Meta Batch Pack"!
    await act(async () => {
      ui.render(<UploadMetaDialog g={api} dialog={makeDialog("generate", 2)} />);
    });
    await quietSettle(0);
    expect(host.querySelector("[data-testid=upload-meta-default-prompt]")?.textContent).toBe(
      "Default prompt for Metadata generation · batch (multiple icons): “Meta Batch Pack”",
    );
    expect((host.querySelector("[data-testid=upload-meta-prompt]") as HTMLTextAreaElement).value).toBe(
      "Consistent pack keywords for batch.",
    );
  });
});
