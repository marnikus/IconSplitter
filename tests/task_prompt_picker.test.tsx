import { act, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { MAIN_PROMPT_VALUE, type PromptScope } from "../src/lib/taskprompts";
import { TaskPromptPicker, useTaskPromptSelection } from "../src/ui/TaskPromptPicker";

const PRESETS = [
  { name: "Single Clean", text: "Single icon instructions", savedAt: "2026-10-20T00:00:00Z" },
  { name: "Batch Grid", text: "Batch grid instructions", savedAt: "2026-10-20T00:00:00Z" },
];

function Harness(p: { initialScope: PromptScope }) {
  const [scope, setScope] = useState<PromptScope>(p.initialScope);
  const sel = useTaskPromptSelection({
    operation: "svg-generate",
    scope,
    presets: PRESETS,
    mainPrompt: "Tab main prompt",
  });
  return (
    <div>
      <button type="button" data-testid="toggle-scope" onClick={() => setScope((s) => (s === "single" ? "batch" : "single"))}>
        Scope: {scope}
      </button>
      <TaskPromptPicker
        selection={sel}
        presets={PRESETS}
        selectTestId="picker-select"
        defaultMsgTestId="picker-default-msg"
        label="Prompt preset"
      />
      <output data-testid="active-text">{sel.resolved.text}</output>
    </div>
  );
}

function mount(node: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    byId: (id: string) => host.querySelector(`[data-testid="${id}"]`),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => localStorage.clear());

describe("TaskPromptPicker — live default banner & independent single/batch memory", () => {
  it("renders default message directly above prompt select, updates live, and remembers single vs batch independently", () => {
    const view = mount(<Harness initialScope="batch" />);

    const banner = view.byId("picker-default-msg")!;
    const select = view.byId("picker-select") as HTMLSelectElement;
    // Banner appears before select in DOM order ("above the prompt list").
    expect(banner.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.textContent).toBe("Default prompt for SVG generation · batch (multiple icons): Main editor prompt");
    expect(select.value).toBe(MAIN_PROMPT_VALUE);
    expect(view.byId("active-text")!.textContent).toBe("Tab main prompt");

    // Pick a batch preset -> updates banner, active text, and localStorage immediately.
    choose(select, "Batch Grid");
    expect(banner.textContent).toBe("Default prompt for SVG generation · batch (multiple icons): “Batch Grid”");
    expect(view.byId("active-text")!.textContent).toBe("Batch grid instructions");

    // Toggle scope to single -> switches to independent single slot (still Main editor prompt).
    act(() => (view.byId("toggle-scope") as HTMLButtonElement).click());
    expect(banner.textContent).toBe("Default prompt for SVG generation · single icon: Main editor prompt");
    expect(select.value).toBe(MAIN_PROMPT_VALUE);
    expect(view.byId("active-text")!.textContent).toBe("Tab main prompt");

    // Pick a single preset -> remembers independently without clobbering batch.
    choose(select, "Single Clean");
    expect(banner.textContent).toBe("Default prompt for SVG generation · single icon: “Single Clean”");
    expect(view.byId("active-text")!.textContent).toBe("Single icon instructions");
    view.unmount();

    // Re-open fresh instance in batch mode -> remembers "Batch Grid"!
    const reopened = mount(<Harness initialScope="batch" />);
    expect(reopened.byId("picker-default-msg")!.textContent).toBe(
      "Default prompt for SVG generation · batch (multiple icons): “Batch Grid”",
    );
    expect((reopened.byId("picker-select") as HTMLSelectElement).value).toBe("Batch Grid");
    expect(reopened.byId("active-text")!.textContent).toBe("Batch grid instructions");
    reopened.unmount();
  });
});
